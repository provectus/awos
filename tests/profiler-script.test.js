'use strict';

// Contract tests for the profiler plugin's deterministic transcript profiler
// (plugins/profiler/scripts/profile-implement.mjs). A synthetic session is
// written to a temp dir in the on-disk shape Claude Code uses
// (<id>.jsonl + <id>/subagents/agent-<aid>.jsonl + .meta.json), and the
// script's report, JSON, watch and sessions outputs are checked against the
// numbers the fixture was built to produce. The transcript format is
// internal to Claude Code, so a drift shows up here as a loud failure
// rather than a silently zeroed profile.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');
const script = path.join(
  repoRoot,
  'plugins',
  'profiler',
  'scripts',
  'profile-implement.mjs'
);

const T0 = Date.parse('2026-09-17T16:00:00.000Z');
const at = (sec, ms = 0) => new Date(T0 + sec * 1000 + ms).toISOString();

function row(type, timestamp, message, extra = {}) {
  return JSON.stringify({ type, timestamp, message, ...extra });
}
const userText = (ts, text, extra) =>
  row('user', ts, { role: 'user', content: text }, extra);
const toolResult = (ts, toolUseId, content) =>
  row('user', ts, {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: toolUseId, content }],
  });
// The three input fields of a real usage object; their sum is the context
// the model read on that turn.
const ctxUsage = (input, cacheCreation, cacheRead) => ({
  input_tokens: input,
  cache_creation_input_tokens: cacheCreation,
  cache_read_input_tokens: cacheRead,
});
const assistant = (
  ts,
  id,
  model,
  blocks,
  outputTokens,
  ctx = ctxUsage(2, 1000, 9000)
) =>
  row('assistant', ts, {
    role: 'assistant',
    id,
    model,
    content: blocks,
    usage: { ...ctx, output_tokens: outputTokens },
  });
const compactBoundary = (ts, preTokens, postTokens) =>
  JSON.stringify({
    type: 'system',
    subtype: 'compact_boundary',
    content: 'Conversation compacted',
    timestamp: ts,
    compactMetadata: { trigger: 'auto', preTokens, postTokens },
  });
const bash = (id, command) => ({
  type: 'tool_use',
  id,
  name: 'Bash',
  input: { command },
});
const agentCall = (id, subagentType, description) => ({
  type: 'tool_use',
  id,
  name: 'Agent',
  input: { subagent_type: subagentType, description },
});
const text = (t) => ({ type: 'text', text: t });
const thinking = () => ({ type: 'thinking', thinking: '' });

const MAIN = 'claude-fable-5-1';
const SUB = 'claude-sonnet-5';

