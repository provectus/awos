/**
 * harness_lib.ts — shared helpers for the audit QA harness.
 *
 * Everything here is either pure or a thin filesystem reader, so the pieces
 * that decide a run's verdict (compliance counting, token/cost aggregation,
 * report-path collection, judgment scanning) are unit-testable without
 * launching claude. See harness.test.ts.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const HOME = os.homedir();
export const SETTINGS = path.join(HOME, '.claude/settings.json');
export const MARKET_NAME = 'awos-marketplace';
export const KM_PATH = path.join(
  HOME,
  '.claude/plugins/known_marketplaces.json'
);

export function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** git toplevel of the checkout a script lives in (the skill under test by default). */
export function scriptRepoRoot(scriptDir: string): string {
  const p = spawnSync(
    'git',
    ['-C', scriptDir, 'rev-parse', '--show-toplevel'],
    { encoding: 'utf8' }
  );
  const top = (p.stdout || '').trim();
  return top || path.resolve(scriptDir, '..', '..');
}

/**
 * The awos main checkout = the awos-marketplace directory source. Runs are
 * archived under its tmp/ so they all accumulate in one place no matter which
 * checkout (main or a worktree) invokes the harness. Falls back to the
 * script's repo root.
 */
export function awosMainCheckout(scriptDir: string): string {
  try {
    const s = readJson(SETTINGS);
    const p = s.extraKnownMarketplaces[MARKET_NAME].source.path;
    if (p && isDir(p)) return p;
  } catch {
    // fall through to the script's repo root
  }
  return scriptRepoRoot(scriptDir);
}

// ---------------------------------------------------------------------------
// Wall-time formatting
// ---------------------------------------------------------------------------

