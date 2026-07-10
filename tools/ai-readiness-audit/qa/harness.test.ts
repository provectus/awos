/**
 * harness.test.ts — unit smoke of the audit QA harness's pure helpers
 * (harness_lib.ts), driven by synthetic stream-json transcripts and archive
 * trees. Run via `npm run test:audit-harness` (part of `npm test`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  acquireRunLock,
  aggregateSegments,
  assessEngineCompliance,
  collectReportHtml,
  complianceFromTranscript,
  discoverProjectMcp,
  formatWallTime,
  locateOutDir,
  planRetry,
  releaseRunLock,
  restoreTarget,
  scanJudgmentsPatched,
  smokeSignalsFromTranscript,
  stampedPerRepoAudits,
  summarizeOutput,
  tokenCostSummary,
} from './harness_lib.ts';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'audit-harness-test-'));
}

// ---------------------------------------------------------------------------
test('formatWallTime renders NmSSs with zero-padded seconds', () => {
  assert.equal(formatWallTime(424_000), '7m04s', '424s must render as 7m04s');
  assert.equal(formatWallTime(0), '0m00s', '0ms must render as 0m00s');
  assert.equal(
    formatWallTime(59_999),
    '0m59s',
    'sub-minute must floor, not round up'
  );
  assert.equal(
    formatWallTime(3_600_000),
    '60m00s',
    'hours stay expressed in minutes'
  );
});

// ---------------------------------------------------------------------------
const RESULT_EVENT = {
  type: 'result',
  is_error: false,
  total_cost_usd: 1.2345,
  duration_ms: 424_000,
  num_turns: 42,
  usage: {
    input_tokens: 100,
    output_tokens: 200,
    cache_creation_input_tokens: 300,
    cache_read_input_tokens: 400,
  },
  modelUsage: { 'claude-sonnet': { inputTokens: 100 } },
};

test('tokenCostSummary extracts cost/tokens/turns from a result event', () => {
  const t = tokenCostSummary({ ...RESULT_EVENT, wall_ms: 500_000 });
  assert.equal(t.total_cost_usd, 1.2345, 'cost comes from total_cost_usd');
  assert.equal(
    t.input_tokens,
    100,
    'input tokens come from usage.input_tokens'
  );
  assert.equal(
    t.output_tokens,
    200,
    'output tokens come from usage.output_tokens'
  );
  assert.equal(
    t.cache_creation_input_tokens,
    300,
    'cache-write tokens tracked'
  );
  assert.equal(t.cache_read_input_tokens, 400, 'cache-read tokens tracked');
  assert.equal(t.num_turns, 42, 'turn count comes from num_turns');
  assert.equal(t.duration_ms, 424_000, 'api duration preserved');
  assert.equal(t.wall_ms, 500_000, 'wall time preserved');
});

test('aggregateSegments sums turns/duration, maxes cost, keeps biggest usage', () => {
  const seg1 = {
    ...RESULT_EVENT,
    num_turns: 9,
    duration_ms: 78_000,
    total_cost_usd: 0.5,
    usage: {
      ...RESULT_EVENT.usage,
      input_tokens: 50,
      cache_read_input_tokens: 10,
    },
  };
  const seg2 = {
    ...RESULT_EVENT,
    num_turns: 85,
    duration_ms: 1_049_000,
    total_cost_usd: 4.2,
    is_error: false,
  };
  const agg = aggregateSegments([seg1, seg2], 1_200_000);
  assert.equal(agg.num_turns, 94, 'turns must SUM across resume segments');
  assert.equal(
    agg.duration_ms,
    1_127_000,
    'durations must SUM across segments'
  );
  assert.equal(agg.total_cost_usd, 4.2, 'cost is cumulative → take the max');
  assert.equal(agg.result_segments, 2, 'segment count recorded');
  assert.equal(
    agg.wall_ms,
    1_200_000,
    'wall time is caller-measured start→finish'
  );
  assert.equal(
    agg.usage.input_tokens,
    100,
    'usage comes from the segment with the largest input footprint'
  );
  assert.equal(agg.is_error, false, 'no segment errored → not an error');
  const aggErr = aggregateSegments([seg1, { ...seg2, is_error: true }], 1);
  assert.equal(
    aggErr.is_error,
    true,
    'any errored segment marks the run errored'
  );
});

// ---------------------------------------------------------------------------
function transcriptLine(ev: any): string {
  return JSON.stringify(ev);
}

const BASH_AUDIT_CORE = transcriptLine({
  type: 'assistant',
  message: {
    content: [
      {
        type: 'tool_use',
        name: 'Bash',
        input: {
          command:
            'node "$ENGINE" audit-core /repo /repo/context/audits/2026-07-03',
        },
      },
    ],
  },
});
const PROMPT_TEXT_MENTION = transcriptLine({
  type: 'assistant',
  message: {
    content: [
      { type: 'text', text: 'I will now run audit-core as instructed.' },
    ],
  },
});
const FANOUT_SPAWN = transcriptLine({
  type: 'assistant',
  message: {
    content: [
      {
        type: 'tool_use',
        name: 'Agent',
        input: {
          subagent_type: 'dimension-auditor',
          description: 'Audit dimension X',
          prompt: 'grade the dimension',
        },
      },
    ],
  },
});
// Echo of the retired load-time injection's marker (date substituted). The
// injection is deleted from SKILL.md; the marker must never count as
// compliance again — a model could produce it with a plain `echo` without
// ever running the engine.
const ECHOED_MARKER = transcriptLine({
  type: 'user',
  message: {
    content: [
      {
        type: 'text',
        text: '[audit-core] one-pass deterministic engine → context/audits/2026-07-03',
      },
    ],
  },
});

test('complianceFromTranscript counts execution signals, not prompt text', () => {
  const sig = complianceFromTranscript([
    'not json at all',
    '',
    PROMPT_TEXT_MENTION,
    BASH_AUDIT_CORE,
    BASH_AUDIT_CORE,
    FANOUT_SPAWN,
    ECHOED_MARKER,
  ]);
  assert.equal(
    sig.audit_core_calls,
    2,
    'each Bash tool_use running audit-core counts'
  );
  assert.equal(
    sig.fanout_agent_spawns,
    1,
    'dimension-auditor Agent spawns are counted'
  );
  const echoOnly = complianceFromTranscript([ECHOED_MARKER]);
  assert.equal(
    echoOnly.audit_core_calls,
    0,
    'an echoed injection marker is not an engine invocation — only a Bash tool_use running audit-core counts'
  );
});

test('smokeSignalsFromTranscript flags hand-written artifacts, inline compute, and question stalls', () => {
  const toolUse = (name: string, input: Record<string, unknown>) =>
    transcriptLine({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name, input }] },
    });
  const text = (t: string) =>
    transcriptLine({
      type: 'assistant',
      message: { content: [{ type: 'text', text: t }] },
    });

  const sig = smokeSignalsFromTranscript([
    toolUse('Write', {
      file_path: '/repo/context/audits/2026-07-03/report.md',
    }),
    toolUse('Edit', { file_path: 'context/audits/2026-07-03/audit.json' }),
    toolUse('Write', {
      file_path: 'context/audits/2026-07-03/judgments.json',
    }),
    toolUse('Write', {
      file_path: 'context/audits/2026-07-03/report-blocks.json',
    }),
    toolUse('Bash', { command: 'python3 -c "print(1+1)"' }),
    toolUse('Bash', {
      command: 'echo "{}" > context/audits/2026-07-03/spec.json',
    }),
    toolUse('Bash', {
      command: "cat > context/audits/2026-07-03/judgments.json <<'JSON'",
    }),
    // Connector artifact mapping is Step 5.1's sanctioned job — never a violation.
    toolUse('Write', {
      file_path: 'context/audits/2026-07-03/collected/tracker.json',
    }),
    text('Which repos should I include in the audit scope?'),
  ]);
  assert.equal(
    sig.handwritten_report_writes,
    1,
    'a Write to report.md is a hand-written report'
  );
  assert.equal(
    sig.hand_json_writes,
    2,
    'Edit of audit.json + shell redirect into spec.json count; judgments.json/report-blocks.json/collected/*.json writes are the sanctioned exceptions'
  );
  assert.equal(
    sig.hand_compute_calls,
    1,
    'python3 -c is the hand-scoring improvisation marker'
  );
  assert.equal(
    sig.final_text_is_question,
    true,
    'a run whose final assistant text ends with "?" stalled asking an absent user'
  );

  const clean = smokeSignalsFromTranscript([
    toolUse('Bash', {
      command: 'node "/skill/dist/cli.js" audit-core /repo out',
    }),
    text('Audit complete — report at context/audits/2026-07-03/report.html.'),
  ]);
  assert.deepEqual(
    clean,
    {
      handwritten_report_writes: 0,
      hand_json_writes: 0,
      hand_compute_calls: 0,
      final_text_is_question: false,
    },
    'a compliant engine-driven run must produce zero go-wild signals'
  );
});

test('assessEngineCompliance requires audit.json AND an engine signal', () => {
  const dir = tmp();
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const runLog = path.join(dir, 'run.jsonl');
  fs.writeFileSync(runLog, `${BASH_AUDIT_CORE}\n`);

  let comp = assessEngineCompliance(outDir, runLog);
  assert.equal(
    comp.has_audit_json,
    false,
    'no audit.json → has_audit_json=false'
  );
  assert.equal(
    comp.engine_compliant,
    false,
    'audit-core call without audit.json is still non-compliant'
  );

  fs.writeFileSync(path.join(outDir, 'audit.json'), '{}');
  comp = assessEngineCompliance(outDir, runLog);
  assert.equal(
    comp.audit_core_calls,
    1,
    'Bash audit-core call counted from transcript'
  );
  assert.equal(
    comp.engine_compliant,
    true,
    'audit.json + audit-core call → compliant'
  );

  fs.writeFileSync(runLog, `${FANOUT_SPAWN}\n`);
  comp = assessEngineCompliance(outDir, runLog);
  assert.equal(
    comp.engine_compliant,
    false,
    'audit.json without any engine signal (fan-out only) is non-compliant'
  );
  assert.equal(
    comp.fanout_agent_spawns,
    1,
    'fan-out spawns recorded as evidence'
  );
});

// Regression pin: barhopping org run 2026-07-06. The rollup-corrective retry
// is TOLD not to re-run audit-core (the per-repo audits are done and
// preserved), so a CORRECT rollup-only retry has audit_core_calls=0 in its own
// transcript. Gating on the current transcript alone rejected every such
// retry — the harness discarded a valid org-portfolio.json and re-ran the
// whole 8-repo fan-out to retry exhaustion.
test('assessEngineCompliance accepts a rollup-only retry via carried engine calls', () => {
  const dir = tmp();
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'org-portfolio.json'), '{}');
  const runLog = path.join(dir, 'run.jsonl');
  // The rollup retry's transcript: rollup + render, but NO audit-core call.
  fs.writeFileSync(
    runLog,
    transcriptLine({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: { command: 'node "$ENGINE" rollup out/per-repo/' },
          },
        ],
      },
    }) + '\n'
  );

  const rejected = assessEngineCompliance(outDir, runLog);
  assert.equal(
    rejected.engine_compliant,
    false,
    'without carried calls a zero-audit-core attempt stays non-compliant (this was the bug: the gate could never pass a correct rollup retry)'
  );

  const carried = assessEngineCompliance(outDir, runLog, 8);
  assert.equal(
    carried.engine_compliant,
    true,
    'org-portfolio.json + engine calls carried from the preserved earlier attempt → the rollup-only retry is compliant'
  );
  assert.equal(
    carried.audit_core_calls,
    0,
    'the current transcript honestly reports zero audit-core calls'
  );
  assert.equal(
    carried.carried_audit_core_calls,
    8,
    'the carried count is recorded for run-meta/summary transparency'
  );

  fs.rmSync(path.join(outDir, 'org-portfolio.json'));
  const noArtifact = assessEngineCompliance(outDir, runLog, 8);
  assert.equal(
    noArtifact.engine_compliant,
    false,
    'carried calls never vouch for a run that produced no org root artifact'
  );
});

test('carried calls do not launder stale artifacts — a run must re-run audit-core', () => {
  // A model could satisfy a disk-only gate by copying a leftover audit.json
  // into the output dir without ever running the engine. With zero calls in
  // the transcript AND zero carried (nothing was preserved by the harness),
  // the copied artifact must stay non-compliant.
  const dir = tmp();
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'audit.json'),
    JSON.stringify({ engine: { generated_by: 'audit-core' }, audit_total: 1 })
  );
  const runLog = path.join(dir, 'run.jsonl');
  fs.writeFileSync(
    runLog,
    transcriptLine({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: { command: 'cp -r context/audits/2026-07-01 out' },
          },
        ],
      },
    }) + '\n'
  );
  const comp = assessEngineCompliance(outDir, runLog, 0);
  assert.equal(
    comp.engine_compliant,
    false,
    'a stamped-but-copied audit.json with no engine call anywhere in the run is non-compliant — the stamp is provenance of a PAST run, not this one'
  );
});

test('planRetry keeps a finished org fan-out and clears everything else', () => {
  const audits = tmp();
  const mkOut = (name: string): string => {
    const d = path.join(audits, name);
    fs.mkdirSync(d, { recursive: true });
    return d;
  };
  const stampRepo = (outDir: string, repo: string) => {
    fs.mkdirSync(path.join(outDir, 'per-repo', repo), { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'per-repo', repo, 'audit.json'),
      JSON.stringify({ engine: { generated_by: 'audit-core' } })
    );
  };

  assert.deepEqual(
    planRetry(''),
    { kind: 'fresh' },
    'no previous output dir → fresh relaunch, nothing to clear or keep'
  );
  assert.deepEqual(
    planRetry(path.join(audits, 'missing')),
    { kind: 'fresh' },
    'a nonexistent dir → fresh relaunch'
  );

  const rollupReady = mkOut('rollup-ready');
  stampRepo(rollupReady, 'repo-a');
  stampRepo(rollupReady, 'repo-b');
  assert.deepEqual(
    planRetry(rollupReady),
    { kind: 'rollup', dir: rollupReady, repos: ['repo-a', 'repo-b'] },
    'stamped per-repo audits with no org root artifact → preserve them, retry only rollup+render'
  );

  const rolledUp = mkOut('rolled-up');
  stampRepo(rolledUp, 'repo-a');
  fs.writeFileSync(path.join(rolledUp, 'org-portfolio.json'), '{}');
  assert.deepEqual(
    planRetry(rolledUp),
    { kind: 'clear', dir: rolledUp },
    'org root already present but the attempt still failed compliance → the output is suspect, clear it'
  );

  const handBuilt = mkOut('hand-built');
  fs.mkdirSync(path.join(handBuilt, 'per-repo', 'repo-a'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(handBuilt, 'per-repo', 'repo-a', 'audit.json'),
    JSON.stringify({ audit_total: 12 }) // no engine provenance stamp
  );
  assert.deepEqual(
    planRetry(handBuilt),
    { kind: 'clear', dir: handBuilt },
    'unstamped per-repo audits are not engine output — nothing to preserve, clear and restart'
  );

  const singleRepo = mkOut('single');
  fs.writeFileSync(path.join(singleRepo, 'audit.json'), '{}');
  assert.deepEqual(
    planRetry(singleRepo),
    { kind: 'clear', dir: singleRepo },
    'single-repo non-compliant output (audit.json present, gate failed) is cleared as before'
  );
});

// Regression pin: barhopping 2026-07-07. A second harness run launched 13 min
// into a live one — it stashed the live run's half-written output, its
// orchestrator adopted the other session's artifacts as "already audited" and
// spun ~10 min re-verifying files that kept changing under it, and its
// finally-restore left the marketplace pointing at the worktree. The lock
// makes the second run die immediately instead.
test('run lock: second acquire fails while the holder lives, stale locks are taken over, release is owner-only', () => {
  const lockPath = path.join(tmp(), 'harness.lock');

  acquireRunLock('/some/target', lockPath);
  const holder = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.equal(
    holder.pid,
    process.pid,
    'the lock file records the holding pid'
  );
  assert.equal(
    holder.target,
    '/some/target',
    'the lock file records the held target for the error message'
  );

  assert.throws(
    () => acquireRunLock('/other/target', lockPath),
    /already active/,
    'a second run must die fast while the holder process is alive — concurrent runs corrupt the shared marketplace and the live context/audits/<date>/'
  );

  releaseRunLock(lockPath);
  assert.equal(
    fs.existsSync(lockPath),
    false,
    'release removes the lock the process holds'
  );

  // Stale lock: holder pid is dead (crash/SIGKILL — no finally ran).
  fs.writeFileSync(
    lockPath,
    JSON.stringify({ pid: 999999999, target: '/dead', started_utc: 'x' })
  );
  acquireRunLock('/new/target', lockPath);
  assert.equal(
    JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid,
    process.pid,
    'a lock whose holder is dead is stale and silently taken over'
  );

  // Corrupt lock file → also stale.
  fs.writeFileSync(lockPath, '{not json');
  acquireRunLock('/new/target', lockPath);
  assert.equal(
    JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid,
    process.pid,
    'an unreadable lock file is treated as stale, not as a live holder'
  );

  // Release never removes someone else's lock.
  fs.writeFileSync(
    lockPath,
    JSON.stringify({ pid: 999999999, target: '/other', started_utc: 'x' })
  );
  releaseRunLock(lockPath);
  assert.equal(
    fs.existsSync(lockPath),
    true,
    'release is owner-only — it must never delete a lock held by another pid'
  );
});

// ---------------------------------------------------------------------------
test('collectReportHtml finds the single-repo archived report.html', () => {
  const archived = tmp();
  fs.writeFileSync(path.join(archived, 'audit.json'), '{}');
  fs.writeFileSync(path.join(archived, 'report.html'), '<html></html>');
  const r = collectReportHtml(archived);
  assert.deepEqual(
    r.paths,
    [path.join(archived, 'report.html')],
    'single mode returns the one absolute archived report.html path'
  );
  assert.deepEqual(r.missing, [], 'nothing missing when report.html exists');
});

test('collectReportHtml lists org + per-repo reports and flags missing ones', () => {
  const archived = tmp();
  fs.writeFileSync(path.join(archived, 'org-portfolio.json'), '{}');
  fs.writeFileSync(path.join(archived, 'report.html'), '<html></html>');
  fs.mkdirSync(path.join(archived, 'per-repo', 'repo-a'), { recursive: true });
  fs.mkdirSync(path.join(archived, 'per-repo', 'repo-b'), { recursive: true });
  fs.writeFileSync(
    path.join(archived, 'per-repo', 'repo-a', 'report.html'),
    'x'
  );
  const r = collectReportHtml(archived);
  assert.deepEqual(
    r.paths,
    [
      path.join(archived, 'report.html'),
      path.join(archived, 'per-repo', 'repo-a', 'report.html'),
    ],
    'org mode returns the org report plus each existing per-repo report'
  );
  assert.deepEqual(
    r.missing,
    [path.join(archived, 'per-repo', 'repo-b', 'report.html')],
    'a per-repo dir without report.html is reported as missing'
  );
});

test('collectReportHtml on a missing archive reports the expected report as missing', () => {
  const r = collectReportHtml(path.join(tmp(), 'nonexistent'));
  assert.deepEqual(r.paths, [], 'no archive → no report paths');
  assert.equal(
    r.missing.length,
    1,
    'the expected report.html is flagged missing'
  );
});

// ---------------------------------------------------------------------------
test('scanJudgmentsPatched detects leftover PENDING_JUDGMENT in any audit.json', () => {
  const clean = tmp();
  fs.writeFileSync(
    path.join(clean, 'audit.json'),
    JSON.stringify({ dimensions: [{ checks: [{ status: 'PASS' }] }] })
  );
  assert.equal(
    scanJudgmentsPatched(clean),
    true,
    'no PENDING_JUDGMENT anywhere → judgments patched'
  );

  const pending = tmp();
  fs.mkdirSync(path.join(pending, 'per-repo', 'repo-a'), { recursive: true });
  fs.writeFileSync(path.join(pending, 'audit.json'), '{}');
  fs.writeFileSync(
    path.join(pending, 'per-repo', 'repo-a', 'audit.json'),
    JSON.stringify({ checks: [{ status: 'PENDING_JUDGMENT' }] })
  );
  assert.equal(
    scanJudgmentsPatched(pending),
    false,
    'PENDING_JUDGMENT in a nested per-repo audit.json → not patched'
  );

  assert.equal(
    scanJudgmentsPatched(tmp()),
    null,
    'no audit.json archived at all → verdict is null (unknown)'
  );
});

// ---------------------------------------------------------------------------
test('summarizeOutput reads single-repo and org archives', () => {
  const single = tmp();
  fs.writeFileSync(
    path.join(single, 'audit.json'),
    JSON.stringify({
      audit_total: 123,
      coverage: 0.61,
      dimensions: [
        { dimension: 'quality-assurance', score: 10, coverage: 0.5 },
      ],
    })
  );
  assert.deepEqual(
    summarizeOutput(single),
    {
      mode: 'single',
      audit_total: 123,
      coverage: 0.61,
      dimensions: { 'quality-assurance': { score: 10, coverage: 0.5 } },
    },
    'single mode summarizes audit_total, coverage, and per-dimension scores'
  );

  const org = tmp();
  fs.writeFileSync(
    path.join(org, 'org-portfolio.json'),
    JSON.stringify({ portfolio_metrics: { mean: 1 } })
  );
  fs.mkdirSync(path.join(org, 'per-repo', 'a'), { recursive: true });
  fs.mkdirSync(path.join(org, 'per-repo', 'b'), { recursive: true });
  fs.writeFileSync(path.join(org, 'per-repo', 'a', 'audit.json'), '{}');
  fs.writeFileSync(path.join(org, 'per-repo', 'b', 'audit.json'), '{}');
  assert.deepEqual(
    summarizeOutput(org),
    { mode: 'org', portfolio_metrics: { mean: 1 }, repos: 2 },
    'org mode counts per-repo/*/audit.json and surfaces portfolio_metrics'
  );
});

