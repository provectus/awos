#!/usr/bin/env node
/**
 * profile-implement.mjs — deterministic profiler for /awos:implement and
 * /better:implement runs.
 *
 * Usage:
 *   node profile-implement.mjs sessions [--projects <dir>] [--cwd <path>]
 *   node profile-implement.mjs report   [--projects <dir>] [--cwd <path>] [--session <id>]
 *                                       [--run latest|all|<n>] [--json <out-file>] [--now <iso>]
 *                                       [--sleep-log <pmset-log-file>|none] [--run-md <path>]
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
 *   - asleep          = time the machine slept, taken out of every gap before
 *                       the buckets above: from `pmset -g log` on macOS (or
 *                       --sleep-log <file>) and, in any transcript of the
 *                       session, the gap before an "API Error: Your computer
 *                       went to sleep" line
 *   - user wait       = typed prompts inside the run, plus each AskUserQuestion
 *                       call from the call to its answer (not idle, not tool time)
 *   - thinking share  = turns whose content carries a thinking block (the
 *                       thinking text itself is redacted in transcripts)
 * Streaming writes several lines per assistant turn with partial usage, so
 * turns are deduplicated by message.id and each usage field is the max seen.
 * Context at a turn = input_tokens + cache_creation_input_tokens +
 * cache_read_input_tokens; each agent gets its peak and final context, and
 * the compact_boundary lines in its transcript are listed as compactions,
 * each marked as after a pause or during work by the time since the agent's
 * previous model turn.
 *
 * Status of an agent: "done" when its last line is an assistant message with
 * text and no tool call; "waiting on <tool>" when the last line is a tool call;
 * "waiting on model" when the last line is a tool result. A delegator is an
 * agent that called the Agent tool. An empty spawn is a nested agent that
 * made no tool call and finished within two turns.
 *
 * Units (/better:implement only): the run's run.md, found as the first
 * context/spec/<dir>/run.md path in the run's main-transcript lines resolved
 * against that line's cwd (or --run-md <path>), names the unit each
 * top-level subagent did, matched by its description ("Unit 2.1 …",
 * "Verify §2.1 …", "Rework §2.1 …"). No time is read from run.md.
 *
 * `report` prints Markdown to stdout (and JSON to --json when given).
 * `watch` polls and prints one line per event — DONE, STALL, IDLE, SUMMARY,
 * RUN ENDED — for a host that streams stdout lines as notifications.
 */

import { execFileSync } from 'node:child_process';
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
// Claude Code writes this as an assistant line when a request was cut by the
// machine going to sleep; the gap before it is (mostly) sleep.
const SLEEP_ERROR_RE = /^\s*API Error: Your computer went to sleep/i;

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

// ---------- time intervals ----------

// Intervals are [fromMs, toMs] pairs.
export function mergeIntervals(list) {
  const s = list
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function overlapSec(intervals, from, to) {
  let ms = 0;
  for (const [a, b] of intervals) {
    if (b <= from) continue;
    if (a >= to) break;
    ms += Math.min(b, to) - Math.max(a, from);
  }
  return ms / 1000;
}

function subtractIntervals(list, cut) {
  const out = [];
  for (const [a0, b] of list) {
    let a = a0;
    for (const [c, d] of cut) {
      if (d <= a || c >= b) continue;
      if (c > a) out.push([a, c]);
      a = Math.max(a, d);
    }
    if (a < b) out.push([a, b]);
  }
  return out;
}

// ---------- machine sleep ----------

// macOS power log (`pmset -g log`): a sleep starts at "Sleep  Entering Sleep
// state" and ends at the next "Wake" or "DarkWake" line. "Entering DarkWake
// state" (display off, system running) and "Wake Requests" are not sleep
// edges. A DarkWake is short maintenance time; the machine runs, so it is
// awake time here.
export function parsePmsetLog(text) {
  const re =
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2}) (Sleep|Wake|DarkWake)\s+(.*)$/;
  const out = [];
  let start = null;
  for (const line of String(text).split('\n')) {
    const m = re.exec(line);
    if (!m) continue;
    const t = Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
    if (Number.isNaN(t)) continue;
    const [kind, rest] = [m[5], m[6]];
    if (kind === 'Sleep' && /^Entering Sleep state/.test(rest)) {
      if (start === null) start = t;
    } else if (
      (kind === 'Wake' || kind === 'DarkWake') &&
      !/^Requests\b/.test(rest) &&
      start !== null
    ) {
      out.push([start, t]);
      start = null;
    }
  }
  return out;
}