function writeFixture(root, { completed }) {
  const proj = path.join(root, '-Users-someone-Work-proj');
  const sid = 'sess-0001';
  const subDir = path.join(proj, sid, 'subagents');
  fs.mkdirSync(subDir, { recursive: true });

  const main = [
    userText(
      at(0),
      '<command-message>awos:implement</command-message> <command-name>/awos:implement</command-name>'
    ),
    assistant(
      at(10),
      'm-main-1',
      MAIN,
      [agentCall('tu1', 'typescript-backend', 'Slice 1: backend')],
      40
    ),
    toolResult(at(11), 'tu1', 'Async agent launched successfully'),
    userText(
      at(20 * 60),
      '<task-notification><task-id>a1</task-id></task-notification>'
    ),
    assistant(
      at(21 * 60),
      'm-main-2',
      MAIN,
      [agentCall('tu2', 'general-purpose', 'Commit Slice 1')],
      30,
      ctxUsage(2, 2000, 18000)
    ),
    toolResult(at(21 * 60 + 1), 'tu2', 'Async agent launched successfully'),
    // The orchestrator's peak context: 30 002 tokens at its third turn.
    assistant(
      at(22 * 60),
      'm-main-3',
      MAIN,
      [agentCall('tu4', 'react-frontend', 'Slice 1: verify UI')],
      30,
      ctxUsage(2, 1000, 29000)
    ),
    toolResult(at(22 * 60 + 1), 'tu4', 'Async agent launched successfully'),
    userText(
      at(30 * 60),
      '<task-notification><task-id>a2</task-id></task-notification>'
    ),
  ];
  if (completed) {
    main.push(
      assistant(
        at(31 * 60),
        'm-main-4',
        MAIN,
        [text('All tasks complete (100%). Run /awos:verify next.')],
        20,
        ctxUsage(2, 500, 24500)
      )
    );
    main.push(userText(at(40 * 60), 'thanks, next thing please'));
  }
  fs.writeFileSync(path.join(proj, `${sid}.jsonl`), main.join('\n') + '\n');

  const writeAgent = (aid, meta, rows) => {
    fs.writeFileSync(
      path.join(subDir, `agent-${aid}.meta.json`),
      JSON.stringify(meta)
    );
    fs.writeFileSync(
      path.join(subDir, `agent-${aid}.jsonl`),
      rows.join('\n') + '\n'
    );
  };

  // a1: a working specialist. One real test run (165 s), one test call that
  // timed out and moved to background (excluded from tests), one 11.8-minute
  // hang on a non-test command, then a final report. Its first turn is
  // written twice with partial usage (streaming), so tokens must dedupe.
  // Context: m1 24 002 (max per field over its two lines), m2 43 003 (the
  // peak; its later partial line has smaller numbers), m3 30 000 (only
  // cache_read_input_tokens present), one compaction, m4 12 002 (final).
  writeAgent(
    'a1',
    {
      agentType: 'typescript-backend',
      description: 'Slice 1: backend',
      toolUseId: 'tu1',
      spawnDepth: 1,
    },
    [
      userText(at(10), 'Implement the backend slice', { isSidechain: true }),
      assistant(
        at(15),
        'm1',
        SUB,
        [thinking(), bash('b1', 'npm test')],
        2,
        ctxUsage(2, 500, 20000)
      ),
      assistant(
        at(15, 100),
        'm1',
        SUB,
        [thinking(), bash('b1', 'npm test')],
        500,
        ctxUsage(2, 4000, 20000)
      ),
      toolResult(at(180), 'b1', '# pass 12'),
      assistant(
        at(185),
        'm2',
        SUB,
        [bash('b2', 'npm test -- --watch')],
        40,
        ctxUsage(3, 3000, 40000)
      ),
      assistant(
        at(185, 50),
        'm2',
        SUB,
        [bash('b2', 'npm test -- --watch')],
        40,
        ctxUsage(1, 0, 0)
      ),
      toolResult(
        at(305),
        'b2',
        'Command did not complete within its 120s timeout and was moved to the background'
      ),
      assistant(at(310), 'm3', SUB, [bash('b3', 'sleep 1000')], 30, {
        cache_read_input_tokens: 30000,
      }),
      toolResult(at(1020), 'b3', ''),
      compactBoundary(at(1021), 43003, 9000),
      assistant(
        at(1025),
        'm4',
        SUB,
        [text('Done. Tests green.')],
        60,
        ctxUsage(2, 3000, 9000)
      ),
    ]
  );

  // a2: a built-in general-purpose agent on the orchestrator model that
  // forwarded its task (delegator + effort leak).
  writeAgent(
    'a2',
    {
      agentType: 'general-purpose',
      description: 'Commit Slice 1',
      toolUseId: 'tu2',
      spawnDepth: 1,
    },
    [
      userText(at(21 * 60 + 1), 'Commit the slice', { isSidechain: true }),
      assistant(
        at(21 * 60 + 5),
        'm5',
        MAIN,
        [agentCall('tu3', 'general-purpose', 'Commit the slice')],
        30
      ),
      toolResult(at(21 * 60 + 6), 'tu3', 'Async agent launched successfully'),
      userText(
        at(29 * 60),
        '<task-notification><task-id>a3</task-id></task-notification>',
        { isSidechain: true }
      ),
      // A turn that reports no input usage at all: it must not become the
      // agent's final context.
      assistant(
        at(29 * 60 + 5),
        'm6',
        MAIN,
        [text('Forwarded and done.')],
        20,
        {}
      ),
    ]
  );

  // a3: nested agent that received no task and exited at once (empty spawn).
  writeAgent(
    'a3',
    {
      agentType: 'general-purpose',
      description: 'Commit the slice',
      toolUseId: 'tu3',
      parentAgentId: 'a2',
      spawnDepth: 2,
    },
    [
      userText(at(21 * 60 + 6), 'Base directory for this skill: ...', {
        isSidechain: true,
      }),
      assistant(
        at(21 * 60 + 8),
        'm7',
        SUB,
        [text('I notice no actual task has been provided.')],
        20
      ),
    ]
  );

  // a4: stuck on a cleanup command with no result yet.
  writeAgent(
    'a4',
    {
      agentType: 'react-frontend',
      description: 'Slice 1: verify UI',
      toolUseId: 'tu4',
      spawnDepth: 1,
    },
    [
      userText(at(22 * 60 + 1), 'Verify the UI', { isSidechain: true }),
      assistant(
        at(23 * 60),
        'm8',
        SUB,
        [bash('b4', 'playwright-cli close 2>&1 | tail -5')],
        30
      ),
    ]
  );
  return { proj, sid };
}

function run(args, cwd) {
  // The OS sleep log (pmset on macOS) is machine state; tests pass their own.
  const sleepArgs = args.includes('--sleep-log') ? [] : ['--sleep-log', 'none'];
  const res = spawnSync(process.execPath, [script, ...args, ...sleepArgs], {
    cwd,
    encoding: 'utf8',
  });
  return { ...res, out: (res.stdout || '') + (res.stderr || '') };
}