test('discoverProjectMcp: target + repo configs merge, VS Code shape normalizes, collisions get suffixed', () => {
  const dir = tmp();
  const write = (rel: string, doc: unknown) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(doc));
  };
  // Org folder: VS Code-shaped config ({servers} key, not {mcpServers}).
  write('.vscode/mcp.json', {
    servers: { tracker: { type: 'http', url: 'https://org.example/mcp' } },
  });
  // Repo A declares its own server + a colliding "tracker" with a DIFFERENT url.
  write('repoA/.mcp.json', {
    mcpServers: {
      barley: { type: 'http', url: 'https://barley.example/mcp' },
      tracker: { type: 'http', url: 'https://repoA.example/mcp' },
    },
  });
  // Repo B re-declares "barley" IDENTICALLY — must collapse, not duplicate.
  write('repoB/mcp.json', {
    mcpServers: { barley: { type: 'http', url: 'https://barley.example/mcp' } },
  });

  const found = discoverProjectMcp(dir, [
    path.join(dir, 'repoA'),
    path.join(dir, 'repoB'),
  ]);
  assert.deepEqual(
    Object.keys(found.servers).sort(),
    ['barley', 'tracker', 'tracker__repoA'],
    'org tracker kept, repoA collision suffixed, identical barley collapsed'
  );
  assert.equal(
    found.files.length,
    3,
    'every contributing config file is reported for the probe log'
  );
  assert.equal(
    (found.servers['tracker'] as any).url,
    'https://org.example/mcp',
    'the VS Code {servers} shape must normalize into mcpServers entries'
  );
});