/** Format a millisecond duration as `NmSSs`, e.g. 424000 → "7m04s". */
export function formatWallTime(ms: number): string {
  const totalS = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

// ---------------------------------------------------------------------------
// Result-event aggregation (token/cost measurement)
// ---------------------------------------------------------------------------

function numField(ev: any, key: string): number {
  const v = ev?.[key];
  return typeof v === 'number' ? v : 0;
}

export function numUsage(ev: any, key: string): number {
  const v = (ev?.usage ?? {})[key];
  return typeof v === 'number' ? v : 0;
}

/**
 * Aggregate metrics across ALL stream-json `result` events of a session.
 *
 * A session that detours through background tasks / ScheduleWakeup emits one
 * `result` event PER resume segment. Reading only the last one massively
 * under-reports (a hops run read "78s / 9 turns" vs the true 18m47s / 94
 * turns), so: turns and durations are summed, cost/usage take the maximum
 * (cumulative within a session), and wall time is measured start→finish by
 * the caller. Identity fields come from the LAST event.
 */
export function aggregateSegments(segments: any[], wallMs: number): any {
  if (!segments.length) return {};
  const agg: any = { ...segments[segments.length - 1] };
  agg.num_turns = segments.reduce((a, ev) => a + numField(ev, 'num_turns'), 0);
  agg.duration_ms = segments.reduce(
    (a, ev) => a + numField(ev, 'duration_ms'),
    0
  );
  agg.total_cost_usd = Math.max(
    ...segments.map((ev) => numField(ev, 'total_cost_usd'))
  );
  agg.is_error = segments.some((ev) => ev.is_error);
  // usage/modelUsage counters are cumulative within a session — take the
  // segment with the largest input footprint.
  const biggest = segments.reduce((best, ev) =>
    numUsage(ev, 'input_tokens') + numUsage(ev, 'cache_read_input_tokens') >
    numUsage(best, 'input_tokens') + numUsage(best, 'cache_read_input_tokens')
      ? ev
      : best
  );
  agg.usage = biggest.usage;
  agg.modelUsage = biggest.modelUsage;
  agg.result_segments = segments.length;
  agg.wall_ms = wallMs;
  return agg;
}

export interface TokenCostSummary {
  total_cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
  duration_ms: number | null;
  wall_ms: number | null;
  num_turns: number | null;
  result_segments: number | null;
}

/** Extract the token/cost fields the final summary reports from a (possibly aggregated) result event. */
export function tokenCostSummary(result: any): TokenCostSummary {
  const u = result?.usage ?? {};
  const pick = (obj: any, key: string): number | null =>
    typeof obj?.[key] === 'number' ? obj[key] : null;
  return {
    total_cost_usd: pick(result, 'total_cost_usd'),
    input_tokens: pick(u, 'input_tokens'),
    output_tokens: pick(u, 'output_tokens'),
    cache_read_input_tokens: pick(u, 'cache_read_input_tokens'),
    cache_creation_input_tokens: pick(u, 'cache_creation_input_tokens'),
    duration_ms: pick(result, 'duration_ms'),
    wall_ms: pick(result, 'wall_ms'),
    num_turns: pick(result, 'num_turns'),
    result_segments: pick(result, 'result_segments'),
  };
}

// ---------------------------------------------------------------------------
// Engine-compliance signals
// ---------------------------------------------------------------------------

export interface ComplianceSignals {
  audit_core_calls: number;
  injected_audit_core: boolean;
  fanout_agent_spawns: number;
}

export interface Compliance extends ComplianceSignals {
  engine_compliant: boolean;
  has_audit_json: boolean;
  model_complied?: boolean;
  engine_seeded_by_harness?: boolean;
}

// The injection's echo marker with the date variable ALREADY SUBSTITUTED —
// the raw prompt source has the literal `$D`, so unexecuted prompt text
// cannot match.
const INJECT_MARKER =
  /\[audit-core\] one-pass deterministic engine → context\/audits\/\d{4}-\d{2}-\d{2}/;

/**
 * Count the execution signals in a parsed stream-json transcript.
 *
 * Counting is done on the parsed transcript, NOT on raw substrings: the skill
 * prompt text itself contains "audit-core" (and "dimension-auditor"), so a raw
 * substring count is satisfied by every run — including non-compliant ones.
 * Two execution signals count:
 *   - audit_core_calls — Bash tool_use blocks whose command contains
 *     `audit-core` (the model ran the engine itself, e.g. org mode).
 *   - injected_audit_core — the SKILL.md load-time !`…` injection ran
 *     audit-core before the model acted (produces NO Bash tool_use).
 */
export function complianceFromTranscript(lines: string[]): ComplianceSignals {
  let auditCoreCalls = 0;
  let fanoutSpawns = 0;
  let injected = false;
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    let ev: any;
    try {
      ev = JSON.parse(s);
    } catch {
      continue;
    }
    const t = ev.type;
    const content = ev.message?.content ?? [];
    if (t === 'user' && !injected) {
      const blob =
        typeof content === 'string' ? content : JSON.stringify(content);
      if (INJECT_MARKER.test(blob)) injected = true;
    }
    if (t !== 'assistant') continue;
    for (const b of Array.isArray(content) ? content : []) {
      if (!b || typeof b !== 'object' || b.type !== 'tool_use') continue;
      const name = b.name || '';
      const inp = b.input || {};
      if (name === 'Bash' && String(inp.command ?? '').includes('audit-core')) {
        auditCoreCalls += 1;
      } else if (name === 'Agent' || name === 'Task') {
        const blob = ['subagent_type', 'description', 'prompt']
          .map((k) => String(inp[k] ?? ''))
          .join(' ');
        if (blob.includes('dimension-auditor')) fanoutSpawns += 1;
      }
    }
  }
  return {
    audit_core_calls: auditCoreCalls,
    injected_audit_core: injected,
    fanout_agent_spawns: fanoutSpawns,
  };
}

/**
 * Did the run actually use the deterministic engine?
 *
 * A compliant run invokes `audit-core` and produces audit.json /
 * org-portfolio.json. The stochastic headless reversion — the model
 * reconstructs the removed per-dimension DAG/fan-out (spawning
 * dimension-auditor subagents) instead of calling the engine — produces
 * per-dimension .md grade files and NO audit.json. That run silently passes
 * (rc=0, output dir exists) while having produced the wrong artifact type in
 * a different, non-comparable scoring universe. Returns the signals so the
 * harness can fail loudly / retry.
 */