test('report profiles a completed implement run: buckets, dedupe, hang, tests, delegation, effort leak', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-profiler-'));
  const { proj, sid } = writeFixture(root, { completed: true });
  const jsonOut = path.join(root, 'profile.json');
  const res = run(
    [
      'report',
      '--projects',
      proj,
      '--session',
      sid,
      '--now',
      at(40 * 60),
      '--json',
      jsonOut,
    ],
    root
  );
  assert.equal(res.status, 0, `report must exit 0; output was:\n${res.out}`);

  const md = res.stdout;
  assert.match(
    md,
    /## Implement run 1 —/,
    'report must find the single implement run in the session'
  );
  assert.match(
    md,
    /Completed with the orchestrator's completion line/,
    'a run with an "All tasks complete" line is reported as completed, ending at that line rather than at the next user prompt'
  );
  assert.match(
    md,
    /### Delegation chains/,
    'an agent that called the Agent tool is listed under delegation chains'
  );
  assert.match(
    md,
    /HANG 11\.8 min .* "Slice 1: backend": Bash sleep 1000/,
    'a non-test tool wait over 10 minutes is reported as a hang with its command'
  );
  assert.match(
    md,
    /Agents running on the orchestrator model/,
    'a built-in agent on the orchestrator model is flagged as an effort leak'
  );

  const json = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
  assert.equal(
    json.mainModel,
    MAIN,
    'the JSON records the orchestrator model from the main transcript'
  );
  assert.equal(json.runs.length, 1, 'exactly one run in the JSON');
  const r = json.runs[0];
  assert.equal(
    r.run.completed,
    true,
    'run.completed reflects the completion line'
  );
  assert.ok(
    Math.abs(r.totals.wallSec - 31 * 60) < 2,
    `run wall-clock ends at the completion line (31 min), got ${r.totals.wallSec}s`
  );
  assert.equal(
    r.totals.subagentTestRuns,
    1,
    'the timed-out test call is not counted as a test run; only the completed one is'
  );
  assert.ok(
    Math.abs(r.totals.subagentTestSec - 165) < 1,
    `test time is the completed run's 165 s, got ${r.totals.subagentTestSec}`
  );
  assert.equal(r.hangs.length, 1, 'one hang in the run');
  assert.ok(
    Math.abs(r.totals.hangSec - 710) < 1,
    `hang seconds come from the 710 s sleep wait, got ${r.totals.hangSec}`
  );

  const byId = Object.fromEntries(r.agents.map((a) => [a.id, a]));
  assert.equal(
    byId.a1.turns,
    4,
    'streaming duplicates of one message id count as a single turn'
  );
  assert.equal(
    byId.a1.outputTokens,
    500 + 40 + 30 + 60,
    'output tokens per turn are the max seen across duplicate lines, not the first partial value'
  );
  assert.equal(
    byId.a1.thinkingTurns,
    1,
    'a turn with a thinking block counts once'
  );
  assert.equal(
    byId.a1.status,
    'done',
    'an agent whose last line is final text older than two minutes is done'
  );
  assert.equal(
    byId.a2.isDelegator,
    true,
    'an agent that called the Agent tool is a delegator'
  );
  assert.equal(
    byId.a3.isEmptySpawn,
    true,
    'a nested agent with no tool call that finished within two turns is an empty spawn'
  );
  assert.equal(
    byId.a4.status.startsWith('waiting on Bash playwright-cli'),
    true,
    'an agent whose last line is a tool call is waiting on that tool'
  );
  assert.deepEqual(
    r.effortLeaks.map((a) => a.id),
    ['a2'],
    'the general-purpose agent on the orchestrator model is the only effort leak (the empty spawn is excluded)'
  );
  assert.equal(
    r.totals.workingAgents,
    2,
    'working agents exclude the delegator and the empty spawn'
  );
  assert.deepEqual(
    byId.a2.children,
    ['a3'],
    'delegation children resolve through the Agent call tool_use_id'
  );
});

test('report measures context fill per agent: peak, final, streaming dedupe of input fields, missing fields, compactions', () => {
  // To check that a run keeps the orchestrator's context small, the context
  // of each agent is read from the usage on its turns, never estimated.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-profiler-'));
  const { proj, sid } = writeFixture(root, { completed: true });
  const jsonOut = path.join(root, 'profile.json');
  const res = run(
    [
      'report',
      '--projects',
      proj,
      '--session',
      sid,
      '--now',
      at(40 * 60),
      '--json',
      jsonOut,
    ],
    root
  );
  assert.equal(res.status, 0, `report must exit 0; output was:\n${res.out}`);
  const md = res.stdout;
  const r = JSON.parse(fs.readFileSync(jsonOut, 'utf8')).runs[0];
  const byId = Object.fromEntries(r.agents.map((a) => [a.id, a]));

  assert.equal(
    byId.a1.peakContext,
    43003,
    'peak context is the largest input + cache_creation + cache_read sum over the turns; a later partial line of the same message with smaller numbers must not lower it'
  );
  assert.equal(
    byId.a1.peakTurn,
    2,
    'the peak is attributed to the deduplicated turn where it happened (the second turn)'
  );
  assert.equal(
    byId.a1.finalContext,
    12002,
    "final context is the agent's last turn, not its peak"
  );
  assert.equal(
    byId.a2.finalContext,
    10002,
    'a last turn that reports no input usage at all does not set the final context to 0'
  );
  assert.ok(
    Object.values(byId).every(
      (a) => Number.isFinite(a.peakContext) && Number.isFinite(a.finalContext)
    ),
    'a missing usage field counts as 0, so no context number is NaN'
  );
  assert.equal(
    byId.a1.compactions.length,
    1,
    'each compact_boundary line in a transcript is one compaction'
  );
  assert.deepEqual(
    byId.a1.compactions[0],
    {
      at: at(1021),
      trigger: 'auto',
      preTokens: 43003,
      postTokens: 9000,
      pauseSec: 711,
      afterPause: true,
    },
    "a compaction carries its time, trigger, preTokens and postTokens from compactMetadata, and the pause since the agent's previous model turn (m3 at 310 s; the tool result at 1020 s does not end the pause)"
  );
  assert.equal(
    byId.a4.compactions.length,
    0,
    'a transcript without compact_boundary lines has no compactions, even when its numbers drop'
  );
  assert.deepEqual(
    {
      peak: r.orchestrator.peakContext,
      turn: r.orchestrator.peakTurn,
      final: r.orchestrator.finalContext,
      compactions: r.orchestrator.compactions.length,
    },
    { peak: 30002, turn: 3, final: 25002, compactions: 0 },
    'the JSON carries the orchestrator context fill over the run window: peak, its turn, final, compactions'
  );

  assert.match(
    md,
    /\| Peak ctx \| Final ctx \|/,
    'the Agents table has Peak ctx and Final ctx columns'
  );
  assert.match(
    md,
    /\| Slice 1: backend \|.*\| 43k \| 12k \|/,
    'the Agents table shows peak and final context in thousands of tokens'
  );
  assert.match(
    md,
    /\| Orchestrator context \(peak \/ final\) \| 30k at turn 3 \(16:22 UTC\) \/ 25k \|/,
    'the Rates table shows the orchestrator peak with its turn and time, and its final context'
  );
  assert.match(
    md,
    /### Context\n\nCompactions written by the host \(compact_boundary lines\): 1; 1 after a pause of 5\+ min since the agent's previous model turn, 0 during work\.\n\n- 2026-09-17 16:17 UTC in typescript-backend "Slice 1: backend": auto, 43k → 9k, after a 11\.\d min pause/,
    'the Context section counts compactions after a pause and during work, and lists each with its time, agent, trigger, preTokens → postTokens and pause'
  );
});

