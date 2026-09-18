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
const assistant = (ts, id, model, blocks, outputTokens) =>
  row('assistant', ts, {
    role: 'assistant',
    id,
    model,
    content: blocks,
    usage: { output_tokens: outputTokens },
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
      30
    ),
    toolResult(at(21 * 60 + 1), 'tu2', 'Async agent launched successfully'),
    assistant(
      at(22 * 60),
      'm-main-3',
      MAIN,
      [agentCall('tu4', 'react-frontend', 'Slice 1: verify UI')],
      30
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
        20
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
      assistant(at(15), 'm1', SUB, [thinking(), bash('b1', 'npm test')], 2),
      assistant(
        at(15, 100),
        'm1',
        SUB,
        [thinking(), bash('b1', 'npm test')],
        500
      ),
      toolResult(at(180), 'b1', '# pass 12'),
      assistant(at(185), 'm2', SUB, [bash('b2', 'npm test -- --watch')], 40),
      toolResult(
        at(305),
        'b2',
        'Command did not complete within its 120s timeout and was moved to the background'
      ),
      assistant(at(310), 'm3', SUB, [bash('b3', 'sleep 1000')], 30),
      toolResult(at(1020), 'b3', ''),
      assistant(at(1025), 'm4', SUB, [text('Done. Tests green.')], 60),
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
      assistant(at(29 * 60 + 5), 'm6', MAIN, [text('Forwarded and done.')], 20),
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
  const res = spawnSync(process.execPath, [script, ...args], {
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

test('project directory resolves from cwd the way Claude Code slugs it', async () => {
  const mod = await import(script);
  assert.equal(
    mod.projectSlug('/Users/someone/Work/proj'),
    '-Users-someone-Work-proj',
    'every non-alphanumeric character in the cwd becomes "-"'
  );
});
