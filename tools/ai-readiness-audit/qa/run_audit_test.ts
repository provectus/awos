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
 *   3. Snapshot target context/audits/ — pre-existing audits are left untouched (output
 *      dirs are datetime-stamped, context/audits/YYYY-MM-DD_HH-MM-SS, and the audit has
 *      no previous-audit/delta concept). The snapshot scopes output location and the
 *      post-run cleanup to dirs this run created.
 *   4. Run the audit headless via `claude -p … --output-format stream-json`, tee the full
 *      transcript to disk while streaming a concise live log to stderr (see --quiet).
 *   5. Measure tokens — parse the stream-json `result` events for total_cost_usd, usage
 *      (in/out/cache), duration, turns. The skill does NOT report tokens; this script does.
 *   6. Archive the whole context/audits/<stamp>/ output + run-meta.json under a
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
  evaluateGenerateCompliance,
  formatWallTime,
  gatherGenerateArtifacts,
  gitRepoSubdirs,
  isDir,
  isFile,
  isMainModule,
  locateOutDir,
  newestAuditDir,
  planRetry,
  releaseRunLock,
  repointMarketplace,
  restoreMarketplace,
  restoreTarget,
  runClaudeAudit,
  scanJudgmentsPatched,
  scriptRepoRoot,
  summarizeOutput,
  tokenCostSummary,
} from './harness_lib.ts';
import type {
  Compliance,
  GenerateCompliance,
  MarketPaths,
  ReportHtml,
} from './harness_lib.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Appended to the system prompt on engine-skip retries only. The previous
// attempt's leftover artifacts are what the model cites to justify skipping
// audit-core, so the retry must explicitly demolish that premise.
const RETRY_CORRECTIVE_PROMPT =
  'CORRECTIVE NOTE (the previous attempt was non-compliant and its output ' +
  'was discarded): nothing has scored anything yet. There is no pre-run; ' +
  'start a fresh timestamped context/audits/ output directory for this ' +
  'attempt. Your first scoring action MUST be running the deterministic ' +
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

// ---------------------------------------------------------------------------
/**
 * Snapshot of the target's context/audits/ entry names before the run.
 * Pre-existing audits are left untouched (datetime-stamped dirs never
 * collide and nothing reads previous audits); the snapshot lets locateOutDir
 * consider only dirs this run created and lets restoreTarget remove only
 * what the run added.
 */