test('a compaction is marked after a pause or during work by the time since the previous model turn', async () => {
  // The host compacts a context that grew too large during work, and also a
  // context that sat without a model request until its prompt cache expired.
  // Only the first means the work outgrew one context, so the two are told
  // apart by the pause from the agent's previous model turn.
  const { contextFill, COMPACTION_PAUSE_SEC } = await import(script);
  const r = (sec, obj) => ({ ...obj, __t: T0 + sec * 1000 });
  const turn = (sec, id, text = 'ok') =>
    r(sec, {
      type: 'assistant',
      message: {
        id,
        content: [{ type: 'text', text }],
        usage: ctxUsage(1, 0, 1000),
      },
    });
  const compact = (sec, durationMs) =>
    r(sec, {
      type: 'system',
      subtype: 'compact_boundary',
      compactMetadata: {
        trigger: 'auto',
        preTokens: 250000,
        postTokens: 40000,
        durationMs,
      },
    });
  const prompt = (sec) =>
    r(sec, { type: 'user', message: { role: 'user', content: 'back' } });
  const result = (sec) =>
    r(sec, {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'x', content: '' }],
      },
    });
  const fill = contextFill([
    compact(5, 0),
    turn(10, 'm1'),
    prompt(3610),
    compact(3640, 30000),
    turn(3700, 'm2'),
    result(3710),
    compact(3712, 2000),
    turn(3720, 'm3'),
    result(6120),
    compact(6121, 0),
    turn(6130, 'm4'),
    turn(6530, 'err', 'API Error: Your computer went to sleep'),
    compact(6531, 0),
  ]);
  assert.equal(
    COMPACTION_PAUSE_SEC,
    300,
    'the pause threshold is 5 minutes, the shortest prompt-cache lifetime'
  );
  assert.deepEqual(
    fill.compactions.map((c) => [c.pauseSec, c.afterPause]),
    [
      [null, false],
      [3600, true],
      [10, false],
      [2401, true],
      [401, true],
    ],
    [
      'a compaction with no model turn before it has no pause',
      'a user prompt after an hour away does not end the pause, and durationMs is taken off the end-of-compaction timestamp',
      'a compaction 10 s after a model turn, right after a tool result, is during work',
      'an orchestrator that waited 40 min on a subagent compacts after a pause, although the result arrived 1 s before',
      'a host-written sleep error line is not a model turn and does not end the pause',
    ].join('; ')
  );
});

test('watch --once on a live run reports completions, empty spawns, delegators and a stall', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-profiler-'));
  const { proj, sid } = writeFixture(root, { completed: false });
  const res = run(
    [
      'watch',
      '--once',
      '--projects',
      proj,
      '--session',
      sid,
      '--now',
      at(40 * 60),
    ],
    root
  );
  assert.equal(
    res.status,
    0,
    `watch --once must exit 0; output was:\n${res.out}`
  );
  const out = res.stdout;
  assert.match(
    out,
    /^DONE typescript-backend "Slice 1: backend": wall .* 4 turns/m,
    'a finished working agent produces a DONE line with its turn count'
  );
  assert.match(
    out,
    /^DONE \(delegator\) general-purpose "Commit Slice 1"/m,
    'a delegator produces a DONE (delegator) line'
  );
  assert.match(
    out,
    /^EMPTY \[depth 2\] general-purpose "Commit the slice"/m,
    'an empty nested spawn produces an EMPTY line with its depth'
  );
  assert.match(
    out,
    /^STALL react-frontend "Slice 1: verify UI": silent 17\.0 min, waiting on Bash playwright-cli close/m,
    'an agent silent over ten minutes on a tool call produces a STALL line naming the command'
  );
  assert.doesNotMatch(
    out,
    /^RUN ENDED/m,
    'a run without a completion line or a following prompt is still live'
  );
});

test('sessions lists only sessions that contain an implement run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-profiler-'));
  const { proj, sid } = writeFixture(root, { completed: true });
  fs.writeFileSync(
    path.join(proj, 'sess-other.jsonl'),
    userText(at(0), 'just a chat') + '\n'
  );
  const res = run(['sessions', '--projects', proj], root);
  assert.equal(res.status, 0, `sessions must exit 0; output was:\n${res.out}`);
  assert.match(
    res.stdout,
    new RegExp(`^- ${sid} .*implement runs: 1`, 'm'),
    'the session with an implement run is listed with its run count'
  );
  assert.doesNotMatch(
    res.stdout,
    /sess-other/,
    'a session without an implement run is not listed'
  );
});