test('stampedPerRepoAudits keeps only engine-stamped per-repo audits (retry must not redo them)', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'awos-stamped-'));
  const mk = (repo: string, content: string | null) => {
    fs.mkdirSync(path.join(out, 'per-repo', repo), { recursive: true });
    if (content !== null) {
      fs.writeFileSync(path.join(out, 'per-repo', repo, 'audit.json'), content);
    }
  };
  mk('done', JSON.stringify({ engine: { generated_by: 'audit-core@x' } }));
  mk('hand-built', JSON.stringify({ audit_total: 12 })); // no provenance stamp
  mk('unfinished', null); // dispatched but never wrote audit.json
  mk('corrupt', '{not json');
  assert.deepEqual(
    stampedPerRepoAudits(out),
    ['done'],
    'only the engine-stamped audit counts as completed; unstamped/missing/corrupt repos must be re-dispatched'
  );
  assert.deepEqual(
    stampedPerRepoAudits(path.join(out, 'nowhere')),
    [],
    'a missing per-repo dir means nothing is preserved'
  );
});

// ---------------------------------------------------------------------------
test('restoreTarget removes only run-added dirs once archived, never pre-existing audits', () => {
  const target = tmp();
  const runDir = tmp();
  const audits = path.join(target, 'context/audits');
  // Pre-existing audit (in the pre-run snapshot) + run-generated output.
  const old = path.join(audits, '2026-06-01_09-00-00');
  fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(path.join(old, 'audit.json'), '{"old":true}');
  const gen = path.join(audits, '2026-07-07_10-00-00');
  fs.mkdirSync(gen, { recursive: true });
  fs.writeFileSync(path.join(gen, 'audit.json'), '{}');
  fs.mkdirSync(path.join(runDir, 'audit-output'), { recursive: true });

  restoreTarget(target, runDir, ['2026-06-01_09-00-00']);

  assert.ok(
    !fs.existsSync(gen),
    'run-generated audit output must be removed from the target once archived — harness runs must not persist reports in real repos'
  );
  assert.ok(
    fs.existsSync(path.join(old, 'audit.json')),
    'pre-existing audits (in the pre-run snapshot) must never be touched'
  );
});