export function assessEngineCompliance(
  outDir: string,
  runLog: string
): Compliance {
  const hasJson =
    !!outDir &&
    (isFile(path.join(outDir, 'audit.json')) ||
      isFile(path.join(outDir, 'org-portfolio.json')));
  let signals: ComplianceSignals = {
    audit_core_calls: 0,
    injected_audit_core: false,
    fanout_agent_spawns: 0,
  };
  try {
    const lines = fs.readFileSync(runLog, 'utf8').split('\n');
    signals = complianceFromTranscript(lines);
  } catch {
    // no transcript → zero signals
  }
  const compliant =
    hasJson && (signals.audit_core_calls > 0 || signals.injected_audit_core);
  return {
    engine_compliant: compliant,
    has_audit_json: hasJson,
    ...signals,
  };
}

// ---------------------------------------------------------------------------
// Output-dir helpers
// ---------------------------------------------------------------------------

export function dateDirs(audits: string): string[] {
  if (!isDir(audits)) return [];
  const out: string[] = [];
  for (const n of fs.readdirSync(audits)) {
    const p = path.join(audits, n);
    if (isDir(p) && n.length === 10 && n[4] === '-' && n[7] === '-') {
      out.push(n);
    }
  }
  return out.sort();
}

/**
 * The date-named output dir the run produced: today's if present, else the
 * newest date dir that isn't the seeded previous one.
 */
export function locateOutDir(
  audits: string,
  today: string,
  seededDate: string | null
): string {
  const outDir = path.join(audits, today);
  if (isDir(outDir)) return outDir;
  const dd = dateDirs(audits).filter((d) => d !== seededDate);
  return dd.length ? path.join(audits, dd[dd.length - 1]) : '';
}

export function summarizeOutput(outDir: string): any {
  const org = path.join(outDir, 'org-portfolio.json');
  const single = path.join(outDir, 'audit.json');
  try {
    if (fs.existsSync(org)) {
      const d = readJson(org);
      const perRepo = path.join(outDir, 'per-repo');
      let repos = 0;
      if (isDir(perRepo)) {
        repos = fs
          .readdirSync(perRepo)
          .filter((n) => isFile(path.join(perRepo, n, 'audit.json'))).length;
      }
      return { mode: 'org', portfolio_metrics: d.portfolio_metrics, repos };
    }
    if (fs.existsSync(single)) {
      const d = readJson(single);
      const dimensions: Record<string, any> = {};
      for (const x of d.dimensions ?? []) {
        dimensions[x.dimension] = { score: x.score, coverage: x.coverage };
      }
      return {
        mode: 'single',
        audit_total: d.audit_total,
        coverage: d.coverage,
        dimensions,
      };
    }
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Report-path collection (final summary / run-meta)
// ---------------------------------------------------------------------------

export interface ReportHtml {
  /** Absolute paths of report.html files that exist in the archived output. */
  paths: string[];
  /** Absolute paths of report.html files that were expected but are missing. */
  missing: string[];
}

/**
 * Collect the archived report.html paths a finished run should have:
 * single mode → <archived>/report.html; org mode → the org report.html plus
 * each per-repo/<repo>/report.html.
 */
export function collectReportHtml(archivedOut: string): ReportHtml {
  const paths: string[] = [];
  const missing: string[] = [];
  const claim = (p: string) => (isFile(p) ? paths : missing).push(p);
  if (!isDir(archivedOut)) {
    return { paths, missing: [path.join(archivedOut, 'report.html')] };
  }
  claim(path.join(archivedOut, 'report.html'));
  const perRepo = path.join(archivedOut, 'per-repo');
  if (isDir(perRepo)) {
    for (const n of fs.readdirSync(perRepo).sort()) {
      if (isDir(path.join(perRepo, n))) {
        claim(path.join(perRepo, n, 'report.html'));
      }
    }
  }
  return { paths, missing };
}

// ---------------------------------------------------------------------------
// Judgment-patch scan
// ---------------------------------------------------------------------------

/**
 * Were the judgment categories actually patched? A leftover "PENDING_JUDGMENT"
 * in any archived audit.json means Step 6 never completed the LLM slice — the
 * score is missing the judgment weight. Returns null when no audit.json was
 * archived at all.
 */
export function scanJudgmentsPatched(archivedDir: string): boolean | null {
  const auditJsons: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'audit.json') auditJsons.push(p);
    }
  };
  walk(archivedDir);
  if (!auditJsons.length) return null;
  for (const p of auditJsons) {
    try {
      if (fs.readFileSync(p, 'utf8').includes('PENDING_JUDGMENT')) return false;
    } catch {
      // unreadable file — same as the Python port: ignore
    }
  }
  return true;
}