test('sessions lists a /better:implement run too — the plugin fork shares the join key', () => {
  // plugins/better/commands/implement.md prints the same completion line
  // as core implement.md, so a better:implement session is a run this
  // profiler reads. The headless transcript carries the command-name tag.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-profiler-'));
  const proj = path.join(root, '-Users-someone-Work-proj');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(
    path.join(proj, 'sess-better.jsonl'),
    [
      userText(
        at(0),
        '<command-message>better:implement</command-message>\n<command-name>/better:implement</command-name>\n<command-args>002</command-args>'
      ),
      assistant(
        at(60),
        'm-b-1',
        MAIN,
        [text('Implementation run complete.')],
        20
      ),
    ].join('\n') + '\n'
  );
  const res = run(['sessions', '--projects', proj], root);
  assert.equal(res.status, 0, `sessions must exit 0; output was:\n${res.out}`);
  assert.match(
    res.stdout,
    /^- sess-better .*implement runs: 1/m,
    'a session started with /better:implement is listed as one implement run'
  );
});

// ---------- run boundaries ----------
// Regression fixtures from real runs: an orchestrator that paraphrased its
// completion line was profiled as still running (73 h instead of 2.5 h); a
// run that resumed after the user answered a question or typed "continue"
// was cut at that prompt (2 h measured out of 12); and on hosts where
// background teammates report back as user-role messages, the first teammate
// message ended the run.

const IMPLEMENT =
  '<command-message>awos:implement</command-message> <command-name>/awos:implement</command-name>';

function writeSession(root, mainRows, agentRows = []) {
  const proj = path.join(root, '-Users-someone-Work-proj');
  const sid = 'sess-bounds';
  const subDir = path.join(proj, sid, 'subagents');
  fs.mkdirSync(subDir, { recursive: true });
  fs.writeFileSync(path.join(proj, `${sid}.jsonl`), mainRows.join('\n') + '\n');
  if (agentRows.length) {
    fs.writeFileSync(
      path.join(subDir, 'agent-b1.meta.json'),
      JSON.stringify({
        agentType: 'typescript-backend',
        description: 'Slice 1: backend',
        toolUseId: 'tb1',
        spawnDepth: 1,
      })
    );
    fs.writeFileSync(
      path.join(subDir, 'agent-b1.jsonl'),
      agentRows.join('\n') + '\n'
    );
  }
  return { proj, sid };
}

function reportJson(proj, sid, root, now, extra = []) {
  const jsonOut = path.join(root, 'bounds.json');
  const res = run(
    [
      'report',
      '--projects',
      proj,
      '--session',
      sid,
      '--now',
      now,
      '--json',
      jsonOut,
      ...extra,
    ],
    root
  );
  assert.equal(res.status, 0, `report must exit 0; output was:\n${res.out}`);
  return { md: res.stdout, json: JSON.parse(fs.readFileSync(jsonOut, 'utf8')) };
}

const backendAgent = (doneAtSec) => [
  userText(at(11), 'Implement the backend slice', { isSidechain: true }),
  assistant(at(20), 'b-m1', SUB, [bash('bb1', 'npm test')], 40),
  toolResult(at(80), 'bb1', '# pass 3'),
  assistant(at(doneAtSec), 'b-m2', SUB, [text('Done. Tests green.')], 30),
];

test('a paraphrased completion line ends the run, and prose that mentions finishing tasks does not', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-profiler-'));
  const { proj, sid } = writeSession(
    root,
    [
      userText(at(0), IMPLEMENT),
      assistant(
        at(60),
        'p-1',
        MAIN,
        [text('Once all tasks complete, I will point you to verify.')],
        20
      ),
      assistant(
        at(70),
        'p-2',
        MAIN,
        [agentCall('tb1', 'typescript-backend', 'Slice 1: backend')],
        20
      ),
      toolResult(at(71), 'tb1', 'Async agent launched successfully'),
      userText(
        at(10 * 60),
        '<task-notification><task-id>b1</task-id></task-notification>'
      ),
      assistant(
        at(12 * 60),
        'p-3',
        MAIN,
        [
          text(
            'All tasks complete.\n\n## Summary\n\n**All 50 tasks complete (100%)**'
          ),
        ],
        40
      ),
      userText(at(20 * 60), 'thanks'),
    ],
    backendAgent(9 * 60)
  );
  const { md, json } = reportJson(
    proj,
    sid,
    root,
    new Date(T0 + 72 * 3600 * 1000).toISOString()
  );
  const r = json.runs[0];
  assert.equal(
    r.run.completed,
    true,
    '"All tasks complete." followed by "**All 50 tasks complete (100%)**" is a completion line even though it does not match implement.md word for word'
  );
  assert.ok(
    Math.abs(r.totals.wallSec - 12 * 60) < 2,
    `the run ends at the paraphrased completion line (12 min), not at the earlier "once all tasks complete" prose and not three days later at --now; got ${r.totals.wallSec}s`
  );
  assert.match(md, /Completed with the orchestrator's completion line/);
});