// --sleep-log <file> reads a saved `pmset -g log`; --sleep-log none turns
// the OS source off. Without the flag, macOS is asked directly (it keeps
// about a week of history). Other systems: transcript markers only.
function osSleepIntervals(args) {
  const opt = args && args['sleep-log'];
  if (opt === 'none') return { intervals: [], source: null };
  if (typeof opt === 'string') {
    try {
      return {
        intervals: parsePmsetLog(fs.readFileSync(opt, 'utf8')),
        source: opt,
      };
    } catch {
      return { intervals: [], source: null };
    }
  }
  if (process.platform !== 'darwin') return { intervals: [], source: null };
  try {
    const text = execFileSync('pmset', ['-g', 'log'], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      timeout: 20000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { intervals: parsePmsetLog(text), source: 'pmset -g log' };
  } catch {
    return { intervals: [], source: null };
  }
}

function isSleepError(row) {
  return row.type === 'assistant' && SLEEP_ERROR_RE.test(textOf(row));
}

// The gap before a "computer went to sleep" error line, in the same
// transcript, counts as sleep. It also holds the request's generation time
// before the machine slept, so it can overstate sleep by a few seconds.
export function sleepMarkers(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i++)
    if (isSleepError(rows[i])) out.push([rows[i - 1].__t, rows[i].__t]);
  return out;
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
  // Background teammates report back as user-role messages; they are agent
  // traffic, not the user typing.
  if (c.includes('<teammate-message')) return false;
  // The host echoes back the output of a local slash command such as /login
  // and of a `!` shell command; only the command the user typed is a prompt.
  if (
    /^\s*<(local-command-(stdout|stderr|caveat)|bash-(stdout|stderr))>/.test(c)
  )
    return false;
  // Usage-limit notices are injected by the host, not typed by the user.
  if (
    /^\s*\[?(Usage limit reached|Earlier usage-limit notes|Your claude\.ai usage limit)/i.test(
      c
    )
  )
    return false;
  return true;
}

function isImplementPrompt(row) {
  if (!isPrompt(row)) return false;
  const c = content(row);
  // Core /awos:implement and the better plugin's /better:implement share
  // the completion line, so both are runs this profiler reads.
  return (
    /<command-name>\/(awos|better):implement<\/command-name>/.test(c) ||
    /^\s*\/(awos|better):implement\b/.test(c)
  );
}

// A prompt that starts another AWOS command (/awos:… or the better plugin's
// /better:…) ends the current run. Any other prompt — an answer, "continue",
// /login after an expired session — happens inside the run and is recorded
// as an intervention.
function isAwosCommandPrompt(row) {
  const c = content(row);
  return (
    /<command-name>\/(awos|better):/.test(c) || /^\s*\/(awos|better):/.test(c)
  );
}

// implement.md asks for "All tasks complete (100%). Run /awos:verify …" or
// "Implementation run complete. N/M tasks done", but models paraphrase it
// ("All tasks complete.", "**All 50 tasks complete (100%)**") or drop the
// first sentence and keep only the closing pointer to /awos:verify, which
// implement.md gives only when every task is done. The "All … tasks
// complete" phrase is matched at the start of a line, so prose like "once
// all tasks complete" does not end the run.
const RUN_END_RE =
  /Implementation run complete|(?:^|\n)\s*(?:\*\*)?All (?:\d+ )?(?:\w+ )?tasks (?:are )?complete\b|\/awos:verify\b/;

function runEndedText(row) {
  if (row.type !== 'assistant') return null;
  const t = textOf(row);
  return RUN_END_RE.test(t) ? t : null;
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
    const interventions = [];
    // AskUserQuestion calls: the run is blocked on the user from the call
    // to its result, however long that takes.
    const questions = [];
    const asked = new Map();
    for (let j = i + 1; j < mainRows.length; j++) {
      const r = mainRows[j];
      for (const b of blocks(r)) {
        if (
          r.type === 'assistant' &&
          b.type === 'tool_use' &&
          b.name === 'AskUserQuestion'
        ) {
          const q =
            b.input && Array.isArray(b.input.questions)
              ? b.input.questions[0]
              : null;
          asked.set(b.id, {
            at: r.__t,
            text: String((q && q.question) || '')
              .replace(/\s+/g, ' ')
              .slice(0, 120),
          });
        }
        if (
          r.type === 'user' &&
          b.type === 'tool_result' &&
          asked.has(b.tool_use_id)
        ) {
          const q = asked.get(b.tool_use_id);
          asked.delete(b.tool_use_id);
          questions.push({ at: q.at, answeredAt: r.__t, text: q.text });
        }
      }
      const done = runEndedText(r);
      if (done) {
        completedText = done;
        end = r.__t;
        endReason = 'completed';
        break;
      }
      if (!isPrompt(r)) continue;
      if (isAwosCommandPrompt(r)) {
        end = r.__t;
        endReason = 'next command';
        break;
      }
      // The run waited on the user from its last line to this prompt; a gap
      // over IDLE_GAP_SEC is idle and already excluded everywhere else.
      const waitSec = (r.__t - mainRows[j - 1].__t) / 1000;
      interventions.push({
        at: r.__t,
        text: String(content(r)).replace(/\s+/g, ' ').slice(0, 120),
        waitSec: waitSec > IDLE_GAP_SEC ? 0 : waitSec,
      });
    }
    const c0 = String(content(mainRows[i]));
    runs.push({
      index: runs.length + 1,
      // Which plugin started the run: only /better:implement keeps a run.md.
      command: /(?:<command-name>|^\s*)\/better:implement\b/.test(c0)
        ? 'better'
        : 'awos',
      startRow: i,
      start: mainRows[i].__t,
      end,
      endReason,
      completed: Boolean(completedText),
      completedText,
      interventions,
      questions,
      prompt: String(content(mainRows[i])).replace(/\s+/g, ' ').slice(0, 160),
    });
  }
  return runs;
}