test('restoreTarget keeps generated output in the target when nothing was archived', () => {
  const target = tmp();
  const runDir = tmp(); // no audit-output/ → the run died before archiving
  const gen = path.join(target, 'context/audits/2026-07-07_11-00-00');
  fs.mkdirSync(gen, { recursive: true });
  fs.writeFileSync(path.join(gen, 'audit.json'), '{}');

  restoreTarget(target, runDir, []);

  assert.ok(
    fs.existsSync(path.join(gen, 'audit.json')),
    'un-archived output must never be deleted — a dead run keeps its only copy in the target'
  );
});

test('locateOutDir skips pre-existing snapshot dirs and finds only the run-created one', () => {
  const audits = tmp();
  fs.mkdirSync(path.join(audits, '2026-07-07_09-00-00'), { recursive: true });
  fs.mkdirSync(path.join(audits, '2026-07-07_10-30-00'), { recursive: true });
  const found = locateOutDir(audits, '2026-07-07', ['2026-07-07_09-00-00']);
  assert.equal(
    path.basename(found),
    '2026-07-07_10-30-00',
    'locateOutDir must ignore dirs from the pre-run snapshot and return the dir the run created'
  );
  assert.equal(
    locateOutDir(audits, '2026-07-07', [
      '2026-07-07_09-00-00',
      '2026-07-07_10-30-00',
    ]),
    '',
    'when every dir is pre-existing, locateOutDir must report no output rather than adopt an old audit'
  );
});