test('a final report that only points to /awos:verify ends the run as completed', () => {
  // Newer models skip "All tasks complete (100%)" and write a summary that
  // closes with the pointer to /awos:verify, which implement.md gives only
  // when every task is done.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-profiler-'));
  const { proj, sid } = writeSession(
    root,
    [
      userText(at(0), IMPLEMENT),
      assistant(
        at(10),
        'v-1',
        MAIN,
        [agentCall('tb1', 'typescript-backend', 'Slice 1: backend')],
        20
      ),
      toolResult(at(11), 'tb1', 'Async agent launched successfully'),
      assistant(
        at(15 * 60),
        'v-2',
        MAIN,
        [
          text(
            'Slices 1 to 8 are closed and the suite is green.\n\nRun `/awos:verify` to check the acceptance criteria and mark the spec as Completed.'
          ),
        ],
        40
      ),
    ],
    backendAgent(9 * 60)
  );
  const { json } = reportJson(
    proj,
    sid,
    root,
    new Date(T0 + 72 * 3600 * 1000).toISOString()
  );
  const r = json.runs[0];
  assert.equal(
    r.run.completed,
    true,
    'a closing pointer to /awos:verify marks the run completed even without the "All tasks complete" sentence'
  );
  assert.ok(
    Math.abs(r.totals.wallSec - 15 * 60) < 2,
    `the run ends at the final report (15 min); got ${r.totals.wallSec}s`
  );
});

test('a run with no completion line ends at its last activity, not at the time of the report', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-profiler-'));
  const { proj, sid } = writeSession(
    root,
    [
      userText(at(0), IMPLEMENT),
      assistant(
        at(10),
        'q-1',
        MAIN,
        [agentCall('tb1', 'typescript-backend', 'Slice 1: backend')],
        20
      ),
      toolResult(at(11), 'tb1', 'Async agent launched successfully'),
      assistant(at(20 * 60), 'q-2', MAIN, [text('Waiting for the agent.')], 10),
    ],
    // The background agent keeps writing after the orchestrator's last line.
    backendAgent(33 * 60)
  );
  const { md, json } = reportJson(
    proj,
    sid,
    root,
    new Date(T0 + 72 * 3600 * 1000).toISOString()
  );
  const r = json.runs[0];
  assert.equal(
    r.live,
    false,
    'a run whose transcripts have been quiet for three days is not live'
  );
  assert.ok(
    Math.abs(r.totals.wallSec - 33 * 60) < 2,
    `the run ends at the last line of any transcript in it (the background agent at 33 min), not at --now 72 h later; got ${r.totals.wallSec}s`
  );
  assert.equal(r.stalls.length, 0, 'a finished run reports no live stalls');
  assert.match(
    md,
    /Ended without a completion line; measured to the last transcript activity/,
    'the report says the run ended without a completion line rather than calling it still running'
  );
});

test('a second /better:implement starts a new run, and an answer in between stays inside the first one', () => {
  // A /better:implement run that stops without its completion line is
  // started again with the same command. That prompt is an AWOS command, so
  // it ends the first run; it is not an answer inside it.
  const BETTER =
    '<command-message>better:implement</command-message>\n<command-name>/better:implement</command-name>\n<command-args>008</command-args>';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-profiler-'));
  const { proj, sid } = writeSession(root, [
    userText(at(0), BETTER),
    assistant(
      at(60),
      'b-1',
      MAIN,
      [text('Which port does the backend use?')],
      10
    ),
    userText(at(2 * 60), '8888'),
    assistant(at(3 * 60), 'b-2', MAIN, [text('Working on slice 1.')], 10),
    userText(at(30 * 60), BETTER),
    assistant(
      at(31 * 60),
      'b-3',
      MAIN,
      [text('Implementation run complete. 3/3 tasks done (100%).')],
      10
    ),
  ]);
  const { json } = reportJson(proj, sid, root, at(40 * 60), ['--run', 'all']);
  assert.equal(
    json.runs.length,
    2,
    'two /better:implement prompts make two runs; the answer "8888" does not split the first one'
  );
  const r1 = json.runs[0];
  assert.equal(
    r1.run.endReason,
    'next command',
    'the second /better:implement ends the first run'
  );
  assert.ok(
    Math.abs(r1.totals.wallSec - 30 * 60) < 2,
    `run 1 ends at the second /better:implement at 30 min; got ${r1.totals.wallSec}s`
  );
  assert.deepEqual(
    r1.run.interventions.map((x) => x.text),
    ['8888'],
    'only the answer is a prompt inside the first run, not the next /better:implement'
  );
});