// ---------- context fill ----------

const CONTEXT_FIELDS = [
  'input_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
];

// Context at a turn is everything the model read on that request: fresh
// input plus cache writes plus cache reads. Streaming writes several lines
// per turn with partial usage, so each field is the max seen per message.id,
// as output_tokens is. A missing field counts as 0. A turn that reports no
// input usage at all (a host-written error line) carries no context reading
// and does not become the final context.
// Compactions are the compact_boundary system lines the host writes; they
// are never inferred from a drop in the numbers.
// The host compacts in two cases: a context that grew too large during work,
// and a context that sat without a model request long enough for its prompt
// cache to expire (the agent waited on the user, a subagent, a long tool or
// a sleeping machine). To tell them apart, each compaction carries the pause
// from the agent's previous model turn to the start of the compaction (the
// line's timestamp is written at its end, so durationMs is taken off). A
// tool result or a user prompt does not end the pause: the cache ages from
// the last request, and the request after a long wait is what compacts.
export const COMPACTION_PAUSE_SEC = 5 * 60;

export function contextFill(rows) {
  const turns = new Map();
  const compactions = [];
  let lastTurnAt = null;
  for (const row of rows) {
    if (row.type === 'system' && row.subtype === 'compact_boundary') {
      const m = row.compactMetadata || {};
      const start = row.__t - (Number(m.durationMs) || 0);
      const pauseSec =
        lastTurnAt === null
          ? null
          : Math.max(0, Math.round((start - lastTurnAt) / 1000));
      compactions.push({
        at: row.__t,
        trigger: typeof m.trigger === 'string' ? m.trigger : '?',
        preTokens: Number(m.preTokens) || 0,
        postTokens: Number(m.postTokens) || 0,
        pauseSec,
        afterPause: pauseSec !== null && pauseSec >= COMPACTION_PAUSE_SEC,
      });
      continue;
    }
    if (row.type !== 'assistant' || isSleepError(row)) continue;
    lastTurnAt = row.__t;
    const m = row.message || {};
    const id = m.id || `${row.__t}`;
    const entry = turns.get(id) || { at: row.__t, fields: [0, 0, 0] };
    const u = m.usage || {};
    CONTEXT_FIELDS.forEach((f, i) => {
      entry.fields[i] = Math.max(entry.fields[i], Number(u[f]) || 0);
    });
    turns.set(id, entry);
  }
  const fill = {
    peakContext: 0,
    peakTurn: 0,
    peakAt: null,
    finalContext: 0,
    compactions,
  };
  let n = 0;
  for (const e of turns.values()) {
    n++;
    const ctx = e.fields[0] + e.fields[1] + e.fields[2];
    if (ctx > fill.peakContext) {
      fill.peakContext = ctx;
      fill.peakTurn = n;
      fill.peakAt = e.at;
    }
    if (ctx > 0) fill.finalContext = ctx;
  }
  return fill;
}

// ---------- agent profiling ----------

