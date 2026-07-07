#!/usr/bin/env node
/**
 * run_audit_test.ts — repeatable test harness for the /awos:ai-readiness-audit skill.
 *
 * Run with: node --import tsx tools/ai-readiness-audit/qa/run_audit_test.ts …
 * (or `npm run audit:test -- …`; `npm ci` first — tsx is a devDependency).
 *
 * Pipeline per run:
 *   1. Provenance — which awos commit/branch(+dirty) the skill-under-test is from, which
 *      target repo(+commit), claude version, UTC timestamp.
 *   2. Serve the worktree — the awos-marketplace is a *directory source*; `claude` serves
 *      the plugin live from its installLocation (the main checkout), NOT from the version
 *      caches. So we repoint the marketplace's source.path + installLocation at the worktree
 *      and `claude plugin marketplace update`, then RESTORE the originals in a finally block
 *      after the run (and a failed run still restores). Deploying to the caches — the old
 *      approach — was never loaded by claude. `--no-deploy` skips the repoint.
 *   3. Prepare target context/audits/ for the chosen --phase:
 *        first  → blank slate, NO previous audit (tests the empty case).
 *        second → seed a previous audit from the archive (tests the delta case).
 *      Whatever was there is stashed into the run archive first; nothing is deleted outright.
 *   4. Run the audit headless via `claude -p … --output-format stream-json`, tee the full
 *      transcript to disk while streaming a concise live log to stderr (see --quiet).
 *   5. Measure tokens — parse the stream-json `result` events for total_cost_usd, usage
 *      (in/out/cache), duration, turns. The skill does NOT report tokens; this script does.
 *   6. Archive the whole context/audits/<date>/ output + run-meta.json under a
 *      timestamp+commit-keyed dir, so every run is kept and is comparable, then print a
 *      final summary block (wall time, tokens, cost, compliance, archived report.html).
 *
 * Org mode is left to the skill: if exploration finds the repo depends on another repo
 * (e.g. via an outside-pointing symlink), the skill audits that repo too. We pin nothing.
 *
 * This is run mostly by Claude Code, so the CLI is intentionally explicit. See README.md.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  CLAUDE_AUDIT_CMD,
  MARKET_NAME,
  acquireRunLock,
  aggregateSegments,
  assessEngineCompliance,
  awosMainCheckout,
  collectReportHtml,
  discoverProjectMcp,
  formatWallTime,
  gitRepoSubdirs,
  isDir,
  isFile,
  isMainModule,
  locateOutDir,
  planRetry,
  readJson,
  releaseRunLock,
  repointMarketplace,
  restoreMarketplace,
  runClaudeAudit,
  scanJudgmentsPatched,
  scriptRepoRoot,
  summarizeOutput,
  tokenCostSummary,
} from './harness_lib.ts';
import type { Compliance, MarketPaths, ReportHtml } from './harness_lib.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Appended to the system prompt on engine-skip retries only. The previous
// attempt's leftover artifacts are what the model cites to justify skipping
// audit-core, so the retry must explicitly demolish that premise.
const RETRY_CORRECTIVE_PROMPT =
  'CORRECTIVE NOTE (the previous attempt was non-compliant and its output ' +
  'was discarded): nothing has scored anything yet. There is no pre-run; ' +
  'any existing context/audits/<date>/ content is stale and must be ' +
  'overwritten. Your first scoring action MUST be running the deterministic ' +
  'engine yourself: node "<skill-dir>/dist/cli.js" audit-core <repoPath> ' +
  '<outDir>. Never hand-compute metrics (no grep/python/inline scripts for ' +
  'scoring), never hand-assemble audit JSON, and never spawn per-dimension ' +
  'auditor subagents.';

// Appended instead when an org-mode attempt finished its per-repo audits but
// ended without the portfolio rollup (observed: 8/8 per-repo audit.json
// written, session over, no org-portfolio.json). Those audits are engine
// output and are deliberately PRESERVED across the retry — re-dispatching
// the whole fan-out turned one missed step into a ~$35 re-run.
const RETRY_ROLLUP_PROMPT =
  'CORRECTIVE NOTE (the previous attempt completed every per-repo audit but ' +
  'ended without the portfolio rollup): the per-repo audits under ' +
  'context/audits/<date>/per-repo/ are DONE and preserved. Do not re-dispatch ' +
  'repo-auditor subagents and do not re-run audit-core for any repo whose ' +
  'per-repo/<repo>/audit.json already exists. Your only remaining actions, in ' +
  'order: node "<skill-dir>/dist/cli.js" rollup <outDir>/per-repo/, assemble ' +
  'org-portfolio.json per the skill, then render --format both. Do not ' +
  'investigate metric values or engine internals — run those steps and finish.';

// Archive lives in the awos main checkout's tmp/ (kept here on purpose, gitignored).
// Resolved, not hardcoded, so the location is stable but portable.
const ARCHIVE_ROOT = path.join(awosMainCheckout(HERE), 'tmp', 'audit-runs');
// Default skill-under-test is the checkout this harness is run from; override with --worktree.
const DEFAULT_WORKTREE = scriptRepoRoot(HERE);

let QUIET = false;

function log(msg = ''): void {
  if (!QUIET) console.log(msg);
}

/** Warnings/verdicts that must surface even under --quiet (stderr). */
function warn(msg = ''): void {
  console.error(msg);
}

