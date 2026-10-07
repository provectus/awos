#!/usr/bin/env node
/**
 * profile-implement.mjs — deterministic profiler for /awos:implement runs.
 *
 * Usage:
 *   node profile-implement.mjs sessions [--projects <dir>] [--cwd <path>]
 *   node profile-implement.mjs report   [--projects <dir>] [--cwd <path>] [--session <id>]
 *                                       [--run latest|all|<n>] [--json <out-file>] [--now <iso>]
 *   node profile-implement.mjs watch    [--projects <dir>] [--cwd <path>] [--session <id>]
 *                                       [--interval <seconds>] [--once]
 *
 * Reads the Claude Code session transcripts under ~/.claude/projects/<slug>/
 * (the slug is the project cwd with every non-alphanumeric character replaced
 * by "-"), where each session is <id>.jsonl and each subagent it spawned is
 * <id>/subagents/agent-<agentId>.jsonl next to an agent-<agentId>.meta.json
 * carrying agentType, description, spawnDepth and parentAgentId.
 *
 * The transcript format is internal to Claude Code and undocumented; every
 * field access here is defensive and the numbers are derived from timestamps:
 *   - model time      = gap before each assistant line
 *   - tool time       = gap before each user line carrying a tool_result,
 *                       attributed to the tool by tool_use_id
 *   - test time       = tool time of Bash calls whose command runs a test or
 *                       typecheck, unless the result says the command timed out
 *                       or the wait exceeds HANG_SEC (then it is a hang)
 *   - idle            = any gap over IDLE_GAP_SEC, excluded from every bucket
 *                       and reported separately; a gap with no line in any
 *                       transcript on the machine is "no activity on the machine"
 *   - thinking share  = turns whose content carries a thinking block (the
 *                       thinking text itself is redacted in transcripts)
 * Streaming writes several lines per assistant turn with partial usage, so
 * turns are deduplicated by message.id and output_tokens is the max seen.
 *
 * Status of an agent: "done" when its last line is an assistant message with
 * text and no tool call; "waiting on <tool>" when the last line is a tool call;
 * "waiting on model" when the last line is a tool result. A delegator is an
 * agent that called the Agent tool. An empty spawn is a nested agent that
 * made no tool call and finished within two turns.
 *
 * `report` prints Markdown to stdout (and JSON to --json when given).
 * `watch` polls and prints one line per event — DONE, STALL, IDLE, SUMMARY,
 * RUN ENDED — for a host that streams stdout lines as notifications.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const IDLE_GAP_SEC = 1800; // gaps longer than this are idle/sleep, not work
const HANG_SEC = 600; // a single tool wait longer than this is a hang
const TEST_HANG_SEC = 1200; // test suites are slow by nature; hang threshold for them
const DONE_QUIET_SEC = 120; // final text older than this counts as finished
const TEST_RE =
  /\b(npm (run )?test|npx? (vitest|jest|mocha|playwright)|node --test|vitest|jest|pytest|go test|cargo test|tsc\b|mvn test|gradle test)/;
const TIMEOUT_RE = /did not complete within|timed out|moved to the background/i;
const BUILTIN_AGENTS = new Set(['general-purpose', 'fork', 'Explore', 'Plan']);

// ---------- args ----------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    } else args._.push(a);
  }
  return args;
}

export function projectSlug(cwd) {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

function projectsRoot() {
  const configDir =
    process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(configDir, 'projects');
}

function resolveProjectDir(args) {
  if (args.projects) return path.resolve(args.projects);
  const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
  return path.join(projectsRoot(), projectSlug(cwd));
}

// ---------- transcript reading ----------

function readJsonl(file) {
  const rows = [];
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return rows;
  }
  for (const line of text.split('\n')) {
    if (!line.includes('"timestamp"')) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row && typeof row.timestamp === 'string') {
      row.__t = Date.parse(row.timestamp);
      if (!Number.isNaN(row.__t)) rows.push(row);
    }
  }
  rows.sort((a, b) => a.__t - b.__t);
  return rows;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function content(row) {
  const m = row && row.message;
  return m && typeof m === 'object' ? m.content : undefined;
}

function blocks(row) {
  const c = content(row);
  return Array.isArray(c) ? c.filter((x) => x && typeof x === 'object') : [];
}

function textOf(row) {
  const c = content(row);
  if (typeof c === 'string') return c;
  return blocks(row)
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

function isPrompt(row) {
  if (row.type !== 'user' || row.isMeta) return false;
  const c = content(row);
  if (typeof c !== 'string') return false;
  if (c.includes('<task-notification>')) return false;
  if (c.includes('SYSTEM NOTIFICATION')) return false;
  if (c.startsWith('[Request interrupted')) return false;
  return true;
}

function isImplementPrompt(row) {
  if (!isPrompt(row)) return false;
  const c = content(row);
  return (
    c.includes('<command-name>/awos:implement</command-name>') ||
    /^\s*\/awos:implement\b/.test(c)
  );
}

function runEndedText(row) {
  if (row.type !== 'assistant') return null;
  const t = textOf(row);
  if (/Implementation run complete|All tasks complete \(100%\)/.test(t))
    return t;
  return null;
}

// ---------- session discovery ----------

export function listSessions(projectDir) {
  if (!fs.existsSync(projectDir)) return [];
  return fs
    .readdirSync(projectDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const file = path.join(projectDir, f);
      const stat = fs.statSync(file);
      return { id: f.slice(0, -6), file, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function findRuns(mainRows) {
  const runs = [];
  for (let i = 0; i < mainRows.length; i++) {
    if (!isImplementPrompt(mainRows[i])) continue;
    let end = mainRows[mainRows.length - 1].__t;
    let endReason = 'session end';
    let completedText = null;
    for (let j = i + 1; j < mainRows.length; j++) {
      const r = mainRows[j];
      const done = runEndedText(r);
      if (done) {
        completedText = done;
        end = r.__t;
        endReason = 'completed';
        break;
      }
      if (isPrompt(r)) {
        end = r.__t;
        endReason = 'next user prompt';
        break;
      }
    }
    runs.push({
      index: runs.length + 1,
      startRow: i,
      start: mainRows[i].__t,
      end,
      endReason,
      completed: Boolean(completedText),
      completedText,
      prompt: String(content(mainRows[i])).replace(/\s+/g, ' ').slice(0, 160),
    });
  }
  return runs;
}

// ---------- agent profiling ----------

export function profileAgent(rows, meta, now) {
  const agent = {
    id: meta.agentId || null,
    type: meta.agentType || '?',
    description: String(meta.description || ''),
    depth: meta.spawnDepth || 1,
    parent: meta.parentAgentId || null,
    toolUseId: meta.toolUseId || null,
    model: null,
    first: rows.length ? rows[0].__t : null,
    last: rows.length ? rows[rows.length - 1].__t : null,
    wallSec: 0,
    modelSec: 0,
    toolSec: 0,
    toolByName: {},
    testRuns: 0,
    testSec: 0,
    idleSec: 0,
    turns: 0,
    outputTokens: 0,
    thinkingTurns: 0,
    toolCalls: 0,
    agentCalls: [],
    hangs: [],
    longestWait: { sec: 0, what: '' },
    status: 'unknown',
    lastWhat: '',
    isDelegator: false,
    isEmptySpawn: false,
  };
  if (!rows.length) return agent;
  agent.wallSec = (agent.last - agent.first) / 1000;
  const pending = new Map();
  const msgs = new Map();
  let prev = null;
  let lastKind = 'unknown';
  for (const row of rows) {
    const gap = prev ? (row.__t - prev) / 1000 : 0;
    // A long wait on a tool result is a hang candidate, not idle: the run
    // level reclassifies it as idle only if nothing on the machine was active.
    const toolWait =
      row.type === 'user' && blocks(row).some((b) => b.type === 'tool_result');
    const idle = gap > IDLE_GAP_SEC && !toolWait;
    if (idle) agent.idleSec += gap;
    if (row.type === 'assistant') {
      if (prev && !idle) agent.modelSec += gap;
      const m = row.message || {};
      if (!agent.model && typeof m.model === 'string') agent.model = m.model;
      const id = m.id || `${row.__t}`;
      const entry = msgs.get(id) || { out: 0, think: false };
      const u = m.usage || {};
      entry.out = Math.max(entry.out, Number(u.output_tokens) || 0);
      let hasText = false;
      let hasTool = false;
      for (const b of blocks(row)) {
        if (b.type === 'thinking') entry.think = true;
        if (b.type === 'text' && String(b.text || '').trim()) hasText = true;
        if (b.type === 'tool_use') {
          hasTool = true;
          agent.toolCalls++;
          const input = b.input && typeof b.input === 'object' ? b.input : {};
          const cmd = typeof input.command === 'string' ? input.command : '';
          pending.set(b.id, { name: b.name || '?', cmd, at: row.__t });
          agent.lastWhat =
            `${b.name || '?'} ${(cmd || input.description || '').replace(/\s+/g, ' ').slice(0, 80)}`.trim();
          // A fork inherits its parent's transcript, including the Agent
          // call that created it; that call is not a delegation by the fork.
          if (b.name === 'Agent' && b.id !== agent.toolUseId) {
            agent.agentCalls.push({
              toolUseId: b.id,
              subagentType: input.subagent_type || '?',
              description: input.description || '',
            });
          }
        }
      }
      msgs.set(id, entry);
      lastKind = hasTool ? 'tool_use' : hasText ? 'final_text' : 'assistant';
    } else if (row.type === 'user') {
      const results = blocks(row).filter((b) => b.type === 'tool_result');
      if (results.length) {
        lastKind = 'tool_result';
        for (const r of results) {
          const call = pending.get(r.tool_use_id);
          const name = call ? call.name : '?';
          if (prev && !idle) {
            agent.toolSec += gap;
            agent.toolByName[name] = (agent.toolByName[name] || 0) + gap;
          }
          const resultText =
            typeof r.content === 'string'
              ? r.content
              : Array.isArray(r.content)
                ? r.content.map((x) => (x && x.text) || '').join(' ')
                : '';
          const what = call
            ? `${name} ${call.cmd.replace(/\s+/g, ' ').slice(0, 80)}`.trim()
            : name;
          const isTest =
            Boolean(call) &&
            name === 'Bash' &&
            TEST_RE.test(call.cmd) &&
            !TIMEOUT_RE.test(resultText);
          if (gap > agent.longestWait.sec)
            agent.longestWait = { sec: gap, what };
          if (gap > (isTest ? TEST_HANG_SEC : HANG_SEC)) {
            agent.hangs.push({
              sec: gap,
              what,
              from: call ? call.at : prev,
              to: row.__t,
              at: new Date(call ? call.at : row.__t).toISOString(),
            });
          } else if (isTest) {
            agent.testRuns++;
            agent.testSec += gap;
          }
        }
      } else if (typeof content(row) === 'string') {
        lastKind = 'user_message';
      }
    }
    prev = row.__t;
  }
  agent.turns = msgs.size;
  for (const e of msgs.values()) {
    agent.outputTokens += e.out;
    if (e.think) agent.thinkingTurns++;
  }
  agent.isDelegator = agent.agentCalls.length > 0;
  agent.isEmptySpawn =
    agent.depth > 1 && agent.toolCalls === 0 && agent.turns <= 2;
  const quiet = (now - agent.last) / 1000;
  if (lastKind === 'final_text' && quiet > DONE_QUIET_SEC)
    agent.status = 'done';
  else if (lastKind === 'final_text') agent.status = 'finishing';
  else if (lastKind === 'tool_use')
    agent.status = `waiting on ${agent.lastWhat || 'a tool'}`;
  else if (lastKind === 'tool_result' || lastKind === 'user_message')
    agent.status = 'waiting on model';
  else agent.status = 'active';
  agent.quietSec = quiet;
  return agent;
}

export function loadAgents(sessionDir, now) {
  const dir = path.join(sessionDir, 'subagents');
  if (!fs.existsSync(dir)) return [];
  const agents = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.meta.json')) continue;
    const agentId = f.slice('agent-'.length, -'.meta.json'.length);
    const meta = readJson(path.join(dir, f));
    meta.agentId = agentId;
    const rows = readJsonl(path.join(dir, `agent-${agentId}.jsonl`));
    if (!rows.length) continue;
    agents.push(profileAgent(rows, meta, now));
  }
  agents.sort((a, b) => a.first - b.first);
  return agents;
}

// ---------- machine-activity check ----------

function machineActiveDuring(projectsDir, fromMs, toMs, excludeFile) {
  if (!fs.existsSync(projectsDir)) return null;
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();
  const re = /"timestamp":"([0-9]{4}-[0-9]{2}-[0-9]{2}T[^"]+)"/g;
  let hits = 0;
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 4) walk(p, depth + 1);
        continue;
      }
      if (!e.name.endsWith('.jsonl') || p === excludeFile) continue;
      let stat;
      try {
        stat = fs.statSync(p);
      } catch {
        continue;
      }
      if (stat.mtimeMs < fromMs) continue; // last written before the gap began
      let text;
      try {
        text = fs.readFileSync(p, 'utf8');
      } catch {
        continue;
      }
      for (const line of text.split('\n')) {
        let m;
        re.lastIndex = 0;
        let candidate = false;
        while ((m = re.exec(line))) {
          if (m[1] >= fromIso && m[1] <= toIso) candidate = true;
        }
        if (!candidate) continue;
        try {
          const row = JSON.parse(line);
          if (
            typeof row.timestamp === 'string' &&
            row.timestamp >= fromIso &&
            row.timestamp <= toIso
          )
            hits++;
        } catch {
          /* ignore */
        }
        if (hits > 3) return;
      }
    }
  };
  walk(projectsDir, 0);
  return hits > 0;
}