function snapshotAudits(target: string): string[] {
  const audits = path.join(target, 'context/audits');
  return isDir(audits) ? fs.readdirSync(audits).sort() : [];
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
  runLog: string,
  promptOverride?: string
): Promise<[any, number]> {
  const cmdForLog = promptOverride
    ? [
        'claude',
        '-p',
        promptOverride,
        '--output-format',
        'stream-json',
        '--verbose',
      ]
    : CLAUDE_AUDIT_CMD;
  log(`▶ ${[...cmdForLog, ...claudeFlags].join(' ')}  (cwd=${target})`);
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
    prompt: promptOverride,
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
/** Outcome of the (optional) second `generate` session — always present in the meta/summary, even when skipped. */
interface GenerateRunResult {
  requested: boolean;
  compliance: GenerateCompliance | null;
  backlogHtmlPaths: string[];
  rc: number | null;
  partial: boolean;
  costUsd: number | null;
  /** Set when the generate phase was requested but not attempted (audit phase non-compliant/incomplete). */
  skippedReason: string | null;
}

const GENERATE_SKIPPED: GenerateRunResult = {
  requested: false,
  compliance: null,
  backlogHtmlPaths: [],
  rc: null,
  partial: false,
  costUsd: null,
  skippedReason: null,
};

/**
 * Second headless session: `/awos:ai-readiness-audit generate <request>`,
 * launched against the SAME target/deploy/lock context right after the audit
 * phase, while the audit it should act on is still live under the target's
 * context/audits/<stamp>/ (restoreTarget hasn't run yet — that happens in
 * main()'s finally, after both phases). `outDir`/`archived` are the audit
 * phase's live and archived output dirs; the generate phase re-copies
 * `outDir` into `archived` afterward so the archived copy gains `backlog/`
 * too, then evaluates compliance from the ARCHIVED copy (the artifact that
 * is actually kept and reported).
 */
async function runGeneratePhase(
  request: string,
  target: string,
  runDir: string,
  claudeFlags: string[],
  outDir: string,
  archived: string
): Promise<GenerateRunResult> {
  const prompt = `/awos:ai-readiness-audit generate ${request}`;
  log(`\n▶ generate phase: ${prompt}`);
  const runLog = path.join(runDir, 'run2.jsonl');
  const [result, rc] = await streamRun(target, claudeFlags, runLog, prompt);
  const partial = Boolean(rc !== 0 || result.is_error);

  if (outDir && isDir(outDir)) {
    fs.cpSync(outDir, archived, { recursive: true });
    log('▶ archived generate-phase output (backlog/) -> ' + archived);
  }

  const lines = fs.readFileSync(runLog, 'utf8').split('\n');
  const artifacts = gatherGenerateArtifacts(archived);
  const compliance = evaluateGenerateCompliance(lines, artifacts);
  if (!compliance.model_complied) {
    warn(
      `⚠ NON-COMPLIANT generate run — generate_backlog_calls=${compliance.generate_backlog_calls} ` +
        `backlog_stamped=${compliance.backlog_stamped} tickets_written=${compliance.tickets_written}`
    );
  } else {
    log('  ✓ generate phase compliant — backlog generated and stamped');
  }

  return {
    requested: true,
    compliance,
    backlogHtmlPaths: artifacts.backlogHtmlPaths,
    rc,
    partial,
    costUsd:
      typeof result.total_cost_usd === 'number' ? result.total_cost_usd : null,
    skippedReason: null,
  };
}

// ---------------------------------------------------------------------------
interface HarnessArgs {
  target: string;
  worktree: string;
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
  /** Generate-flow request text ("improvement backlog", "quick wins only", …). Unset skips the generate phase entirely. */
  generate?: string;
  /** Skip the audit phase entirely and run only the generate flow against the newest existing audit under the target. Requires `generate`. */
  generateOnly: boolean;
}

function parseCli(argv: string[]): HarnessArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        target: { type: 'string' },
        worktree: { type: 'string', default: DEFAULT_WORKTREE },
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
        generate: { type: 'string' },
        'generate-only': { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });
  } catch (e: any) {
    die(String(e?.message ?? e));
  }
  const v = parsed.values as Record<string, any>;
  if (!v.target) die('--target is required (repo to audit, cwd of the run)');
  const retries = Number.parseInt(v.retries, 10);
  if (
    !Number.isFinite(retries) ||
    String(retries) !== String(v.retries).trim()
  ) {
    die(`--retries must be an integer (got '${v.retries}')`);
  }
  if (v['generate-only'] && !v.generate) {
    die(
      '--generate-only requires --generate "<request>" — there is nothing ' +
        'to run without a generate request'
    );
  }
  return {
    target: v.target,
    worktree: v.worktree,
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
    generate: v.generate,
    generateOnly: v['generate-only'],
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
  generate: GenerateRunResult;
  /** True when the audit phase was skipped entirely (--generate-only). */
  auditPhaseSkipped: boolean;
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
    generate,
    auditPhaseSkipped,
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
  if (auditPhaseSkipped) {
    out(' audit     : skipped (--generate-only)');
  } else {
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
  }
  out(
    ` judgments : ${
      judgmentsPatched === null
        ? 'n/a (no audit.json archived)'
        : judgmentsPatched
          ? 'patched'
          : '✗ PENDING_JUDGMENT left (Step 5 incomplete)'
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
  if (generate.requested) {
    if (generate.skippedReason) {
      out(` generate  : skipped — ${generate.skippedReason}`);
    } else {
      const gc = generate.compliance;
      out(
        ` generate  : ${
          gc?.model_complied
            ? '✓ backlog generated'
            : '✗ GENERATE NON-COMPLIANT'
        } — generate_backlog_calls=${gc?.generate_backlog_calls} ` +
          `backlog_stamped=${gc?.backlog_stamped} tickets_written=${gc?.tickets_written}` +
          (generate.costUsd != null
            ? ` cost=$${generate.costUsd.toFixed(4)}`
            : '')
      );
      if (generate.backlogHtmlPaths.length) {
        out(` backlog   : ${generate.backlogHtmlPaths[0]}`);
        for (const p of generate.backlogHtmlPaths.slice(1))
          out(`             ${p}`);
      } else {
        out(' backlog   : MISSING — no backlog.html in the archived output');
      }
      if (generate.partial) {
        out(
          ` generate  : ✗ generate session INCOMPLETE (claude rc=${generate.rc})`
        );
      }
    }
  }
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
  deployedSha: string | null;
  awosSha: string;
  awosShort: string;
  awosBranch: string;
  awosDirty: boolean;
  tgtName: string;
  tgtShort: string;
  tgtBranch: string;
  tgtDirty: boolean;
  /** context/audits entry names present before the run (never touched). */
  preRunAudits: string[];
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
  /** The (optional) generate-flow phase's outcome — always present, `requested: false` when --generate wasn't passed. */
  generate: GenerateRunResult;
  /** True when the audit phase was skipped entirely (--generate-only) — comp/result carry no meaningful signal. */
  auditPhaseSkipped: boolean;
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
  if (ctx.preRunAudits.length) {
    log(
      `▶ target has ${ctx.preRunAudits.length} pre-existing audit dir(s) — left untouched (datetime dirs never collide)`
    );
  }

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
  let attempts = 0;
  // --generate-only: the audit phase never runs. There is no session to
  // relaunch, no compliance to assess, and no salvage to attempt — the
  // generate phase acts on an audit that already exists in the target.
  const auditPhaseSkipped = args.generateOnly;

  if (auditPhaseSkipped) {
    outDir = newestAuditDir(audits);
    if (!outDir) {
      die(
        `--generate-only needs an existing audit under ${audits}/ — none found`
      );
    }
    log(
      `▶ --generate-only: skipping the audit phase, using existing audit ${outDir}`
    );
  } else {
    attempts = args.noEngineGuard ? 1 : Math.max(1, 1 + args.retries);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let retryPrompt = RETRY_CORRECTIVE_PROMPT;
      if (attempt > 1) {
        log(
          `\n▶ engine-skip retry ${attempt - 1}/${attempts - 1} — relaunching claude`
        );
        const plan = planRetry(locateOutDir(audits, today, ctx.preRunAudits));
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
      outDir = locateOutDir(audits, today, ctx.preRunAudits);
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
  }

  const modelComplied = Boolean(comp.engine_compliant);
  if (!auditPhaseSkipped) {
    // Expose the final attempt's transcript under the canonical name for
    // compare scripts (per-attempt transcripts are kept as run.attemptN.jsonl).
    try {
      fs.copyFileSync(finalLog, path.join(runDir, 'run.jsonl'));
    } catch {
      // best-effort copy
    }
  }

  // Salvage: if every attempt skipped the engine, run audit-core ourselves
  // so the archive still holds a correct audit.json (right scoring universe),
  // not just the model's hand-graded .md. The run stays flagged as a
  // product regression via model_complied=False. None of this applies when
  // the audit phase itself was skipped (--generate-only) — there is no
  // engine-skip to salvage, and re-running audit-core over the pre-existing
  // audit dir would be an expensive, unrequested side effect.
  let engineSeeded = false;
  if (!auditPhaseSkipped) {
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
  }

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
  // "PENDING_JUDGMENT" in any archived audit.json means Step 5 never
  // completed the LLM slice — the score is missing the judgment weight.
  const judgmentsPatched = scanJudgmentsPatched(archived);
  if (judgmentsPatched === false) {
    warn(
      '⚠ PENDING_JUDGMENT left in archived audit.json — the judgment ' +
        'categories were never patched (Step 5 incomplete); scores are ' +
        'missing the judgment weight'
    );
  }

  const reports = isDir(archived)
    ? collectReportHtml(archived)
    : { paths: [], missing: [] };

  // Generate phase: only when requested AND the audit phase itself was both
  // engine-compliant (modelComplied — the true signal, not a harness salvage)
  // and finished without crashing. Spending a second billed session against
  // a non-compliant or partial audit would just fail compliance again for a
  // reason the generate gate didn't cause. --generate-only bypasses this
  // gate entirely — there is no audit-phase signal to gate on, only a
  // pre-existing audit the caller has already vouched for by pointing us at it.
  let generate: GenerateRunResult = GENERATE_SKIPPED;
  if (args.generate) {
    if (auditPhaseSkipped || (modelComplied && !partial)) {
      generate = await runGeneratePhase(
        args.generate,
        target,
        runDir,
        claudeFlags,
        outDir,
        archived
      );
    } else {
      generate = {
        ...GENERATE_SKIPPED,
        requested: true,
        skippedReason: !modelComplied
          ? 'audit phase was non-compliant (model skipped the engine)'
          : 'audit session ended partial/incomplete',
      };
      warn(`⚠ skipping generate phase — ${generate.skippedReason}`);
    }
  }

  const meta = {
    timestamp_utc: ts,
    label: args.label,
    model: args.model || 'claude-default',
    claude_version: claudeVer,
    claude_rc: rc,
    // Normal runs record the usual engine-compliance object; --generate-only
    // never ran an audit phase, so recording `comp` as-is would fabricate an
    // engine_compliant verdict for a session that never happened — record an
    // explicit skip marker instead.
    audit_phase: auditPhaseSkipped ? 'skipped (--generate-only)' : 'ran',
    compliance: auditPhaseSkipped ? { skipped: true } : comp,
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
    generate_requested: generate.requested,
    generate_compliance: generate.compliance,
    generate_rc: generate.rc,
    generate_partial: generate.partial,
    generate_cost_usd: generate.costUsd,
    generate_backlog_html: generate.backlogHtmlPaths,
    generate_skipped_reason: generate.skippedReason,
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
    generate,
    auditPhaseSkipped,
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
    `${ts}__awos-${awosShort}${dirtyTag}`
  );

  log('─'.repeat(60));
  log(` target : ${tgtName} @ ${tgtShort} (${tgtBranch}, dirty=${tgtDirty})`);
  log(` skill  : awos @ ${awosShort} (${awosBranch}, dirty=${awosDirty})`);
  log(` run    : ${runDir}`);
  log('─'.repeat(60));

  if (args.build) {
    log('▶ building engine (npm run build:audit-engine)…');
    const bp = spawnSync('npm', ['run', 'build:audit-engine'], {
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

  if (args.dryRun) {
    log('▶ --dry-run: target + marketplace left untouched');
    log(`  would repoint ${MARKET_NAME} -> ${worktree} (+ restore after)`);
    if (args.generateOnly) {
      const audits = path.join(target, 'context/audits');
      const found = newestAuditDir(audits);
      log('  would skip audit phase entirely (--generate-only)');
      log(
        found
          ? `  would use existing audit: ${found}`
          : `  ⚠ no existing audit found under ${audits}/ — a real run would exit non-zero here`
      );
    } else {
      log(
        `  would run     : claude -p /awos:ai-readiness-audit` +
          `${args.model ? ' --model ' + args.model : ''} (cwd=${target})`
      );
    }
    if (args.generate) {
      log(
        `  would run     : claude -p "/awos:ai-readiness-audit generate ${args.generate}" (2nd session, same cwd)`
      );
    }
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
  const preRunAudits = snapshotAudits(target);
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
      deployedSha,
      awosSha,
      awosShort,
      awosBranch,
      awosDirty,
      tgtName,
      tgtShort,
      tgtBranch,
      tgtDirty,
      preRunAudits,
    });
  } finally {
    if (origMarket !== null) {
      log(`▶ restoring ${MARKET_NAME} to original (${origMarket.km_install})`);
      restoreMarketplace(origMarket);
    }
    // Remove only what the run added to the target (archive is canonical);
    // pre-existing audits are never touched. Never mask the original error
    // with a cleanup failure.
    try {
      log('▶ cleaning generated audit output from target');
      for (const line of restoreTarget(target, runDir, preRunAudits))
        log(`  ${line}`);
    } catch (e) {
      warn(`⚠ target cleanup failed: ${String(e)}`);
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
    generate: outcome.generate,
    auditPhaseSkipped: outcome.auditPhaseSkipped,
  });

  // Loud, non-zero exit when the MODEL skipped the engine, even if the harness
  // salvaged a correct audit.json. This is the QA hole the guard closes: such a
  // run must never quietly report success. Never applies to --generate-only —
  // there is no audit-phase session whose engine use could be assessed.
  if (
    !outcome.auditPhaseSkipped &&
    !args.noEngineGuard &&
    outcome.comp.model_complied === false
  ) {
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

  // Generate-flow gate: a requested generate phase that skipped the engine,
  // left an unstamped/missing backlog.json, or wrote no tickets/html must
  // never quietly report success either. No retry/salvage here (v1) — a
  // plain FAIL with run2.jsonl archived is enough to iterate on.
  if (outcome.generate.requested && !outcome.generate.skippedReason) {
    const gc = outcome.generate.compliance;
    if (outcome.generate.partial || !gc?.model_complied) {
      warn(
        `\n✗ GENERATE-PHASE NON-COMPLIANT: generate_backlog_calls=${gc?.generate_backlog_calls} ` +
          `backlog_stamped=${gc?.backlog_stamped} tickets_written=${gc?.tickets_written} ` +
          `partial=${outcome.generate.partial}. See run2.jsonl in ${runDir}. Exiting non-zero.`
      );
      process.exit(4);
    }
  }
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