/**
 * Fatal-error signal. Thrown (not process.exit'ed) so that a die() inside
 * main's try block still runs the finally-restore of the marketplace —
 * process.exit would skip `finally` and leave the user's marketplace pointed
 * at the worktree. The top-level runner converts it to the exit code.
 */
class HarnessExit extends Error {
  code: number;
  constructor(msg: string, code: number) {
    super(msg);
    this.code = code;
  }
}

function die(msg: string, code = 2): never {
  throw new HarnessExit(msg, code);
}

function git(repo: string, ...args: string[]): string {
  const p = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  return (p.stdout || '').trim();
}

/** shutil.move equivalent: rename, falling back to copy+delete across devices. */
function moveSync(src: string, dest: string): void {
  try {
    fs.renameSync(src, dest);
  } catch (e: any) {
    if (e?.code !== 'EXDEV') throw e;
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
/** Newest archived run for this target that has a usable audit-output/audit.json. */
function newestSeedFor(targetName: string, excludeRun: string): string | null {
  const base = path.join(ARCHIVE_ROOT, targetName);
  if (!isDir(base)) return null;
  const runs = fs
    .readdirSync(base)
    .sort()
    .reverse()
    .map((d) => path.join(base, d));
  for (const r of runs) {
    if (path.resolve(r) === path.resolve(excludeRun)) continue;
    if (isFile(path.join(r, 'audit-output', 'audit.json'))) return r;
  }
  return null;
}

/** Accept an archived run dir, an audit-output dir, or a context/audits/<date> dir. */
function resolveSeedOutput(seedFrom: string): string {
  const cand = path.join(seedFrom, 'audit-output');
  if (isFile(path.join(cand, 'audit.json'))) return cand;
  if (isFile(path.join(seedFrom, 'audit.json'))) return seedFrom;
  die(`--seed-from has no audit.json: ${seedFrom}`);
}

function prepareTarget(
  target: string,
  phase: string,
  runDir: string,
  seedFrom: string | null,
  seedDate: string,
  today: string
): string | null {
  const audits = path.join(target, 'context/audits');
  // stash whatever exists (safety; never deleted) then blank
  if (isDir(audits) && fs.readdirSync(audits).length) {
    const stash = path.join(runDir, '_preexisting');
    fs.mkdirSync(stash, { recursive: true });
    for (const n of fs.readdirSync(audits)) {
      moveSync(path.join(audits, n), path.join(stash, n));
    }
    log(`  ✓ stashed pre-existing context/audits -> ${stash}`);
  }
  fs.mkdirSync(audits, { recursive: true });

  if (phase === 'first') {
    log('  phase=first → blank slate, no previous audit');
    return null;
  }

  // phase == second: seed a previous audit under a non-today date
  const out = resolveSeedOutput(seedFrom as string);
  let sd = seedDate;
  if (!sd) {
    let fromSeed: string | null = null;
    try {
      fromSeed = readJson(path.join(out, 'audit.json')).date ?? null;
    } catch {
      fromSeed = null;
    }
    if (!fromSeed || fromSeed === today) {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      fromSeed = d.toISOString().slice(0, 10);
    }
    sd = fromSeed;
  }
  if (sd === today) {
    die(
      'seed date must differ from today (skill only treats other dates as previous)'
    );
  }
  const dest = path.join(audits, sd);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(out, dest, { recursive: true });
  log(
    `  phase=second → seeded previous audit at context/audits/${sd} (from ${out})`
  );
  return sd;
}

// ---------------------------------------------------------------------------
/**
 * Launch claude, tee the transcript to runLog, stream a concise live log to
 * stderr, and return the aggregated result event + exit code.
 *
 * Live log (suppressed by --quiet), each line prefixed with elapsed [MmSSs]:
 *   - every Bash tool_use (first ~80 chars of the command — audit-core /
 *     enrich / patch-judgment / render calls stay visible),
 *   - every Agent/Task spawn (subagent type + description),
 *   - assistant text matching the skill's progress emissions
 *     (/\[Audit\]|pct|eta_seconds/),
 *   - per-segment result summaries,
 *   - a heartbeat after every 60s without stream events.
 */
async function streamRun(
  target: string,
  claudeFlags: string[],
  runLog: string
): Promise<[any, number]> {
  log(`▶ ${[...CLAUDE_AUDIT_CMD, ...claudeFlags].join(' ')}  (cwd=${target})`);
  log('─'.repeat(60));
  let result: any = {};
  const segments: any[] = [];
  const live = (msg: string, elapsedMs: number): void => {
    if (!QUIET) {
      process.stderr.write(`[${formatWallTime(elapsedMs)}] ${msg}\n`);
    }
  };
  const onEvent = (ev: any, elapsedMs: number): void => {
    const t = ev.type;
    if (t === 'system' && ev.subtype === 'init') {
      live(`▶ session — model=${ev.model ?? '?'}`, elapsedMs);
    } else if (t === 'assistant') {
      for (const b of ev.message?.content ?? []) {
        if (b?.type === 'text') {
          const txt = String(b.text ?? '')
            .split(/\s+/)
            .join(' ');
          if (txt && /\[Audit\]|pct|eta_seconds/.test(txt)) {
            live(`💬 ${txt.slice(0, 240)}`, elapsedMs);
          }
        } else if (b?.type === 'tool_use') {
          const name = b.name ?? '?';
          const inp = b.input ?? {};
          if (name === 'Bash') {
            const oneLine = String(inp.command ?? '')
              .split(/\s+/)
              .join(' ');
            live(`🔧 Bash ${oneLine.slice(0, 80)}`.trimEnd(), elapsedMs);
          } else if (name === 'Agent' || name === 'Task') {
            const hint = [inp.subagent_type, inp.description]
              .filter(Boolean)
              .map((v) => String(v).split(/\s+/).join(' '))
              .join(' — ');
            live(`🤖 ${name} ${hint.slice(0, 120)}`.trimEnd(), elapsedMs);
          }
        }
      }
    } else if (t === 'result') {
      result = ev;
      segments.push(ev);
      const u = ev.usage ?? {};
      const mark = ev.is_error ? '✗ ERROR' : '✓ segment done';
      live(
        `${mark} — segment ${segments.length}: cost=$${ev.total_cost_usd} ` +
          `duration=${ev.duration_ms}ms turns=${ev.num_turns}`,
        elapsedMs
      );
      live(
        `   usage: in=${u.input_tokens} out=${u.output_tokens} ` +
          `cache_w=${u.cache_creation_input_tokens} ` +
          `cache_r=${u.cache_read_input_tokens}`,
        elapsedMs
      );
    }
  };

  const { rc, wallMs } = await runClaudeAudit({
    cwd: target,
    flags: claudeFlags,
    runLog,
    stdin: 'inherit',
    onEvent,
    heartbeat: {
      mode: 'silence',
      tick: (elapsedMs) =>
        live('… still running (no stream events for 60s)', elapsedMs),
    },
  });

  if (segments.length) {
    // Aggregate across segments; keep the LAST event's identity fields.
    result = aggregateSegments(segments, wallMs);
    if (segments.length > 1) {
      live(
        `⚠ session split into ${segments.length} result segments ` +
          `(background tasks / wakeups) — aggregated: ` +
          `turns=${result.num_turns} wall=${wallMs}ms cost=$${result.total_cost_usd}`,
        wallMs
      );
    }
  }
  log('─'.repeat(60));
  return [result, rc];
}

// ---------------------------------------------------------------------------
/**
 * Recovery for a non-compliant run: run the deterministic engine ourselves so
 * the archive still holds a correct audit.json (in the right scoring universe),
 * not just the model's hand-graded .md files. The run is salvaged but the meta
 * flags it as a product regression (the MODEL skipped the engine).
 */
function seedAuditCore(
  engine: string,
  target: string,
  outDir: string
): boolean {
  fs.mkdirSync(outDir, { recursive: true });
  const rp = spawnSync('node', [engine, 'audit-core', target, outDir], {
    encoding: 'utf8',
  });
  if (rp.status === 0) {
    log(`  ✓ harness ran audit-core → ${path.join(outDir, 'audit.json')}`);
    return true;
  }
  log(
    `  ✗ harness audit-core failed: ${(rp.stderr || '').trim().slice(0, 200)}`
  );
  return false;
}

// ---------------------------------------------------------------------------
interface HarnessArgs {
  target: string;
  worktree: string;
  phase: 'first' | 'second';
  seedFrom: string;
  seedDate: string;
  label: string;
  build: boolean;
  claudeFlags: string;
  allowUserMcp: boolean;
  model: string;
  retries: number;
  noEngineGuard: boolean;
  noDeploy: boolean;
  dryRun: boolean;
  quiet: boolean;
}

function parseCli(argv: string[]): HarnessArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        target: { type: 'string' },
        worktree: { type: 'string', default: DEFAULT_WORKTREE },
        phase: { type: 'string', default: 'first' },
        'seed-from': { type: 'string', default: 'auto' },
        'seed-date': { type: 'string', default: '' },
        label: { type: 'string', default: '' },
        build: { type: 'boolean', default: false },
        'claude-flags': {
          type: 'string',
          default: '--dangerously-skip-permissions',
        },
        'allow-user-mcp': { type: 'boolean', default: false },
        model: { type: 'string', default: 'sonnet' },
        retries: { type: 'string', default: '2' },
        'no-engine-guard': { type: 'boolean', default: false },
        'no-deploy': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        quiet: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });
  } catch (e: any) {
    die(String(e?.message ?? e));
  }
  const v = parsed.values as Record<string, any>;
  if (!v.target) die('--target is required (repo to audit, cwd of the run)');
  if (v.phase !== 'first' && v.phase !== 'second') {
    die(`--phase must be 'first' or 'second' (got '${v.phase}')`);
  }
  const retries = Number.parseInt(v.retries, 10);
  if (
    !Number.isFinite(retries) ||
    String(retries) !== String(v.retries).trim()
  ) {
    die(`--retries must be an integer (got '${v.retries}')`);
  }
  return {
    target: v.target,
    worktree: v.worktree,
    phase: v.phase,
    seedFrom: v['seed-from'],
    seedDate: v['seed-date'],
    label: v.label,
    build: v.build,
    claudeFlags: v['claude-flags'],
    allowUserMcp: v['allow-user-mcp'],
    model: v.model,
    retries,
    noEngineGuard: v['no-engine-guard'],
    noDeploy: v['no-deploy'],
    dryRun: v['dry-run'],
    quiet: v.quiet,
  };
}