export function profileAgent(rows, meta, now, sleep = []) {
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
    asleepSec: 0,
    turns: 0,
    outputTokens: 0,
    thinkingTurns: 0,
    peakContext: 0,
    peakTurn: 0,
    peakAt: null,
    finalContext: 0,
    compactions: [],
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
    // Time the machine slept is not model, tool or idle time; every bucket
    // below sees only the awake part of the gap.
    const asleep = prev ? overlapSec(sleep, prev, row.__t) : 0;
    agent.asleepSec += asleep;
    const gap = prev ? (row.__t - prev) / 1000 - asleep : 0;
    // A long wait on a tool result is a hang candidate, not idle: the run
    // level reclassifies it as idle only if nothing on the machine was active.
    const toolWait =
      row.type === 'user' && blocks(row).some((b) => b.type === 'tool_result');
    const idle = gap > IDLE_GAP_SEC && !toolWait;
    if (idle) agent.idleSec += gap;
    if (row.type === 'assistant' && isSleepError(row)) {
      // The error line is not a model turn.
      lastKind = 'tool_result';
    } else if (row.type === 'assistant') {
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
  Object.assign(agent, contextFill(rows));
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

// The machine sleeps for every transcript at once, so sleep found in any of
// them (plus baseSleep from the OS and the main transcript) applies to all.
export function loadAgents(sessionDir, now, baseSleep = []) {
  const dir = path.join(sessionDir, 'subagents');
  if (!fs.existsSync(dir))
    return { agents: [], sleep: mergeIntervals(baseSleep), markers: 0 };
  const raw = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.meta.json')) continue;
    const agentId = f.slice('agent-'.length, -'.meta.json'.length);
    const meta = readJson(path.join(dir, f));
    meta.agentId = agentId;
    const rows = readJsonl(path.join(dir, `agent-${agentId}.jsonl`));
    if (!rows.length) continue;
    raw.push({ meta, rows });
  }
  const markers = raw.flatMap((r) => sleepMarkers(r.rows));
  const sleep = mergeIntervals([...baseSleep, ...markers]);
  const agents = raw.map((r) => profileAgent(r.rows, r.meta, now, sleep));
  agents.sort((a, b) => a.first - b.first);
  return { agents, sleep, markers: markers.length };
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
  // A run with no completion line and no later command is live only while
  // something is still writing. Background subagents can outlive the
  // orchestrator's last line, so the last activity is the latest line in
  // the main transcript or in any subagent started within the run.
  const openEnded = !run.completed && run.endReason === 'session end';
  const lastActivity = openEnded
    ? agents
        .filter((a) => a.first !== null && a.first >= run.start)
        .reduce((t, a) => Math.max(t, a.last), run.end)
    : run.end;
  const live = openEnded && (now - lastActivity) / 1000 < IDLE_GAP_SEC;
  const end = live ? now : Math.min(lastActivity, now);
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

  // orchestrator buckets over the run window. A gap splits into time asleep,
  // time blocked on an AskUserQuestion, and the awake rest the buckets see.
  const sleep = ctx.sleep || [];
  const asking = subtractIntervals(
    mergeIntervals((run.questions || []).map((q) => [q.at, q.answeredAt])),
    sleep
  );
  const orch = {
    modelSec: 0,
    toolSec: 0,
    idleSec: 0,
    asleepSec: 0,
    handoffs: [],
  };
  let prev = null;
  let lastNotification = null;
  const rowsInRun = mainRows.filter((r) => r.__t >= run.start && r.__t <= end);
  const bigGaps = [];
  for (const row of rowsInRun) {
    const asleep = prev ? overlapSec(sleep, prev, row.__t) : 0;
    const onUser = prev ? overlapSec(asking, prev, row.__t) : 0;
    orch.asleepSec += asleep;
    const gap = prev ? (row.__t - prev) / 1000 - asleep - onUser : 0;
    const idle = gap > IDLE_GAP_SEC;
    if (idle) {
      orch.idleSec += gap;
      bigGaps.push({ from: prev, to: row.__t, sec: gap });
    }
    if (row.type === 'assistant' && isSleepError(row)) {
      // not a model turn
    } else if (row.type === 'assistant') {
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
  // The orchestrator's context fill over the run window only; turns before
  // the run belong to whatever the session did earlier.
  Object.assign(orch, contextFill(rowsInRun));

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
  const wallSec = (end - run.start) / 1000;
  const asleepSec = overlapSec(sleep, run.start, end);
  const questionWaitSec = overlapSec(asking, run.start, end);
  const promptWaitSec = run.interventions.reduce((s, x) => s + x.waitSec, 0);
  const totals = {
    wallSec,
    asleepSec,
    asleepPeriods: sleep.filter(([a, b]) => b > run.start && a < end).length,
    awakeSec: wallSec - asleepSec,
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
    userPrompts: run.interventions.length,
    userQuestions: (run.questions || []).length,
    userQuestionWaitSec: questionWaitSec,
    userWaitSec: promptWaitSec + questionWaitSec,
    turns,
    secPerTurn: turns ? sum(working, 'modelSec') / turns : 0,
    tokensPerTurn: turns ? sum(working, 'outputTokens') / turns : 0,
    thinkingShare: turns ? sum(working, 'thinkingTurns') / turns : 0,
    medianWallMin: median(
      working.map((a) => (a.wallSec - a.idleSec - a.asleepSec) / 60)
    ),
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
    end,
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

// ---------- run.md units (/better:implement) ----------

// /better:implement keeps a checkpoint, context/spec/<dir>/run.md, that
// names each unit the run delegated. It gives no time: every number below
// still comes from the transcripts. run.md only says which unit a subagent
// did and what kind of unit it is. The fields read here are the ones the
// better plugin keeps stable: Status, the "### Unit N.M" headings, and the
// Agent:, State:, Committed: and Rework-of: lines.
const RUN_MD_RE = /context\/spec\/[^/\s"'`\\]+\/run\.md/;

// The first run.md path in the run's lines of the main transcript, resolved
// against the session cwd. That is the cwd the session started in, not the
// cwd of the line: an orchestrator that cd'd into a nested code repository
// writes later lines with that repository's cwd.
export function findRunMdPath(rows, sessionCwd) {
  for (const row of rows) {
    const m = RUN_MD_RE.exec(JSON.stringify(row));
    if (m) return path.resolve(sessionCwd || process.cwd(), m[0]);
  }
  return null;
}

const unitKind = (suffix) =>
  /^\d+$/.test(suffix)
    ? 'work'
    : /^V\d*$/i.test(suffix)
      ? 'verification'
      : /^R\d*$/i.test(suffix)
        ? 'rework'
        : 'other';
const CRITERION_RE = /§\s*(\d+(?:\.\d+)*)/;
const clean = (s) =>
  String(s || '')
    .replace(/`/g, '')
    .trim();

// Units in document order. A unit heading that occurs again (a run.md
// rewritten by appending) keeps its first block; the id goes to duplicates.
export function parseRunMd(text) {
  const lines = String(text).split('\n');
  const status = lines.map((l) => /^- Status:\s*(.*)$/.exec(l)).find(Boolean);
  const out = {
    status: status ? clean(status[1]) : null,
    slices: [],
    units: [],
    duplicates: [],
  };
  const seen = new Set();
  let slice = null;
  let unit = null; // the block being read; null outside a unit block
  let skipping = false; // inside a duplicated unit block
  for (const line of lines) {
    const sliceHead = /^## Slice (\d+):\s*(.*)$/.exec(line);
    const unitHead = /^### Unit (\d+)\.(\w+)\s*(?:[—–-]+\s*)?(.*)$/.exec(line);
    if (/^#{1,3} /.test(line)) {
      unit = null;
      skipping = false;
      if (/^#{1,2} /.test(line)) slice = null;
    }
    if (sliceHead) {
      slice = {
        number: Number(sliceHead[1]),
        name: clean(sliceHead[2]),
        committed: null,
      };
      out.slices.push(slice);
      continue;
    }
    if (unitHead) {
      const id = `${unitHead[1]}.${unitHead[2]}`;
      if (seen.has(id)) {
        if (!out.duplicates.includes(id)) out.duplicates.push(id);
        skipping = true;
        continue;
      }
      seen.add(id);
      const title = clean(unitHead[3]);
      const kind = unitKind(unitHead[2]);
      const crit =
        kind === 'verification' || kind === 'rework'
          ? CRITERION_RE.exec(title)
          : null;
      unit = {
        id,
        kind,
        title,
        criterion: crit ? `§${crit[1]}` : null,
        slice: slice ? slice.number : null,
        plannedAgent: null,
        state: null,
        committed: null,
        reworkOf: null,
      };
      out.units.push(unit);
      continue;
    }
    if (skipping) continue;
    const field = /^- (Agent|State|Committed|Rework-of|Verifies):\s*(.*)$/.exec(
      line
    );
    if (!field) continue;
    const [, key, raw] = field;
    const value = clean(raw);
    if (unit) {
      if (key === 'Agent' && unit.plannedAgent === null)
        unit.plannedAgent = value;
      if (key === 'State' && unit.state === null) unit.state = value;
      if (key === 'Committed' && unit.committed === null)
        unit.committed = value;
      if (key === 'Rework-of' && unit.reworkOf === null) {
        unit.reworkOf = value;
        const c = CRITERION_RE.exec(value);
        if (!unit.criterion && c) unit.criterion = `§${c[1]}`;
      }
      if (key === 'Verifies' && !unit.criterion) {
        const c = CRITERION_RE.exec(value);
        if (c) unit.criterion = `§${c[1]}`;
      }
    } else if (slice && key === 'Committed' && slice.committed === null) {
      slice.committed = value;
    }
  }
  return out;
}

// Which unit a subagent did, from its description: "Unit 2.1 …" names the
// unit; "Verify §2.1 …" and "Rework §2.1 …" name the criterion of a
// verification or rework unit.
function unitClaim(description) {
  const d = String(description || '');
  let m = /^\s*Unit\s+(\d+\.\w+)/i.exec(d);
  if (m) return { id: m[1] };
  m = /^\s*Verif(?:y|ication)\b[^§]*§\s*(\d+(?:\.\d+)*)/i.exec(d);
  if (m) return { kind: 'verification', criterion: `§${m[1]}` };
  m = /^\s*Rework\b[^§]*§\s*(\d+(?:\.\d+)*)/i.exec(d);
  if (m) return { kind: 'rework', criterion: `§${m[1]}` };
  return null;
}

const activeSec = (a) => a.wallSec - a.idleSec - a.asleepSec;

// Matches the run's top-level subagents (the orchestrator's own delegations)
// to units, in start order. Several subagents for one unit are attempts. When
// several units of one kind share a criterion, the k-th subagent for that
// criterion takes the k-th unit in document order; any further one is an
// attempt at the last. A nested agent belongs to its top-level ancestor's
// unit: its context counts toward the unit's peak, its time is already inside
// the ancestor's. Time is each attempt's active wall-clock, the Agents
// table's Wall column.
export function matchUnits(parsed, agents) {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const rootOf = (a) => {
    let r = a;
    const seen = new Set();
    while (r.parent && byId.has(r.parent) && !seen.has(r.parent)) {
      seen.add(r.parent);
      r = byId.get(r.parent);
    }
    return r;
  };
  const units = parsed.units.map((u) => ({
    ...u,
    attempts: 0,
    agentIds: [],
    agentTypes: [],
    activeSec: 0,
    peakContext: 0,
  }));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const taken = new Map(); // "kind §x" → how many subagents claimed it
  const unmatched = [];
  const roots = agents.filter((a) => rootOf(a) === a);
  const unitOfRoot = new Map();
  for (const a of roots) {
    const claim = unitClaim(a.description);
    let unit = null;
    if (claim && claim.id) unit = unitById.get(claim.id) || null;
    else if (claim) {
      const same = units.filter(
        (u) => u.kind === claim.kind && u.criterion === claim.criterion
      );
      const key = `${claim.kind} ${claim.criterion}`;
      const k = taken.get(key) || 0;
      taken.set(key, k + 1);
      unit = same.length ? same[Math.min(k, same.length - 1)] : null;
    }
    if (!unit) {
      unmatched.push({
        id: a.id,
        type: a.type,
        description: a.description,
        activeSec: activeSec(a),
      });
      continue;
    }
    unitOfRoot.set(a.id, unit);
    unit.attempts++;
    unit.agentIds.push(a.id);
    if (!unit.agentTypes.includes(a.type)) unit.agentTypes.push(a.type);
    unit.activeSec += activeSec(a);
  }
  for (const a of agents) {
    const unit = unitOfRoot.get(rootOf(a).id);
    if (unit) unit.peakContext = Math.max(unit.peakContext, a.peakContext);
  }
  const totals = { work: 0, verification: 0, rework: 0, other: 0 };
  for (const u of units) totals[u.kind] += u.activeSec;
  return {
    units,
    unmatched,
    notRun: units.filter((u) => u.attempts === 0).map((u) => u.id),
    totals,
  };
}

// The unit view of one run, or the one-line reason it has none.
export function runUnits(ctx, run, agents, runMdArg) {
  if (run.command !== 'better')
    return {
      skipped:
        'an /awos:implement run keeps no run.md; only /better:implement does',
    };
  let file = null;
  if (typeof runMdArg === 'string') file = path.resolve(runMdArg);
  else {
    const rows = ctx.mainRows.filter(
      (r) => r.__t >= run.start && r.__t <= run.end
    );
    file = findRunMdPath(rows, ctx.cwd);
  }
  if (!file)
    return {
      skipped:
        'no context/spec/<dir>/run.md path in the run’s transcript lines; pass --run-md <path>',
    };
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return {
      path: file,
      skipped: `run.md at ${file} cannot be read (${(err && err.code) || 'error'})`,
    };
  }
  const parsed = parseRunMd(text);
  return {
    path: file,
    status: parsed.status,
    duplicates: parsed.duplicates,
    slices: parsed.slices,
    ...matchUnits(parsed, agents),
  };
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---------- context ----------

export function loadContext(projectDir, sessionId, now, args = {}) {
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
  const osSleep = osSleepIntervals(args);
  const mainMarkers = sleepMarkers(mainRows);
  const { agents, sleep, markers } = loadAgents(
    path.join(projectDir, session.id),
    now,
    [...osSleep.intervals, ...mainMarkers]
  );
  const sleepSources = [
    osSleep.source,
    mainMarkers.length + markers ? 'transcript sleep errors' : null,
  ].filter(Boolean);
  return {
    projectDir,
    projectsDir: path.dirname(projectDir),
    session,
    mainFile: session.file,
    mainRows,
    mainModel,
    agents,
    sleep,
    sleepSource: sleepSources.join(' + ') || 'none',
    runs: findRuns(mainRows),
    // The session cwd: the first one its transcript records, else --cwd.
    cwd:
      (mainRows.find((r) => typeof r.cwd === 'string') || {}).cwd ||
      (args.cwd ? path.resolve(args.cwd) : null),
    now,
  };
}

// ---------- formatting ----------

const min = (sec) => `${(sec / 60).toFixed(1)} min`;
const hrs = (sec) => `${(sec / 3600).toFixed(2)} h`;
const pct = (x) => `${Math.round(x * 100)}%`;
const kTok = (n) => (n > 0 ? `${Math.round(n / 1000)}k` : '—');
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
    orch,
  } = p;
  const out = [];
  out.push(
    `## Implement run ${run.index} — ${iso(run.start)} → ${iso(p.end)} (${hrs(totals.wallSec)}${totals.asleepSec > 0 ? `, ${hrs(totals.awakeSec)} with the machine awake` : ''})`
  );
  out.push('');
  out.push(
    `Session \`${ctx.session.id}\`, orchestrator model \`${ctx.mainModel || '?'}\`. ${run.completed ? "Completed with the orchestrator's completion line" : run.endReason === 'next command' ? 'Ended by the next AWOS command, no completion line' : p.live ? 'Still running' : 'Ended without a completion line; measured to the last transcript activity'}.`
  );
  if (run.interventions.length) {
    out.push('');
    out.push(
      `User prompts inside the run: ${run.interventions.length} (${run.interventions
        .map((x) => `"${x.text.slice(0, 40)}"`)
        .join(', ')}).`
    );
  }
  if (run.questions && run.questions.length) {
    out.push('');
    out.push(
      `Questions the run asked (AskUserQuestion): ${run.questions.length} (${run.questions
        .map(
          (q) => `"${q.text.slice(0, 40)}" ${min((q.answeredAt - q.at) / 1000)}`
        )
        .join(', ')}).`
    );
  }
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
    `| Waiting on the user (${totals.userPrompts} prompts, ${totals.userQuestions} questions inside the run) | ${hrs(totals.userWaitSec)} |`
  );
  out.push(
    `| Idle gaps over ${IDLE_GAP_SEC / 60} min (main session) | ${hrs(totals.orchestratorIdleSec)} |`
  );
  out.push(
    `| Machine asleep (${totals.asleepPeriods} periods; source: ${ctx.sleepSource || 'none'}) | ${hrs(totals.asleepSec)} |`
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
  out.push(
    `| Orchestrator context (peak / final) | ${orch.peakContext > 0 ? `${kTok(orch.peakContext)} at turn ${orch.peakTurn} (${iso(orch.peakAt).slice(11)})` : '—'} / ${kTok(orch.finalContext)} |`
  );
  out.push('');
  out.push('### Context');
  out.push('');
  const compactions = [
    ...orch.compactions.map((c) => ({ ...c, who: 'orchestrator' })),
    ...agents.flatMap((a) =>
      a.compactions.map((c) => ({ ...c, who: `${a.type} "${a.description}"` }))
    ),
  ].sort((x, y) => x.at - y.at);
  // Only a compaction during work says something about the context: it
  // outgrew itself. One after a pause is the host compacting a context whose
  // prompt cache expired while the agent waited, whatever its size, so it is
  // named in one line and not counted as a finding.
  const duringWork = compactions.filter(
    (c) => c.pauseSec !== null && !c.afterPause
  );
  const other = compactions.filter((c) => !duringWork.includes(c));
  if (duringWork.length) {
    out.push(
      'Compactions during work (the context outgrew itself; details of the brief or of earlier steps can be missing after it):'
    );
    out.push('');
    for (const c of duringWork)
      out.push(
        `- ${iso(c.at)} in ${c.who}: ${c.trigger}, ${kTok(c.preTokens)} → ${kTok(c.postTokens)}, ${c.pauseSec} s after the previous model turn`
      );
  } else {
    out.push('No compaction during work.');
  }
  if (other.length) {
    out.push('');
    out.push(
      `Compacted after a pause of ${COMPACTION_PAUSE_SEC / 60}+ min, when the prompt cache had expired (the wait, not the context size): ${other
        .map(
          (c) =>
            `${c.who} at ${iso(c.at).slice(11)} ${c.pauseSec === null ? 'before its first model turn' : `after ${min(c.pauseSec)}`}`
        )
        .join(', ')}.`
    );
  }
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
    '| Start | Depth | Type | Model | Description | Wall | Model | Tool | Tests | Turns | s/turn | tok/turn | Think | Peak ctx | Final ctx | Longest wait | Status |'
  );
  out.push(
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  );
  for (const a of agents) {
    const t = Math.max(a.turns, 1);
    out.push(
      `| ${new Date(a.first).toISOString().slice(11, 16)} | ${a.depth} | ${a.type} | ${(a.model || '?').replace('claude-', '')} | ${a.description.slice(0, 40)}${a.isDelegator ? ' [delegator]' : ''}${a.isEmptySpawn ? ' [empty]' : ''} | ${min(a.wallSec - a.idleSec - a.asleepSec)} | ${min(a.modelSec)} | ${min(a.toolSec)} | ${a.testRuns}×${min(a.testSec)} | ${a.turns} | ${(a.modelSec / t).toFixed(1)} | ${Math.round(a.outputTokens / t)} | ${pct(a.thinkingTurns / t)} | ${kTok(a.peakContext)} | ${kTok(a.finalContext)} | ${min(a.longestWait.sec)} ${a.longestWait.what.slice(0, 40)} | ${a.status} |`
    );
  }
  out.push('');
  if (p.units) out.push(...renderUnits(p.units));
  return out.join('\n');
}

const cell = (s) => String(s).replace(/\|/g, '\\|');

function renderUnits(u) {
  if (u.skipped) return [`Units: not shown — ${u.skipped}.`, ''];
  const out = ['### Units', ''];
  out.push(
    `From \`${u.path}\` (run.md \`Status: ${u.status || '?'}\`). run.md names the unit each subagent did; every time below comes from the transcripts.${u.duplicates.length ? ` Duplicated: ${u.duplicates.join(', ')} (the first heading is used).` : ''}`
  );
  out.push('');
  out.push(
    '| Unit | Kind | Title | Planned agent | Actual agent | Attempts | Active | Peak ctx | State |'
  );
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const x of u.units)
    out.push(
      `| ${x.id} | ${x.kind} | ${cell(x.title.slice(0, 40).trim())} | ${cell(x.plannedAgent || '—')} | ${x.agentTypes.join(', ') || '—'} | ${x.attempts} | ${x.attempts ? min(x.activeSec) : '—'} | ${kTok(x.peakContext)} | ${cell(x.state || '?')} |`
    );
  out.push('');
  const kinds = ['work', 'verification', 'rework'];
  const all = kinds.reduce((s, k) => s + u.totals[k], 0);
  out.push(
    `Unit time: ${kinds.map((k) => `${k} ${min(u.totals[k])} (${all > 0 ? pct(u.totals[k] / all) : '—'})`).join(', ')}.`
  );
  out.push('');
  if (u.notRun.length) {
    out.push(
      `Units no subagent in this session ran (done in an earlier session, or not reached): ${u.notRun.join(', ')}.`
    );
    out.push('');
  }
  if (u.unmatched.length) {
    out.push('Subagents that are not a unit:');
    for (const a of u.unmatched)
      out.push(`- ${a.type} "${a.description}": ${min(a.activeSec)}`);
    out.push('');
  }
  return out;
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

const contextJson = (x) => ({
  peakContext: x.peakContext,
  peakTurn: x.peakTurn,
  peakAt: x.peakAt === null ? null : new Date(x.peakAt).toISOString(),
  finalContext: x.finalContext,
  compactions: x.compactions.map((c) => ({
    ...c,
    at: new Date(c.at).toISOString(),
  })),
});

function cmdReport(args) {
  const now = args.now ? Date.parse(args.now) : Date.now();
  const projectDir = resolveProjectDir(args);
  const ctx = loadContext(projectDir, args.session, now, args);
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
  const profiles = selected.map((r) => {
    const p = profileRun(ctx, r);
    p.units = runUnits(ctx, r, p.agents, args['run-md']);
    return p;
  });
  const md = [`# /awos:implement profile — ${path.basename(projectDir)}`, ''];
  md.push(
    `Transcripts: \`${ctx.session.file}\` and its \`subagents/\`. Thinking text is redacted in transcripts; the thinking share counts turns that carry a thinking block. Time the machine slept and time a question waited on the user are taken out of the work buckets first; then idle gaps over ${IDLE_GAP_SEC / 60} min are excluded from every bucket.`
  );
  md.push('');
  for (const p of profiles) md.push(renderRun(p, ctx));
  console.log(md.join('\n'));
  if (args.json) {
    const json = profiles.map((p) => ({
      run: {
        ...p.run,
        start: new Date(p.run.start).toISOString(),
        end: new Date(p.end).toISOString(),
      },
      live: p.live,
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
      orchestrator: contextJson(p.orch),
      agents: p.agents.map((a) => ({
        ...a,
        ...contextJson(a),
        first: new Date(a.first).toISOString(),
        last: new Date(a.last).toISOString(),
      })),
      units: p.units.units || [],
      runMd: {
        path: p.units.path || null,
        status: p.units.status || null,
        duplicates: p.units.duplicates || [],
        skipped: p.units.skipped || null,
        slices: p.units.slices || [],
        totals: p.units.totals || null,
        unitsNotRun: p.units.notRun || [],
        unmatchedAgents: p.units.unmatched || [],
      },
    }));
    fs.writeFileSync(
      args.json,
      JSON.stringify(
        {
          session: ctx.session.id,
          mainModel: ctx.mainModel,
          sleepSource: ctx.sleepSource,
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
    const ctx = loadContext(projectDir, args.session, now, args);
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
            `DONE (delegator)${tag} ${a.type} "${a.description}": ${min(a.wallSec - a.idleSec - a.asleepSec)}, ${a.turns} own turns, handed work to ${a.agentCalls.map((c) => c.subagentType).join(', ')}`
          );
        else
          line(
            `DONE${tag} ${a.type} "${a.description}": wall ${min(a.wallSec - a.idleSec - a.asleepSec)}, model ${min(a.modelSec)}, tool ${min(a.toolSec)}, tests ${a.testRuns}×${min(a.testSec)}, ${a.turns} turns, ${(a.modelSec / t).toFixed(1)} s/turn, ${Math.round(a.outputTokens / t)} tok/turn, think ${pct(a.thinkingTurns / t)}${a.model === ctx.mainModel && BUILTIN_AGENTS.has(a.type) ? ` — on the orchestrator model ${a.model}` : ''}`
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
    const ended = run.completed || run.endReason === 'next command';
    if (Date.now() - lastSummary > 1800 * 1000 || ended) {
      lastSummary = Date.now();
      const t = p.totals;
      line(
        `SUMMARY ${hrs(t.wallSec)} elapsed: ${t.workingAgents} working agents (${p.agents.filter((a) => a.status !== 'done').length} live) | median ${t.medianWallMin.toFixed(1)} min/agent | ${t.secPerTurn.toFixed(1)} s/turn | ${Math.round(t.tokensPerTurn)} tok/turn | think ${pct(t.thinkingShare)} | model ${hrs(t.subagentModelSec)} tool ${hrs(t.subagentToolSec)} tests ${hrs(t.subagentTestSec)} hangs ${hrs(t.hangSec)}`
      );
    }
    if (ended) {
      line(
        `RUN ENDED ${run.completed ? run.completedText.replace(/\s+/g, ' ').slice(0, 160) : 'by the next AWOS command'}`
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
      'Usage: profile-implement.mjs <sessions|report|watch> [--projects <dir>] [--cwd <path>] [--session <id>] [--run latest|all|<n>] [--json <file>] [--interval <sec>] [--once] [--now <iso>] [--sleep-log <file>|none] [--run-md <path>]'
    );
    code = 2;
  }
  if (code !== null && code !== undefined) process.exitCode = code;
}