test('answers and "continue" stay inside the run, teammate and usage-limit messages are not prompts, and the next /awos: command starts a new run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-profiler-'));
  const { proj, sid } = writeSession(root, [
    userText(at(0), IMPLEMENT),
    assistant(
      at(2 * 60),
      'r-1',
      MAIN,
      [text('Verify failed. Options: 1. patch it myself 2. route the fix')],
      30
    ),
    userText(at(5 * 60), 'Option 2: route the fix through a subagent'),
    assistant(
      at(6 * 60),
      'r-2',
      MAIN,
      [agentCall('tb1', 'typescript-backend', 'Slice 1: backend')],
      20
    ),
    toolResult(at(6 * 60 + 1), 'tb1', 'Async agent launched successfully'),
    userText(
      at(10 * 60),
      'Another Claude session sent a message: <teammate-message teammate_id="s1-t1"> {"type":"idle_notification"} </teammate-message>'
    ),
    userText(
      at(11 * 60),
      '[Usage limit reached; a short grace allowance remains, then this turn is cut off without warning.]'
    ),
    userText(
      at(12 * 60),
      'Your claude.ai usage limit has reset. Continue the task you were working on.'
    ),
    assistant(
      at(12 * 60 + 30),
      'r-3',
      MAIN,
      [text('API Error: Stream idle timeout - partial response received')],
      5
    ),
    userText(at(14 * 60), 'continue'),
    userText(at(14 * 60 + 30), '/login'),
    userText(
      at(14 * 60 + 40),
      '<local-command-stdout>Login successful</local-command-stdout>'
    ),
    userText(at(14 * 60 + 50), '<bash-input>pwd</bash-input>'),
    userText(
      at(14 * 60 + 51),
      '<bash-stdout>/Users/someone/Work/proj</bash-stdout><bash-stderr></bash-stderr>'
    ),
    assistant(
      at(20 * 60),
      'r-4',
      MAIN,
      [text('All tasks complete (100%).')],
      20
    ),
    userText(at(30 * 60), IMPLEMENT),
    assistant(
      at(31 * 60),
      'r-5',
      MAIN,
      [text('Implementation run complete. 0/0 tasks done (0%).')],
      10
    ),
  ]);
  const { md, json } = reportJson(proj, sid, root, at(40 * 60), [
    '--run',
    'all',
  ]);
  assert.equal(
    json.runs.length,
    2,
    'two /awos:implement prompts make two runs; nothing in between splits the first one'
  );
  const r1 = json.runs[0];
  assert.equal(
    r1.run.completed,
    true,
    'run 1 survives the answer, the teammate message, the usage-limit notices and "continue", and ends at its completion line'
  );
  assert.ok(
    Math.abs(r1.totals.wallSec - 20 * 60) < 2,
    `run 1 spans to its completion line at 20 min; got ${r1.totals.wallSec}s`
  );
  assert.deepEqual(
    r1.run.interventions.map((x) => x.text),
    [
      'Option 2: route the fix through a subagent',
      'continue',
      '/login',
      '<bash-input>pwd</bash-input>',
    ],
    'only what the user typed is an intervention: the teammate message, the host usage-limit notices and the echoed /login and `!pwd` output are not'
  );
  assert.ok(
    Math.abs(r1.totals.userWaitSec - (180 + 90 + 30 + 10)) < 1,
    `wait on the user sums the gap before each prompt (3 min + 90 s + 30 s + 10 s); got ${r1.totals.userWaitSec}s`
  );
  assert.match(
    md,
    /\| Waiting on the user \(4 prompts, 0 questions inside the run\) \| 0\.09 h \|/,
    'the report shows the user wait as its own bucket'
  );
});

test('time the machine slept is taken out of every bucket: no hang, no idle gap, no model time', () => {
  // On 09.11 a benchmark run lost 83 min to idle sleep. The report showed a
  // 16 min "hang" (a tool call across a sleep), a 49 min idle gap marked
  // "machine active" (the sleeping agent wrote its "went to sleep" error
  // lines inside the gap) and sleep counted as model time.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-profiler-'));
  const { proj, sid } = writeSession(
    root,
    [
      userText(at(0), IMPLEMENT),
      assistant(
        at(10),
        's-1',
        MAIN,
        [agentCall('tb1', 'typescript-backend', 'Slice 1: backend')],
        20
      ),
      toolResult(at(11), 'tb1', 'Async agent launched successfully'),
      userText(
        at(50 * 60),
        '<task-notification><task-id>b1</task-id></task-notification>'
      ),
      assistant(
        at(51 * 60),
        's-2',
        MAIN,
        [text('Implementation run complete. 1/1 tasks done (100%).')],
        20
      ),
    ],
    [
      userText(at(11), 'Implement the backend slice', { isSidechain: true }),
      assistant(at(20), 'a-1', SUB, [bash('x1', 'pnpm build')], 40),
      // 25 min tool wait; the OS log says the machine slept 20 min of it.
      toolResult(at(25 * 60 + 20), 'x1', 'built'),
      assistant(at(26 * 60), 'a-2', SUB, [text('Checking the page.')], 30),
      // A request cut by sleep: the error line ends a 20 min gap.
      row(
        'assistant',
        at(46 * 60),
        {
          role: 'assistant',
          id: 'err-1',
          model: '<synthetic>',
          content: [
            text(
              'API Error: Your computer went to sleep mid-response. The response above may be incomplete.'
            ),
          ],
        },
        { isApiErrorMessage: true }
      ),
      assistant(at(47 * 60), 'a-3', SUB, [text('Done.')], 30),
    ]
  );
  // T0 is 16:00 UTC = 19:00 +0300. One sleep 19:01–19:21; "Wake Requests"
  // inside it and an "Entering DarkWake state" later are not sleep edges.
  const log = path.join(root, 'pmset.log');
  fs.writeFileSync(
    log,
    [
      'PM ASL data store: /var/log/powermanagement',
      "2026-09-17 19:01:00 +0300 Sleep               \tEntering Sleep state due to 'Idle Sleep':TCPKeepAlive=active Using AC (Charge:100%) 1 secs",
      '2026-09-17 19:01:01 +0300 Wake Requests       \t[process=dasd request=SleepService deltaSecs=940 wakeAt=2026-09-17 19:16:41]',
      '2026-09-17 19:21:00 +0300 Wake                \tWake from Deep Idle [CDNVA] : due to UserActivity Using AC (Charge:100%) 1 secs',
      "2026-09-17 19:30:00 +0300 Sleep               \tEntering DarkWake state due to 'Software Sleep pid=163': Using AC (Charge:100%) 2 secs",
      '2026-09-17 19:31:00 +0300 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to RTC Using AC (Charge:100%) 30 secs',
    ].join('\n') + '\n'
  );
  const { md, json } = reportJson(proj, sid, root, at(72 * 3600), [
    '--sleep-log',
    log,
  ]);
  const r = json.runs[0];
  const t = r.totals;
  assert.ok(
    Math.abs(t.asleepSec - 40 * 60) < 2,
    `20 min from the OS log + 20 min before the sleep error = 40 min asleep; got ${t.asleepSec}s`
  );
  assert.equal(t.asleepPeriods, 2);
  assert.ok(
    Math.abs(t.awakeSec - 11 * 60) < 2,
    `51 min wall - 40 min asleep = 11 min awake; got ${t.awakeSec}s`
  );
  assert.equal(
    t.hangSec,
    0,
    'a tool call across a sleep is not a hang: 5 min awake'
  );
  assert.ok(
    Math.abs(t.subagentToolSec - 5 * 60) < 2,
    `tool time is the awake 5 min of the 25 min wait; got ${t.subagentToolSec}s`
  );
  assert.ok(
    Math.abs(t.subagentModelSec - 109) < 2,
    `model time is 9 + 40 + 60 s; the 20 min before the sleep error is not model time; got ${t.subagentModelSec}s`
  );
  assert.equal(t.turns, 3, 'the sleep error line is not a model turn');
  assert.equal(
    r.bigGaps.length,
    0,
    'the orchestrator waited 50 min, 40 of them asleep: not an idle gap'
  );
  assert.equal(t.orchestratorIdleSec, 0);
  assert.equal(json.sleepSource, `${log} + transcript sleep errors`);
  assert.match(md, /\(0\.85 h, 0\.18 h with the machine awake\)/);
  assert.match(
    md,
    /\| Machine asleep \(2 periods; source: .*pmset\.log \+ transcript sleep errors\) \| 0\.67 h \|/
  );
});