// ---------------------------------------------------------------------------
/** The always-printed, clearly-delimited final summary (bypasses --quiet). */
function printFinalSummary(opts: {
  result: any;
  comp: Compliance;
  summary: any;
  partial: boolean;
  judgmentsPatched: boolean | null;
  reports: ReportHtml;
  rc: number;
  runDir: string;
  targetName: string;
  attemptCosts?: number[];
}): void {
  const {
    result,
    comp,
    summary,
    partial,
    judgmentsPatched,
    reports,
    rc,
    runDir,
    targetName,
    attemptCosts = [],
  } = opts;
  const t = tokenCostSummary(result);
  const out = (m = '') => console.log(m);
  out('\n' + '='.repeat(60));
  out('== run summary ==');
  out(` wall time : ${t.wall_ms != null ? formatWallTime(t.wall_ms) : 'n/a'}`);
  // Every retried attempt bills separately — the honest figure is the sum.
  const summedCost = attemptCosts.reduce((s, c) => s + c, 0);
  const costLine =
    attemptCosts.length > 1
      ? `$${summedCost.toFixed(4)} across ${attemptCosts.length} attempts ` +
        `(${attemptCosts.map((c) => '$' + c.toFixed(2)).join(' + ')})`
      : t.total_cost_usd != null
        ? '$' + t.total_cost_usd.toFixed(4)
        : 'n/a';
  out(` cost      : ${costLine}`);
  out(
    ` tokens    : in=${t.input_tokens} out=${t.output_tokens} ` +
      `cache_r=${t.cache_read_input_tokens} cache_w=${t.cache_creation_input_tokens}`
  );
  out(
    ` turns     : ${t.num_turns} (api time ${t.duration_ms} ms across ` +
      `${t.result_segments ?? 1} result segment(s))`
  );
  out(
    ` compliance: ${
      comp.model_complied
        ? '✓ model ran the engine'
        : '✗ MODEL SKIPPED THE ENGINE' +
          (comp.engine_seeded_by_harness
            ? ' (harness salvaged audit-core)'
            : '')
    } — audit_core_calls=${comp.audit_core_calls}` +
      (comp.carried_audit_core_calls
        ? ` (+${comp.carried_audit_core_calls} carried from earlier attempts)`
        : '') +
      ` fanout_spawns=${comp.fanout_agent_spawns}`
  );
  out(
    ` judgments : ${
      judgmentsPatched === null
        ? 'n/a (no audit.json archived)'
        : judgmentsPatched
          ? 'patched'
          : '✗ PENDING_JUDGMENT left (Step 6 incomplete)'
    }`
  );
  if (summary?.mode === 'single') {
    out(
      ` score     : audit_total=${summary.audit_total} coverage=${summary.coverage}`
    );
  } else if (summary?.mode === 'org') {
    out(
      ` org       : repos=${summary.repos} metrics=${JSON.stringify(summary.portfolio_metrics ?? null)}`
    );
  }
  if (reports.paths.length) {
    out(` report    : ${reports.paths[0]}`);
    for (const p of reports.paths.slice(1)) out(`             ${p}`);
  } else {
    out(' report    : MISSING — no report.html in the archived output');
  }
  for (const p of reports.missing) out(`   missing : ${p} (not rendered)`);
  if (partial) {
    out(
      ` status    : ✗ run INCOMPLETE (claude rc=${rc}, is_error=${result.is_error})`
    );
  } else {
    out(` status    : ✓ run complete (claude rc=${rc})`);
  }
  out(` archive   : ${runDir}`);
  out(`  compare  : npm run audit:compare -- --target ${targetName}`);
  out('='.repeat(60));
}