// ---------- run profiling ----------

export function profileRun(ctx, run) {
  const { mainRows, agents, now, mainModel } = ctx;
  const live = !run.completed && run.endReason === 'session end';
  const end = live ? now : Math.min(run.end, now);
  const inRun = agents.filter((a) => a.first >= run.start && a.first <= end);
  const byId = new Map(inRun.map((a) => [a.id, a]));
  const byToolUse = new Map(
    inRun.filter((a) => a.toolUseId).map((a) => [a.toolUseId, a])
  );
  for (const a of inRun) {
    a.children = a.agentCalls
      .map((c) => byToolUse.get(c.toolUseId))
      .filter(Boolean)
      .map((c) => c.id);
    if (!a.parent) {
      for (const p of inRun)
        if (p.agentCalls.some((c) => c.toolUseId === a.toolUseId))
          a.parent = p.id;
    }
  }

  // orchestrator buckets over the run window
  const orch = { modelSec: 0, toolSec: 0, idleSec: 0, handoffs: [] };
  let prev = null;
  let lastNotification = null;
  const rowsInRun = mainRows.filter((r) => r.__t >= run.start && r.__t <= end);
  const bigGaps = [];
  for (const row of rowsInRun) {
    const gap = prev ? (row.__t - prev) / 1000 : 0;
    const idle = gap > IDLE_GAP_SEC;
    if (idle) {
      orch.idleSec += gap;
      bigGaps.push({ from: prev, to: row.__t, sec: gap });
    }
    if (row.type === 'assistant') {
      if (prev && !idle) orch.modelSec += gap;
      for (const b of blocks(row)) {
        if (
          b.type === 'tool_use' &&
          b.name === 'Agent' &&
          lastNotification !== null
        ) {
          const h = (row.__t - lastNotification) / 1000;
          if (h > 0 && h < IDLE_GAP_SEC) orch.handoffs.push(h);
          lastNotification = null;
        }
      }
    } else if (row.type === 'user') {
      const c = content(row);
      if (blocks(row).some((b) => b.type === 'tool_result') && prev && !idle)
        orch.toolSec += gap;
      if (typeof c === 'string' && c.includes('<task-notification>'))
        lastNotification = row.__t;
    }
    prev = row.__t;
  }

  // classify big gaps: activity elsewhere on the machine, or none
  for (const g of bigGaps) {
    const active = machineActiveDuring(
      ctx.projectsDir,
      g.from + 60_000,
      g.to - 60_000,
      ctx.mainFile
    );
    g.machine = active === null ? 'unknown' : active ? 'active' : 'inactive';
  }
  // a hang that overlaps a gap with no activity anywhere on the machine is idle, not a hang
  for (const a of inRun) {
    const kept = [];
    for (const h of a.hangs) {
      const inactive = bigGaps.some(
        (g) => g.machine === 'inactive' && h.from < g.to && h.to > g.from
      );
      if (inactive) {
        a.idleSec += h.sec;
        a.toolSec -= h.sec;
      } else kept.push(h);
    }
    a.hangs = kept;
  }

  // concurrency
  const events = [];
  for (const a of inRun) {
    events.push([a.first, 1]);
    events.push([Math.min(a.last, end), -1]);
  }
  events.sort((x, y) => x[0] - y[0]);
  const concurrency = {};
  let running = 0;
  let cursor = run.start;
  for (const [t, d] of events) {
    const key = Math.min(running, 3);
    concurrency[key] = (concurrency[key] || 0) + (t - cursor) / 1000;
    running += d;
    cursor = t;
  }
  concurrency[Math.min(running, 3)] =
    (concurrency[Math.min(running, 3)] || 0) + (end - cursor) / 1000;

  const working = inRun.filter((a) => !a.isDelegator && !a.isEmptySpawn);
  const sum = (arr, k) => arr.reduce((s, a) => s + a[k], 0);
  const turns = sum(working, 'turns');
  const totals = {
    wallSec: (end - run.start) / 1000,
    agents: inRun.length,
    workingAgents: working.length,
    delegators: inRun.filter((a) => a.isDelegator).length,
    emptySpawns: inRun.filter((a) => a.isEmptySpawn).length,
    subagentModelSec: sum(working, 'modelSec'),
    subagentToolSec: sum(working, 'toolSec'),
    subagentTestSec: sum(working, 'testSec'),
    subagentTestRuns: sum(working, 'testRuns'),
    subagentIdleSec: sum(inRun, 'idleSec'),
    hangSec: inRun.reduce(
      (s, a) => s + a.hangs.reduce((x, h) => x + h.sec, 0),
      0
    ),
    orchestratorModelSec: orch.modelSec,
    orchestratorToolSec: orch.toolSec,
    orchestratorIdleSec: orch.idleSec,
    turns,
    secPerTurn: turns ? sum(working, 'modelSec') / turns : 0,
    tokensPerTurn: turns ? sum(working, 'outputTokens') / turns : 0,
    thinkingShare: turns ? sum(working, 'thinkingTurns') / turns : 0,
    medianWallMin: median(working.map((a) => (a.wallSec - a.idleSec) / 60)),
    medianHandoffSec: median(orch.handoffs),
  };
  const stalls = live
    ? inRun.filter(
        (a) =>
          a.status.startsWith('waiting') &&
          a.quietSec > HANG_SEC &&
          !a.isDelegator
      )
    : [];
  const hangs = inRun.flatMap((a) =>
    a.hangs.map((h) => ({ ...h, agent: a.description, type: a.type }))
  );
  const effortLeaks = inRun.filter(
    (a) =>
      !a.isEmptySpawn &&
      (BUILTIN_AGENTS.has(a.type) ||
        (mainModel && a.model === mainModel && a.type !== 'fork')) &&
      a.model &&
      a.model === mainModel
  );
  return {
    run,
    live,
    totals,
    agents: inRun,
    working,
    stalls,
    hangs,
    effortLeaks,
    bigGaps,
    concurrency,
    orch,
    byId,
  };
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---------- context ----------

export function loadContext(projectDir, sessionId, now) {
  const sessions = listSessions(projectDir);
  let session = sessionId ? sessions.find((s) => s.id === sessionId) : null;
  if (!session && !sessionId) {
    session =
      sessions.find((s) => findRuns(readJsonl(s.file)).length > 0) ||
      sessions[0];
  }
  if (!session) return null;
  const mainRows = readJsonl(session.file);
  const mainModel =
    (
      mainRows.find(
        (r) => r.type === 'assistant' && r.message && r.message.model
      ) || {}
    ).message?.model || null;
  const agents = loadAgents(path.join(projectDir, session.id), now);
  return {
    projectDir,
    projectsDir: path.dirname(projectDir),
    session,
    mainFile: session.file,
    mainRows,
    mainModel,
    agents,
    runs: findRuns(mainRows),
    now,
  };
}

// ---------- formatting ----------

const min = (sec) => `${(sec / 60).toFixed(1)} min`;
const hrs = (sec) => `${(sec / 3600).toFixed(2)} h`;
const pct = (x) => `${Math.round(x * 100)}%`;
const iso = (ms) =>
  new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

export function renderRun(p, ctx) {
  const {
    run,
    totals,
    agents,
    stalls,
    hangs,
    effortLeaks,
    bigGaps,
    concurrency,
  } = p;
  const out = [];
  out.push(
    `## Implement run ${run.index} — ${iso(run.start)} → ${iso(run.end)} (${hrs(totals.wallSec)})`
  );
  out.push('');
  out.push(
    `Session \`${ctx.session.id}\`, orchestrator model \`${ctx.mainModel || '?'}\`. ${run.completed ? "Completed with the orchestrator's completion line" : run.endReason === 'next user prompt' ? 'Ended by the next user prompt, no completion line' : 'Still running or ended without a completion line'}.`
  );
  out.push('');
  out.push('### Where the time went');
  out.push('');
  out.push('| Bucket | Time |');
  out.push('| --- | --- |');
  out.push(`| Subagent model generation | ${hrs(totals.subagentModelSec)} |`);
  out.push(`| Subagent tool execution | ${hrs(totals.subagentToolSec)} |`);
  out.push(
    `| of which test / typecheck runs (${totals.subagentTestRuns} runs) | ${hrs(totals.subagentTestSec)} |`
  );
  out.push(
    `| Hung tool calls (over ${HANG_SEC / 60} min each) | ${hrs(totals.hangSec)} |`
  );
  out.push(
    `| Orchestrator own generation | ${hrs(totals.orchestratorModelSec)} |`
  );
  out.push(
    `| Orchestrator waiting on its own tools | ${hrs(totals.orchestratorToolSec)} |`
  );
  out.push(
    `| Idle gaps over ${IDLE_GAP_SEC / 60} min (main session) | ${hrs(totals.orchestratorIdleSec)} |`
  );
  out.push('');
  out.push(
    `Wall-clock by subagents running at once: ${Object.entries(concurrency)
      .map(([k, v]) => `${k === '3' ? '3+' : k}: ${min(v)}`)
      .join(
        ', '
      )}. Subagent hours exceed wall-clock when agents run in parallel.`
  );
  out.push('');
  out.push('### Rates');
  out.push('');
  out.push('| Measure | Value |');
  out.push('| --- | --- |');
  out.push(
    `| Working agents / delegators / empty spawns | ${totals.workingAgents} / ${totals.delegators} / ${totals.emptySpawns} |`
  );
  out.push(
    `| Median active wall-clock per working agent | ${totals.medianWallMin.toFixed(1)} min |`
  );
  out.push(
    `| Seconds of generation per API turn | ${totals.secPerTurn.toFixed(1)} s |`
  );
  out.push(
    `| Output tokens per turn (thinking included) | ${Math.round(totals.tokensPerTurn)} |`
  );
  out.push(
    `| Turns carrying a thinking block | ${pct(totals.thinkingShare)} |`
  );
  out.push(
    `| Median orchestrator handoff (subagent done → next Agent call) | ${totals.medianHandoffSec.toFixed(0)} s |`
  );
  out.push('');
  if (bigGaps.length) {
    out.push('### Long gaps in the main session');
    out.push('');
    for (const g of bigGaps) {
      out.push(
        `- ${iso(g.from)} → ${iso(g.to)}: ${hrs(g.sec)}, machine ${g.machine}${g.machine === 'inactive' ? ' (no transcript on this machine has a line in the gap)' : ''}`
      );
    }
    out.push('');
  }
  if (hangs.length || stalls.length) {
    out.push('### Hangs and stalls');
    out.push('');
    for (const h of hangs)
      out.push(
        `- HANG ${min(h.sec)} at ${h.at.slice(0, 16).replace('T', ' ')} UTC in ${h.type} "${h.agent}": ${h.what}`
      );
    for (const s of stalls)
      out.push(
        `- STALL ${min(s.quietSec)} and counting in ${s.type} "${s.description}": ${s.status}`
      );
    out.push('');
  }
  if (effortLeaks.length) {
    out.push('### Agents running on the orchestrator model');
    out.push('');
    out.push(
      'Built-in agent types have no agent file, so they inherit the session model and effort instead of the specialist settings:'
    );
    for (const a of effortLeaks)
      out.push(
        `- ${a.type} "${a.description}" on ${a.model}: ${(a.modelSec / Math.max(a.turns, 1)).toFixed(1)} s/turn, ${pct(a.thinkingTurns / Math.max(a.turns, 1))} thinking turns`
      );
    out.push('');
  }
  const chains = agents.filter((a) => a.isDelegator);
  if (chains.length) {
    out.push('### Delegation chains');
    out.push('');
    for (const a of chains) {
      const kids = a.children.map((id) => p.byId.get(id)).filter(Boolean);
      out.push(
        `- ${a.type} "${a.description}" (depth ${a.depth}, ${a.turns} own turns) → ${kids.map((k) => `${k.type} "${k.description}"${k.isEmptySpawn ? ' [empty spawn]' : ''}`).join(', ') || a.agentCalls.map((c) => c.subagentType).join(', ')}`
      );
    }
    out.push('');
  }
  out.push('### Agents');
  out.push('');
  out.push(
    '| Start | Depth | Type | Model | Description | Wall | Model | Tool | Tests | Turns | s/turn | tok/turn | Think | Longest wait | Status |'
  );
  out.push(
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  );
  for (const a of agents) {
    const t = Math.max(a.turns, 1);
    out.push(
      `| ${new Date(a.first).toISOString().slice(11, 16)} | ${a.depth} | ${a.type} | ${(a.model || '?').replace('claude-', '')} | ${a.description.slice(0, 40)}${a.isDelegator ? ' [delegator]' : ''}${a.isEmptySpawn ? ' [empty]' : ''} | ${min(a.wallSec - a.idleSec)} | ${min(a.modelSec)} | ${min(a.toolSec)} | ${a.testRuns}×${min(a.testSec)} | ${a.turns} | ${(a.modelSec / t).toFixed(1)} | ${Math.round(a.outputTokens / t)} | ${pct(a.thinkingTurns / t)} | ${min(a.longestWait.sec)} ${a.longestWait.what.slice(0, 40)} | ${a.status} |`
    );
  }
  out.push('');
  return out.join('\n');
}

// ---------- commands ----------

function cmdSessions(args) {
  const projectDir = resolveProjectDir(args);
  const sessions = listSessions(projectDir);
  if (!sessions.length) {
    console.log(`No sessions under ${projectDir}`);
    return 1;
  }
  console.log(`Sessions under ${projectDir} (newest first):`);
  for (const s of sessions) {
    const runs = findRuns(readJsonl(s.file));
    if (!runs.length) continue;
    console.log(
      `- ${s.id}  last write ${new Date(s.mtime).toISOString().slice(0, 16).replace('T', ' ')} UTC  implement runs: ${runs.length}`
    );
  }
  return 0;
}

function cmdReport(args) {
  const now = args.now ? Date.parse(args.now) : Date.now();
  const projectDir = resolveProjectDir(args);
  const ctx = loadContext(projectDir, args.session, now);
  if (!ctx) {
    console.log(
      `No session transcripts under ${projectDir}. Pass --projects <dir> or --session <id>.`
    );
    return 1;
  }
  if (!ctx.runs.length) {
    console.log(`Session ${ctx.session.id} has no /awos:implement run.`);
    return 1;
  }
  const which = args.run || 'latest';
  const selected =
    which === 'all'
      ? ctx.runs
      : which === 'latest'
        ? [ctx.runs[ctx.runs.length - 1]]
        : ctx.runs.filter((r) => String(r.index) === String(which));
  if (!selected.length) {
    console.log(`No run "${which}" — session has runs 1..${ctx.runs.length}.`);
    return 1;
  }
  const profiles = selected.map((r) => profileRun(ctx, r));
  const md = [`# /awos:implement profile — ${path.basename(projectDir)}`, ''];
  md.push(
    `Transcripts: \`${ctx.session.file}\` and its \`subagents/\`. Thinking text is redacted in transcripts; the thinking share counts turns that carry a thinking block. Idle gaps over ${IDLE_GAP_SEC / 60} min are excluded from every bucket.`
  );
  md.push('');
  for (const p of profiles) md.push(renderRun(p, ctx));
  console.log(md.join('\n'));
  if (args.json) {
    const json = profiles.map((p) => ({
      run: {
        ...p.run,
        start: new Date(p.run.start).toISOString(),
        end: new Date(p.run.end).toISOString(),
      },
      totals: p.totals,
      concurrency: p.concurrency,
      bigGaps: p.bigGaps.map((g) => ({
        ...g,
        from: new Date(g.from).toISOString(),
        to: new Date(g.to).toISOString(),
      })),
      hangs: p.hangs,
      stalls: p.stalls.map((s) => ({
        id: s.id,
        type: s.type,
        description: s.description,
        quietSec: s.quietSec,
        status: s.status,
      })),
      effortLeaks: p.effortLeaks.map((a) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        model: a.model,
      })),
      agents: p.agents.map((a) => ({
        ...a,
        first: new Date(a.first).toISOString(),
        last: new Date(a.last).toISOString(),
      })),
    }));
    fs.writeFileSync(
      args.json,
      JSON.stringify(
        {
          session: ctx.session.id,
          mainModel: ctx.mainModel,
          generatedAt: new Date(now).toISOString(),
          runs: json,
        },
        null,
        2
      )
    );
  }
  return 0;
}