test('an AskUserQuestion wait is time waiting on the user, not idle and not tool time', () => {
  // A run asked one question in the evening and got the answer in the
  // morning; the report put the whole night into "idle gaps" and showed
  // "Waiting on the user (0 prompts)". Short waits went into tool time.
  const ask = (id, q) => ({
    type: 'tool_use',
    id,
    name: 'AskUserQuestion',
    input: {
      questions: [
        { question: q, options: [{ label: 'Yes' }, { label: 'No' }] },
      ],
    },
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-profiler-'));
  const { proj, sid } = writeSession(root, [
    userText(at(0), IMPLEMENT),
    assistant(
      at(60),
      'u-1',
      MAIN,
      [ask('ask1', 'Accept the failing tests as baseline?')],
      20
    ),
    toolResult(
      at(60 + 3 * 3600),
      'ask1',
      'User has answered your questions: "Accept the failing tests as baseline?"="Yes".'
    ),
    assistant(
      at(3 * 3600 + 200),
      'u-2',
      MAIN,
      [ask('ask2', 'VoiceOver checked?')],
      20
    ),
    toolResult(
      at(3 * 3600 + 320),
      'ask2',
      'User has answered your questions: "VoiceOver checked?"="No".'
    ),
    assistant(
      at(3 * 3600 + 400),
      'u-3',
      MAIN,
      [text('Implementation run complete. 1/1 tasks done (100%).')],
      20
    ),
  ]);
  const { md, json } = reportJson(proj, sid, root, at(72 * 3600));
  const r = json.runs[0];
  const t = r.totals;
  assert.equal(t.userQuestions, 2);
  assert.equal(
    t.userPrompts,
    0,
    'an answer to AskUserQuestion is a tool result, not a typed prompt'
  );
  assert.ok(
    Math.abs(t.userQuestionWaitSec - (3 * 3600 + 120)) < 2,
    `3 h + 2 min on questions; got ${t.userQuestionWaitSec}s`
  );
  assert.ok(Math.abs(t.userWaitSec - (3 * 3600 + 120)) < 2);
  assert.equal(
    t.orchestratorIdleSec,
    0,
    'a night spent on a question is not an idle gap'
  );
  assert.equal(r.bigGaps.length, 0);
  assert.equal(
    t.orchestratorToolSec,
    0,
    'the 2 min question is not orchestrator tool time'
  );
  assert.deepEqual(
    r.run.questions.map((q) => q.text),
    ['Accept the failing tests as baseline?', 'VoiceOver checked?']
  );
  assert.match(
    md,
    /\| Waiting on the user \(0 prompts, 2 questions inside the run\) \| 3\.03 h \|/
  );
  assert.match(
    md,
    /Questions the run asked \(AskUserQuestion\): 2 \("Accept the failing tests as baseline\?" 180\.0 min, "VoiceOver checked\?" 2\.0 min\)/
  );
});

test('project directory resolves from cwd the way Claude Code slugs it', async () => {
  const mod = await import(script);
  assert.equal(
    mod.projectSlug('/Users/someone/Work/proj'),
    '-Users-someone-Work-proj',
    'every non-alphanumeric character in the cwd becomes "-"'
  );
});