// ---------------------------------------------------------------------------
/** Everything performRun needs; all read-only provenance/config from main(). */
interface RunContext {
  args: HarnessArgs;
  target: string;
  worktree: string;
  engine: string;
  runDir: string;
  today: string;
  ts: string;
  claudeVer: string;
  seedFrom: string | null;
  deployedSha: string | null;
  awosSha: string;
  awosShort: string;
  awosBranch: string;
  awosDirty: boolean;
  tgtName: string;
  tgtShort: string;
  tgtBranch: string;
  tgtDirty: boolean;
}

/** The single immutable result of a run — consumed by the summary + exit logic. */
interface RunOutcome {
  result: any;
  comp: Compliance;
  summary: any;
  judgmentsPatched: boolean | null;
  reports: ReportHtml;
  rc: number;
  /** True when the session died mid-flight (non-zero rc or is_error). */
  partial: boolean;
  /** How many claude launches the retry loop was allowed. */
  attempts: number;
  /** Per-attempt costs (each attempt bills separately). */
  attemptCosts: number[];
}

/**
 * Prepare the target, run claude (with the engine-compliance retry loop and
 * audit-core salvage), archive the output, and write run-meta.json. Returns
 * one immutable outcome; the caller owns the marketplace-restore finally.
 */
async function performRun(ctx: RunContext): Promise<RunOutcome> {
  const {
    args,
    target,
    worktree,
    engine,
    runDir,
    today,
    ts,
    claudeVer,
    seedFrom,
    deployedSha,
    awosSha,
    awosShort,
    awosBranch,
    awosDirty,
    tgtName,
    tgtShort,
    tgtBranch,
    tgtDirty,
  } = ctx;

  fs.mkdirSync(runDir, { recursive: true });
  log('▶ preparing target context/audits/');
  const seededDate = prepareTarget(
    target,
    args.phase,
    runDir,
    seedFrom,
    args.seedDate,
    today
  );

  let claudeFlags = args.claudeFlags
    ? args.claudeFlags.split(/\s+/).filter(Boolean)
    : [];
  if (args.model) claudeFlags = [...claudeFlags, '--model', args.model];
  if (!args.allowUserMcp) {
    // Test isolation: without this, user-scope MCP servers (real Jira,
    // Slack, Gmail, ...) leak into the audited session even with
    // --setting-sources project — a test audit could pull live data.
    claudeFlags = [...claudeFlags, '--strict-mcp-config'];
  }
  // The target's OWN declared MCP servers are part of the audited project
  // (the audit assesses the project, not the auditor's environment) — pass
  // them back explicitly; --strict-mcp-config honors explicit --mcp-config.
  // Org mode: the org folder's configs plus every repo subdirectory's.
  const repoDirs = fs.existsSync(path.join(target, '.git'))
    ? []
    : gitRepoSubdirs(target);
  const projectMcp = discoverProjectMcp(target, repoDirs);
  if (Object.keys(projectMcp.servers).length > 0) {
    const mcpConfigPath = path.join(runDir, 'mcp-config.json');
    fs.writeFileSync(
      mcpConfigPath,
      JSON.stringify({ mcpServers: projectMcp.servers }, null, 2)
    );
    claudeFlags = [...claudeFlags, '--mcp-config', mcpConfigPath];
    log(
      `▶ project MCP servers: ${Object.keys(projectMcp.servers).join(', ')} ` +
        `(from ${projectMcp.files.length} config file(s))`
    );
  } else {
    log('▶ project MCP servers: none declared in target');
  }
  const audits = path.join(target, 'context/audits');

  // Engine-compliance guard + auto-retry. The headless model sometimes
  // reconstructs the removed per-dimension fan-out instead of calling
  // audit-core, producing .md grade files and no audit.json — a silent
  // regression that used to pass (rc=0, an output dir exists). Detect it,
  // relaunch up to --retries times, and finally salvage by running the
  // engine ourselves. `model_complied` records whether the MODEL used the
  // engine, independent of any salvage.
  const attempts = args.noEngineGuard ? 1 : Math.max(1, 1 + args.retries);
  let result: any = {};
  let comp: Compliance = {} as Compliance;
  let rc = 0;
  let outDir = '';
  let finalLog = '';
  // audit-core calls from earlier attempts whose stamped artifacts were
  // preserved on disk (rollup-only retries). The rollup-corrective prompt
  // forbids re-running audit-core, so the retry's own transcript legitimately
  // has zero engine calls — without this carry, a CORRECT rollup retry could
  // never pass the compliance gate and the harness discarded valid org
  // audits until retry exhaustion (barhopping 2026-07-06).
  let carriedCalls = 0;
  const attemptCosts: number[] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let retryPrompt = RETRY_CORRECTIVE_PROMPT;
    if (attempt > 1) {
      log(
        `\n▶ engine-skip retry ${attempt - 1}/${attempts - 1} — relaunching claude`
      );
      const plan = planRetry(
        locateOutDir(audits, today, seededDate),
        seededDate
      );
      if (plan.kind === 'rollup') {
        // Rollup-only failure: the org fan-out finished (stamped per-repo
        // audit.json files exist) but the org root artifact was never
        // written. Those audits are real engine output — keep them, carry
        // their engine calls into the retry's compliance ledger, and steer
        // the retry to the rollup instead of re-running the whole portfolio.
        retryPrompt = RETRY_ROLLUP_PROMPT;
        carriedCalls += comp.audit_core_calls ?? 0;
        log(
          `  ✓ keeping ${plan.repos.length} completed per-repo audit(s) — ` +
            `retry only needs rollup + render ` +
            `(carrying ${carriedCalls} engine call(s) toward compliance)`
        );
      } else {
        // Nothing preserved → nothing to carry. Calls whose artifacts were
        // cleared must not vouch for whatever the next attempt produces.
        carriedCalls = 0;
        if (plan.kind === 'clear') {
          fs.rmSync(plan.dir, { recursive: true, force: true });
          log(`  ✓ cleared non-compliant output ${plan.dir}`);
        }
      }
    }
    // Retries get a corrective system prompt: the barley regression showed
    // a bare relaunch re-confabulates the same engine skip (three attempts,
    // ~45 min), so a retry must actually change the model's premises.
    const attemptFlags =
      attempt === 1
        ? claudeFlags
        : [...claudeFlags, '--append-system-prompt', retryPrompt];
    finalLog = path.join(runDir, `run.attempt${attempt}.jsonl`);
    [result, rc] = await streamRun(target, attemptFlags, finalLog);
    attemptCosts.push(
      typeof result.total_cost_usd === 'number' ? result.total_cost_usd : 0
    );
    outDir = locateOutDir(audits, today, seededDate);
    comp = assessEngineCompliance(outDir, finalLog, carriedCalls);
    if (args.noEngineGuard) {
      log(
        `  engine guard disabled — compliance signals: ${JSON.stringify(comp)}`
      );
      break;
    }
    if (comp.engine_compliant) {
      if (attempt > 1) {
        log(
          comp.audit_core_calls > 0
            ? `  ✓ retry ${attempt - 1} complied (audit-core called, audit.json present)`
            : `  ✓ retry ${attempt - 1} complied (rollup finished; engine calls carried from earlier attempts)`
        );
      }
      break;
    }
    warn(
      `⚠ NON-COMPLIANT run — the model skipped the deterministic engine ` +
        `(audit_core_calls=${comp.audit_core_calls}, ` +
        `has_audit_json=${comp.has_audit_json}, ` +
        `dimension-auditor_spawns=${comp.fanout_agent_spawns}).`
    );
  }

  const modelComplied = Boolean(comp.engine_compliant);
  // Expose the final attempt's transcript under the canonical name for
  // compare scripts (per-attempt transcripts are kept as run.attemptN.jsonl).
  try {
    fs.copyFileSync(finalLog, path.join(runDir, 'run.jsonl'));
  } catch {
    // best-effort copy
  }

  // Salvage: if every attempt skipped the engine, run audit-core ourselves
  // so the archive still holds a correct audit.json (right scoring universe),
  // not just the model's hand-graded .md. The run stays flagged as a
  // product regression via model_complied=False.
  let engineSeeded = false;
  if (!args.noEngineGuard && !modelComplied) {
    warn(
      '⚠ all attempts skipped the engine — harness seeding audit-core to salvage the artifact'
    );
    if (!outDir) outDir = path.join(audits, today);
    engineSeeded = seedAuditCore(engine, target, outDir);
    comp = assessEngineCompliance(outDir, finalLog, carriedCalls);
  }
  comp.model_complied = modelComplied;
  comp.engine_seeded_by_harness = engineSeeded;

  // Fallback render: a transport failure (e.g. "API Error: Connection
  // closed mid-response") can kill claude after audit.json is complete but
  // before it renders the reports — leaving a non-zero rc and no
  // report.md/html. audit.json is the source of truth and `render` is a
  // pure function of it, so we can finish the job ourselves and turn a
  // failed run into a complete one. Also renders the salvage-seeded JSON.
  if (outDir && isDir(outDir)) {
    const srcJson = ['org-portfolio.json', 'audit.json']
      .map((n) => path.join(outDir, n))
      .find((p) => isFile(p));
    if (srcJson && !isFile(path.join(outDir, 'report.html'))) {
      log(
        `⚠ report.html missing but ${path.basename(srcJson)} present ` +
          `(claude rc=${rc}) — rendering reports from JSON`
      );
      // `render --format both --out-dir` writes report.md + report.html in
      // one process instead of a spawn per format.
      const rp = spawnSync(
        'node',
        [engine, 'render', srcJson, '--format', 'both', '--out-dir', outDir],
        { encoding: 'utf8' }
      );
      if (rp.status === 0) {
        log('  ✓ wrote report.md + report.html');
      } else {
        log(`  ✗ render failed: ${(rp.stderr || '').trim().slice(0, 200)}`);
      }
    }
  }

  const archived = path.join(runDir, 'audit-output');
  let summary: any = {};
  if (outDir && isDir(outDir)) {
    fs.cpSync(outDir, archived, { recursive: true });
    log(`▶ archived audit output -> ${runDir}/audit-output`);
    summary = summarizeOutput(archived);
  } else {
    log(`⚠ no audit output dir found under ${audits} (audit may have failed)`);
  }

  // Did the run finish? A non-zero rc or an is_error result event means
  // the session died mid-flight; the archive may be usable but the run
  // must not report success.
  const partial = Boolean(rc !== 0 || result.is_error);

  // Were the judgment categories actually patched? A leftover
  // "PENDING_JUDGMENT" in any archived audit.json means Step 6 never
  // completed the LLM slice — the score is missing the judgment weight.
  const judgmentsPatched = scanJudgmentsPatched(archived);
  if (judgmentsPatched === false) {
    warn(
      '⚠ PENDING_JUDGMENT left in archived audit.json — the judgment ' +
        'categories were never patched (Step 6 incomplete); scores are ' +
        'missing the judgment weight'
    );
  }

  const reports = isDir(archived)
    ? collectReportHtml(archived)
    : { paths: [], missing: [] };

  const meta = {
    timestamp_utc: ts,
    label: args.label,
    phase: args.phase,
    model: args.model || 'claude-default',
    seeded_previous_date: seededDate,
    seed_from: seedFrom,
    claude_version: claudeVer,
    claude_rc: rc,
    compliance: comp,
    skill_under_test: {
      repo: 'awos',
      worktree,
      commit: awosSha,
      short: awosShort,
      branch: awosBranch,
      dirty: awosDirty,
      served_via: 'marketplace-repoint',
      deployed_sha: deployedSha,
    },
    target: {
      name: tgtName,
      path: target,
      commit: tgtShort,
      branch: tgtBranch,
      dirty: tgtDirty,
    },
    usage: result.usage ?? null,
    modelUsage: result.modelUsage ?? null,
    // True spend of the run: retried attempts each bill separately, so the
    // total sums every attempt (a 3-attempt org run cost ~2× its final
    // attempt's figure). Per-attempt costs are kept alongside.
    total_cost_usd: attemptCosts.length
      ? attemptCosts.reduce((s, c) => s + c, 0)
      : (result.total_cost_usd ?? null),
    attempt_costs_usd: attemptCosts.length ? attemptCosts : null,
    final_attempt_cost_usd: result.total_cost_usd ?? null,
    duration_ms: result.duration_ms ?? null,
    num_turns: result.num_turns ?? null,
    wall_ms: result.wall_ms ?? null,
    result_segments: result.result_segments ?? null,
    is_error: result.is_error ?? null,
    partial,
    judgments_patched: judgmentsPatched,
    report_html: reports.paths,
    summary,
  };
  fs.writeFileSync(
    path.join(runDir, 'run-meta.json'),
    JSON.stringify(meta, null, 2)
  );

  return {
    result,
    comp,
    summary,
    judgmentsPatched,
    reports,
    rc,
    partial,
    attempts,
    attemptCosts,
  };
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2));
  QUIET = args.quiet;

  const target = path.resolve(args.target);
  const worktree = path.resolve(args.worktree);
  const tgtIsGit = Boolean(git(target, 'rev-parse', '--git-dir'));
  let childRepos: string[] = [];
  if (!tgtIsGit) {
    // Org mode: target is a non-git folder holding git-repo children; the
    // skill audits each and writes an org-portfolio.json into the parent.
    if (isDir(target)) {
      childRepos = fs
        .readdirSync(target)
        .sort()
        .filter((d) => isDir(path.join(target, d, '.git')));
    }
    if (!childRepos.length) {
      die(
        `--target is neither a git repo nor an org folder with ` +
          `git-repo children: ${target}`
      );
    }
  }
  if (!isDir(path.join(worktree, 'plugins/awos'))) {
    die(`--worktree has no plugins/awos: ${worktree}`);
  }

  // provenance
  const awosSha = git(worktree, 'rev-parse', 'HEAD');
  const awosShort = git(worktree, 'rev-parse', '--short', 'HEAD');
  const awosBranch = git(worktree, 'rev-parse', '--abbrev-ref', 'HEAD');
  const awosDirty = Boolean(git(worktree, 'status', '--porcelain'));
  const tgtName = path.basename(target);
  let tgtShort: string, tgtBranch: string, tgtDirty: boolean;
  if (tgtIsGit) {
    tgtShort = git(target, 'rev-parse', '--short', 'HEAD');
    tgtBranch = git(target, 'rev-parse', '--abbrev-ref', 'HEAD');
    tgtDirty = Boolean(git(target, 'status', '--porcelain'));
  } else {
    tgtShort = 'org';
    tgtBranch = `${childRepos.length}-repos`;
    tgtDirty = false;
  }
  const verProc = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  const claudeVer = (verProc.stdout || '').trim().split('\n')[0] || '?';
  const now = new Date();
  const ts = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const today = now.toISOString().slice(0, 10);

  const dirtyTag = awosDirty ? '-dirty' : '';
  const runDir = path.join(
    ARCHIVE_ROOT,
    tgtName,
    `${ts}__awos-${awosShort}${dirtyTag}__${args.phase}`
  );

  log('─'.repeat(60));
  log(` target : ${tgtName} @ ${tgtShort} (${tgtBranch}, dirty=${tgtDirty})`);
  log(` skill  : awos @ ${awosShort} (${awosBranch}, dirty=${awosDirty})`);
  log(` phase  : ${args.phase}`);
  log(` run    : ${runDir}`);
  log('─'.repeat(60));

  if (args.build) {
    log('▶ building engine (npm run build:engine)…');
    const bp = spawnSync('npm', ['run', 'build:engine'], {
      cwd: worktree,
      stdio: 'inherit',
    });
    if (bp.status !== 0) die('engine build failed');
  }
  const engine = path.join(
    worktree,
    'plugins/awos/skills/ai-readiness-audit/dist/cli.js'
  );
  if (!isFile(engine)) die('dist/cli.js missing — run with --build');

  // resolve seed if phase=second (read-only)
  let seedFrom: string | null = null;
  if (args.phase === 'second') {
    if (args.seedFrom === 'auto') {
      seedFrom = newestSeedFor(tgtName, runDir);
      if (!seedFrom) {
        die(
          `phase=second but no prior archived run for ${tgtName}; do a ` +
            `--phase first run before testing the delta case`
        );
      }
    } else {
      seedFrom = path.resolve(args.seedFrom);
    }
    log(`▶ seed source: ${seedFrom}`);
    resolveSeedOutput(seedFrom); // validate it has an audit.json (read-only)
  }

  if (args.dryRun) {
    log('▶ --dry-run: target + marketplace left untouched');
    log(`  would repoint ${MARKET_NAME} -> ${worktree} (+ restore after)`);
    log(
      `  would run     : claude -p /awos:ai-readiness-audit` +
        `${args.model ? ' --model ' + args.model : ''} (cwd=${target})`
    );
    log(`  would archive : ${runDir}`);
    return;
  }

  // One harness run at a time, machine-wide: runs repoint the SHARED
  // marketplace and same-target runs interleave writes in the live
  // context/audits/<date>/ (see acquireRunLock for the observed corruption).
  try {
    acquireRunLock(target);
  } catch (e: any) {
    die(String(e?.message ?? e));
  }

  let deployedSha: string | null = null;
  let origMarket: MarketPaths | null = null;
  if (args.noDeploy) {
    log('▶ --no-deploy: using whatever the marketplace currently serves');
  } else {
    log(`▶ repointing ${MARKET_NAME} -> worktree (+ refresh)`);
    [origMarket, deployedSha] = repointMarketplace(worktree);
    log(`  ✓ marketplace served from worktree (SKILL.md ${deployedSha})`);
  }

  // The run itself lives in performRun; the finally guarantees the
  // marketplace is restored even when performRun throws or dies mid-flight.
  let outcome: RunOutcome;
  try {
    outcome = await performRun({
      args,
      target,
      worktree,
      engine,
      runDir,
      today,
      ts,
      claudeVer,
      seedFrom,
      deployedSha,
      awosSha,
      awosShort,
      awosBranch,
      awosDirty,
      tgtName,
      tgtShort,
      tgtBranch,
      tgtDirty,
    });
  } finally {
    if (origMarket !== null) {
      log(`▶ restoring ${MARKET_NAME} to original (${origMarket.km_install})`);
      restoreMarketplace(origMarket);
    }
    releaseRunLock();
  }

  printFinalSummary({
    result: outcome.result,
    comp: outcome.comp,
    summary: outcome.summary,
    partial: outcome.partial,
    judgmentsPatched: outcome.judgmentsPatched,
    reports: outcome.reports,
    rc: outcome.rc,
    runDir,
    targetName: tgtName,
    attemptCosts: outcome.attemptCosts,
  });

  // Loud, non-zero exit when the MODEL skipped the engine, even if the harness
  // salvaged a correct audit.json. This is the QA hole the guard closes: such a
  // run must never quietly report success.
  if (!args.noEngineGuard && outcome.comp.model_complied === false) {
    const salvaged = outcome.comp.engine_seeded_by_harness;
    warn(
      `\n✗ ENGINE-SKIP REGRESSION: the model never ran audit-core across ` +
        `${outcome.attempts} attempt(s) — it reconstructed the per-dimension ` +
        `fan-out (dimension-auditor spawns=${outcome.comp.fanout_agent_spawns}). ` +
        `${salvaged ? 'Harness seeded audit-core so the artifact is correct, but ' : ''}` +
        `this is a product regression (CLAUDE.md 'Known gap'). Exiting non-zero.`
    );
    process.exit(3);
  }

  // A crashed / errored session must never exit 0, even when the archive was
  // salvaged (fallback render etc.) — the run is partial, not successful.
  if (outcome.partial) process.exit(1);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    if (err instanceof HarnessExit) {
      process.stderr.write(`error: ${err.message}\n`);
      process.exit(err.code);
    }
    console.error(err);
    process.exit(1);
  });
}