function cmdWatch(args) {
  const projectDir = resolveProjectDir(args);
  const interval = Math.max(30, Number(args.interval) || 300) * 1000;
  const reported = new Set();
  const stalled = new Set();
  let lastSummary = Date.now();
  let idleFlagged = false;
  const line = (s) => process.stdout.write(s + '\n');
  const tick = () => {
    const now = args.now ? Date.parse(args.now) : Date.now();
    const ctx = loadContext(projectDir, args.session, now);
    if (!ctx || !ctx.runs.length) {
      line(`WAITING no /awos:implement run found under ${projectDir}`);
      return false;
    }
    const run = ctx.runs[ctx.runs.length - 1];
    const p = profileRun(ctx, run);
    for (const a of p.agents) {
      const t = Math.max(a.turns, 1);
      if (!reported.has(a.id) && a.status === 'done') {
        reported.add(a.id);
        const tag = a.depth > 1 ? ` [depth ${a.depth}]` : '';
        if (a.isEmptySpawn)
          line(
            `EMPTY${tag} ${a.type} "${a.description}": finished in ${a.turns} turns with no tool call — a fork or skill invoked without a task`
          );
        else if (a.isDelegator)
          line(
            `DONE (delegator)${tag} ${a.type} "${a.description}": ${min(a.wallSec - a.idleSec)}, ${a.turns} own turns, handed work to ${a.agentCalls.map((c) => c.subagentType).join(', ')}`
          );
        else
          line(
            `DONE${tag} ${a.type} "${a.description}": wall ${min(a.wallSec - a.idleSec)}, model ${min(a.modelSec)}, tool ${min(a.toolSec)}, tests ${a.testRuns}×${min(a.testSec)}, ${a.turns} turns, ${(a.modelSec / t).toFixed(1)} s/turn, ${Math.round(a.outputTokens / t)} tok/turn, think ${pct(a.thinkingTurns / t)}${a.model === ctx.mainModel && BUILTIN_AGENTS.has(a.type) ? ` — on the orchestrator model ${a.model}` : ''}`
          );
      }
      if (
        !reported.has(a.id) &&
        !stalled.has(a.id) &&
        a.status.startsWith('waiting') &&
        !a.isDelegator &&
        a.quietSec > HANG_SEC
      ) {
        stalled.add(a.id);
        line(
          `STALL${a.depth > 1 ? ` [depth ${a.depth}]` : ''} ${a.type} "${a.description}": silent ${min(a.quietSec)}, ${a.status}`
        );
      }
    }
    const mainQuiet = (now - ctx.mainRows[ctx.mainRows.length - 1].__t) / 1000;
    const anyLive = p.agents.some((a) => a.quietSec < HANG_SEC);
    if (mainQuiet > 900 && !anyLive && !idleFlagged && !run.completed) {
      idleFlagged = true;
      line(
        `IDLE orchestrator and every subagent silent for ${min(mainQuiet)} — the run may be waiting on you or stopped`
      );
    }
    const ended = run.completed || run.endReason === 'next user prompt';
    if (Date.now() - lastSummary > 1800 * 1000 || ended) {
      lastSummary = Date.now();
      const t = p.totals;
      line(
        `SUMMARY ${hrs(t.wallSec)} elapsed: ${t.workingAgents} working agents (${p.agents.filter((a) => a.status !== 'done').length} live) | median ${t.medianWallMin.toFixed(1)} min/agent | ${t.secPerTurn.toFixed(1)} s/turn | ${Math.round(t.tokensPerTurn)} tok/turn | think ${pct(t.thinkingShare)} | model ${hrs(t.subagentModelSec)} tool ${hrs(t.subagentToolSec)} tests ${hrs(t.subagentTestSec)} hangs ${hrs(t.hangSec)}`
      );
    }
    if (ended) {
      line(
        `RUN ENDED ${run.completed ? run.completedText.replace(/\s+/g, ' ').slice(0, 160) : 'by the next user prompt'}`
      );
      return true;
    }
    return false;
  };
  if (args.once) return tick() ? 0 : 0;
  line(`WATCHING ${projectDir} every ${interval / 1000}s`);
  const loop = () => {
    let done = false;
    try {
      done = tick();
    } catch (err) {
      line(`ERROR ${err && err.message ? err.message : err}`);
    }
    if (!done) setTimeout(loop, interval);
  };
  loop();
  return null;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  let code;
  if (cmd === 'sessions') code = cmdSessions(args);
  else if (cmd === 'report') code = cmdReport(args);
  else if (cmd === 'watch') code = cmdWatch(args);
  else {
    console.log(
      'Usage: profile-implement.mjs <sessions|report|watch> [--projects <dir>] [--cwd <path>] [--session <id>] [--run latest|all|<n>] [--json <file>] [--interval <sec>] [--once] [--now <iso>]'
    );
    code = 2;
  }
  if (code !== null && code !== undefined) process.exitCode = code;
}
