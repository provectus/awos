/**
 * harness_lib.ts — shared helpers for the audit QA harness.
 *
 * Everything here is either pure or a thin filesystem reader, so the pieces
 * that decide a run's verdict (compliance counting, token/cost aggregation,
 * report-path collection, judgment scanning) are unit-testable without
 * launching claude. See harness.test.ts.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { AuditJson } from '../../../plugins/awos/skills/ai-readiness-audit/artifact_types.ts';

const HOME = os.homedir();
const SETTINGS = path.join(HOME, '.claude/settings.json');
export const MARKET_NAME = 'awos-marketplace';
const KM_PATH = path.join(HOME, '.claude/plugins/known_marketplaces.json');

export function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function sha256(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
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

function numUsage(ev: any, key: string): number {
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
// Stream-json transcript walking
// ---------------------------------------------------------------------------
// One tolerant parser shared by every transcript consumer (the compliance and
// smoke scanners here, and streamRun's live loop): trim, JSON.parse, and skip
// anything that doesn't parse. The skill prompt text and tool results are
// noise a raw grep would trip over, so consumers work on the PARSED events.

/** Parse one transcript line; null for a blank or non-JSON line (skip it). */
export function parseTranscriptLine(line: string): any | null {
  const s = line.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Yield every parseable stream-json event from a transcript's lines, in order. */
export function* parseTranscriptEvents(lines: string[]): Generator<any> {
  for (const line of lines) {
    const ev = parseTranscriptLine(line);
    if (ev !== null) yield ev;
  }
}

/**
 * Invoke `cb` for every content block of every `assistant` event in the
 * transcript, in order. Non-assistant events and non-array content are
 * skipped. The block's parent event is passed too for callers that need it.
 */
export function forEachAssistantBlock(
  lines: string[],
  cb: (block: any, event: any) => void
): void {
  for (const ev of parseTranscriptEvents(lines)) {
    if (ev.type !== 'assistant') continue;
    const content = ev.message?.content;
    for (const b of Array.isArray(content) ? content : []) cb(b, ev);
  }
}

// ---------------------------------------------------------------------------
// Engine-compliance signals
// ---------------------------------------------------------------------------

export interface ComplianceSignals {
  audit_core_calls: number;
  fanout_agent_spawns: number;
}

export interface Compliance extends ComplianceSignals {
  engine_compliant: boolean;
  has_audit_json: boolean;
  model_complied?: boolean;
  engine_seeded_by_harness?: boolean;
}

/**
 * Count the execution signals in a parsed stream-json transcript.
 *
 * Counting is done on the parsed transcript, NOT on raw substrings: the skill
 * prompt text itself contains "audit-core" (and "dimension-auditor"), so a raw
 * substring count is satisfied by every run — including non-compliant ones.
 * The one compliance signal is audit_core_calls — Bash tool_use blocks whose
 * command contains `audit-core` (the model ran the engine itself). Echoed
 * marker text in user/tool-result messages deliberately does NOT count: only
 * an actual engine invocation is compliance.
 */
export function complianceFromTranscript(lines: string[]): ComplianceSignals {
  let auditCoreCalls = 0;
  let fanoutSpawns = 0;
  forEachAssistantBlock(lines, (b) => {
    if (!b || typeof b !== 'object' || b.type !== 'tool_use') return;
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
  });
  return {
    audit_core_calls: auditCoreCalls,
    fanout_agent_spawns: fanoutSpawns,
  };
}

// ---------------------------------------------------------------------------
// Smoke-test signals — "did the model go wild?" markers beyond the basic
// engine-compliance count. Used by compliance_smoke.ts.
// ---------------------------------------------------------------------------

export interface SmokeSignals {
  /** Write/Edit tool_use targeting report.md / report.html — the renderer must produce those, never the model. */
  handwritten_report_writes: number;
  /** Write/Edit tool_use targeting context/audits/**\/*.json other than the two sanctioned authoring files (judgments.json, report-blocks.json) — hand-assembled scoring artifacts. */
  hand_json_writes: number;
  /** Bash `python -c` / `node -e` inline-compute calls — the hand-scoring improvisation marker. */
  hand_compute_calls: number;
  /** The final assistant text ends in a question — the run stalled waiting for a user that isn't there. */
  final_text_is_question: boolean;
}

const HAND_COMPUTE_RE = /\bpython3?\s+-c\b|\bnode\s+(-e|--eval)\b/;
const REPORT_FILE_RE = /report\.(md|html)$/;
const AUDIT_JSON_WRITE_RE = /context\/audits\/[^\s'"]*\.json/;
// The files SKILL.md sanctions the orchestrator to author: the two engine-verb
// inputs (judgments.json / report-blocks.json) and the connector artifacts
// under collected/ (mapping reachable MCP/CLI data is Step 6.1's job).
const SANCTIONED_AUTHORED_JSON =
  /(judgments|report-blocks)\.json$|\/collected\/[^/]+\.json$/;

/**
 * Scan a parsed stream-json transcript for go-wild signals. Complements
 * complianceFromTranscript (which only counts engine/fan-out signals).
 * Writes of `judgments.json` / `report-blocks.json` are legitimate (SKILL.md
 * Step 6.3/6.4 authoring files) and excluded from hand_json_writes.
 */
export function smokeSignalsFromTranscript(lines: string[]): SmokeSignals {
  let reportWrites = 0;
  let jsonWrites = 0;
  let handCompute = 0;
  let lastText = '';
  forEachAssistantBlock(lines, (b) => {
    if (!b || typeof b !== 'object') return;
    if (b.type === 'text' && String(b.text ?? '').trim()) {
      lastText = String(b.text).trim();
      return;
    }
    if (b.type !== 'tool_use') return;
    const name = b.name ?? '';
    const input = b.input ?? {};
    if (name === 'Write' || name === 'Edit') {
      const fp = String(input.file_path ?? '');
      if (REPORT_FILE_RE.test(fp)) reportWrites++;
      else if (
        AUDIT_JSON_WRITE_RE.test(fp) &&
        !SANCTIONED_AUTHORED_JSON.test(fp)
      ) {
        jsonWrites++;
      }
    } else if (name === 'Bash') {
      const cmd = String(input.command ?? '');
      if (HAND_COMPUTE_RE.test(cmd)) handCompute++;
      // Shell redirection into a scoring artifact counts as a hand write
      // too (heredocs into the sanctioned authoring files are fine).
      const redir = cmd.match(/>{1,2}\s*['"]?(\S*context\/audits\/\S*\.json)/);
      if (redir && !SANCTIONED_AUTHORED_JSON.test(redir[1])) jsonWrites++;
    }
  });
  return {
    handwritten_report_writes: reportWrites,
    hand_json_writes: jsonWrites,
    hand_compute_calls: handCompute,
    final_text_is_question: /\?\s*$/.test(lastText),
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
  transcript: string | string[]
): Compliance {
  const hasJson =
    !!outDir &&
    (isFile(path.join(outDir, 'audit.json')) ||
      isFile(path.join(outDir, 'org-portfolio.json')));
  // Accept either a runLog path (read it) or already-read lines — callers that
  // also run the smoke scan read the multi-MB transcript once and pass it in.
  let lines: string[] = [];
  if (Array.isArray(transcript)) {
    lines = transcript;
  } else {
    try {
      lines = fs.readFileSync(transcript, 'utf8').split('\n');
    } catch {
      // no transcript → zero signals
    }
  }
  const signals = complianceFromTranscript(lines);
  const compliant = hasJson && signals.audit_core_calls > 0;
  return {
    engine_compliant: compliant,
    has_audit_json: hasJson,
    ...signals,
  };
}

// ---------------------------------------------------------------------------
// Output-dir helpers
// ---------------------------------------------------------------------------

function dateDirs(audits: string): string[] {
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

/**
 * Per-repo audits already completed by an org attempt: every
 * per-repo/<repo>/audit.json carrying the engine provenance stamp. Used by
 * the retry loop to preserve finished engine output when only the rollup is
 * missing — re-running a completed 8-repo fan-out over one missed step is
 * the amplification this guards against.
 */
export function stampedPerRepoAudits(outDir: string): string[] {
  const perRepo = path.join(outDir, 'per-repo');
  if (!isDir(perRepo)) return [];
  return fs.readdirSync(perRepo).filter((n) => {
    const p = path.join(perRepo, n, 'audit.json');
    if (!isFile(p)) return false;
    try {
      const audit = readJson(p) as { engine?: { generated_by?: string } };
      return Boolean(audit.engine?.generated_by);
    } catch {
      return false;
    }
  });
}

export function summarizeOutput(outDir: string): any {
  const org = path.join(outDir, 'org-portfolio.json');
  const single = path.join(outDir, 'audit.json');
  try {
    if (fs.existsSync(org)) {
      const d = readJson(org) as AuditJson;
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
      const d = readJson(single) as AuditJson;
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

// ---------------------------------------------------------------------------
// Project-scope MCP config discovery
// ---------------------------------------------------------------------------
// The audit assesses the PROJECT, not the auditor's environment: harness runs
// stay `--strict-mcp-config` (user-scope servers never leak in), but the
// target's own declared MCP servers ARE part of the audited project — so they
// are discovered here, merged, and passed back explicitly via `--mcp-config`.

/** Config locations checked in each scanned directory, in precedence order. */
const MCP_CONFIG_CANDIDATES = [
  '.mcp.json',
  'mcp.json',
  '.vscode/mcp.json',
  '.cursor/mcp.json',
];

/**
 * Read one MCP config file and normalize to claude's `{mcpServers}` shape.
 * VS Code's `.vscode/mcp.json` uses a `servers` key; claude/Cursor use
 * `mcpServers`. Returns null when unreadable or neither key is present.
 */
function readMcpServers(configPath: string): Record<string, unknown> | null {
  let doc: any;
  try {
    doc = readJson(configPath);
  } catch {
    return null;
  }
  const servers = doc?.mcpServers ?? doc?.servers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    return null;
  }
  return servers as Record<string, unknown>;
}

export interface DiscoveredMcp {
  /** Config files that contributed servers (absolute paths). */
  files: string[];
  /** Merged, name-collision-safe server map (claude `mcpServers` shape). */
  servers: Record<string, unknown>;
}

/**
 * Discover project-declared MCP servers for a target: the target directory
 * itself plus (org mode) each repo subdirectory. Identical duplicate
 * definitions collapse; a name collision with a DIFFERENT definition gets the
 * later one suffixed with its directory name so no declared server is lost.
 */
export function discoverProjectMcp(
  target: string,
  repoDirs: string[] = []
): DiscoveredMcp {
  const files: string[] = [];
  const servers: Record<string, unknown> = {};
  for (const dir of [target, ...repoDirs]) {
    for (const rel of MCP_CONFIG_CANDIDATES) {
      const p = path.join(dir, rel);
      if (!isFile(p)) continue;
      const found = readMcpServers(p);
      if (!found || Object.keys(found).length === 0) continue;
      files.push(p);
      for (const [name, def] of Object.entries(found)) {
        if (!(name in servers)) {
          servers[name] = def;
        } else if (JSON.stringify(servers[name]) !== JSON.stringify(def)) {
          servers[`${name}__${path.basename(dir)}`] = def;
        }
      }
    }
  }
  return { files, servers };
}

/** Immediate subdirectories of `dir` that are git repos (org-mode repo set). */
export function gitRepoSubdirs(dir: string): string[] {
  if (!isDir(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((n) => path.join(dir, n))
    .filter((p) => isDir(p) && fs.existsSync(path.join(p, '.git')));
}

// ---------------------------------------------------------------------------
// Headless claude launcher
// ---------------------------------------------------------------------------
// Both the full harness (run_audit_test.ts) and the smoke check
// (compliance_smoke.ts) launch the SAME command — `claude -p
// /awos:ai-readiness-audit --output-format stream-json --verbose …` — tee the
// transcript to a log, poll a heartbeat, and resolve on close. This is that
// one launcher; the callers differ only in stdin disposition, extra flags, the
// per-event callback, and the heartbeat cadence.

/** The invariant argv prefix every audit run shares (flags are appended). */
export const CLAUDE_AUDIT_CMD = [
  'claude',
  '-p',
  '/awos:ai-readiness-audit',
  '--output-format',
  'stream-json',
  '--verbose',
];

export interface ClaudeAuditOpts {
  cwd: string;
  /** Flags appended after CLAUDE_AUDIT_CMD (model, mcp isolation, …). */
  flags: string[];
  /** Transcript sink: every stdout line + all stderr is teed here. */
  runLog: string;
  /** stdin for the child: 'inherit' (full harness) or 'ignore' (smoke). */
  stdin?: 'inherit' | 'ignore';
  /** Called once per parsed stdout stream-json event, in order. */
  onEvent?: (event: any, elapsedMs: number) => void;
  /**
   * Heartbeat while the run is quiet. 'silence' fires only after 60s with no
   * stream event (full harness); 'wall' fires every 60s regardless (smoke).
   */
  heartbeat?: { mode: 'silence' | 'wall'; tick: (elapsedMs: number) => void };
}

/**
 * Spawn a headless audit, tee its transcript to `runLog`, and resolve with the
 * exit code and wall-clock duration once the process closes. Parse-tolerant:
 * unparseable stdout lines are still logged but skipped for `onEvent`.
 */
export async function runClaudeAudit(
  opts: ClaudeAuditOpts
): Promise<{ rc: number; wallMs: number }> {
  const { cwd, flags, runLog, stdin = 'inherit', onEvent, heartbeat } = opts;
  const cmd = [...CLAUDE_AUDIT_CMD, ...flags];
  const wallStart = Date.now();
  let lastEvent = Date.now();
  const hb = heartbeat
    ? setInterval(
        () => {
          const now = Date.now();
          if (heartbeat.mode === 'silence') {
            if (now - lastEvent >= 60_000) {
              heartbeat.tick(now - wallStart);
              lastEvent = now;
            }
          } else {
            heartbeat.tick(now - wallStart);
          }
        },
        heartbeat.mode === 'wall' ? 60_000 : 1_000
      )
    : null;

  const lf = fs.createWriteStream(runLog);
  const proc = spawn(cmd[0], cmd.slice(1), {
    cwd,
    stdio: [stdin, 'pipe', 'pipe'],
  });
  proc.stderr!.on('data', (d) => lf.write(d));
  const closed = new Promise<number>((res) => {
    proc.on('error', () => res(-1));
    proc.on('close', (code, signal) => res(code ?? (signal ? 1 : 0)));
  });
  const rl = readline.createInterface({
    input: proc.stdout!,
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    lf.write(line + '\n');
    const ev = parseTranscriptLine(line);
    if (ev === null) continue;
    lastEvent = Date.now();
    onEvent?.(ev, lastEvent - wallStart);
  }
  const rc = await closed;
  if (hb) clearInterval(hb);
  await new Promise<void>((res) => lf.end(() => res()));
  return { rc, wallMs: Date.now() - wallStart };
}

/** True when `url` (an import.meta.url) is the process's entry module. */
export function isMainModule(url: string): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  const self = fileURLToPath(url);
  return entry === self || path.basename(entry) === path.basename(self);
}

// ---------------------------------------------------------------------------
// Marketplace repointing
// ---------------------------------------------------------------------------
// The awos-marketplace is a DIRECTORY source: `claude` serves the plugin live
// from its installLocation/source.path, NOT from the version caches under
// cache/awos-marketplace/awos/<version>/. So to test worktree code we repoint
// the marketplace at the worktree and refresh, then restore afterwards.
// Shared by run_audit_test.ts (full harness) and compliance_smoke.ts.

export interface MarketPaths {
  /** Verbatim snapshot of the known_marketplaces entry's `source` object. */
  km_source: unknown;
  km_install: string | null;
  /** Verbatim snapshot of the settings extraKnownMarketplaces entry's `source` object. */
  settings_source: unknown;
}

/** Current awos-marketplace source + installLocation, from both config files. */
function marketplacePaths(): MarketPaths {
  const km = readJson(KM_PATH);
  const s = readJson(SETTINGS);
  const m = km[MARKET_NAME] ?? {};
  return {
    km_source: m.source ?? null,
    km_install: m.installLocation ?? null,
    settings_source: s.extraKnownMarketplaces?.[MARKET_NAME]?.source ?? null,
  };
}

/**
 * Write the marketplace source objects VERBATIM (each config file gets its
 * own) and refresh via `claude plugin marketplace update`. The whole `source`
 * object is replaced, never just its `path`: the entry can be github-shaped
 * (`{source: "github", repo}`), and mutating only `path`/`installLocation`
 * on such an entry leaves a hybrid that claude rejects as a "corrupted
 * installLocation" (seen 2026-07-03). Returns the update process result so
 * callers can check its exit status.
 */
function setMarketplacePaths(
  kmSource: unknown,
  install: string | null,
  settingsSource: unknown
): { returncode: number; stdout: string; stderr: string } {
  const km = readJson(KM_PATH);
  const s = readJson(SETTINGS);
  if (!(MARKET_NAME in km)) {
    throw new Error(`marketplace '${MARKET_NAME}' not in ${KM_PATH}`);
  }
  km[MARKET_NAME].source = kmSource;
  km[MARKET_NAME].installLocation = install;
  if (!s.extraKnownMarketplaces) s.extraKnownMarketplaces = {};
  if (!s.extraKnownMarketplaces[MARKET_NAME]) {
    s.extraKnownMarketplaces[MARKET_NAME] = {};
  }
  s.extraKnownMarketplaces[MARKET_NAME].source = settingsSource;
  fs.writeFileSync(KM_PATH, JSON.stringify(km, null, 2));
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
  const up = spawnSync(
    'claude',
    ['plugin', 'marketplace', 'update', MARKET_NAME],
    { encoding: 'utf8' }
  );
  return {
    returncode: up.status ?? -1,
    stdout: up.stdout || '',
    stderr: up.error ? String(up.error) : up.stderr || '',
  };
}

/** A well-formed directory-source object pointing at `dir`. */
function directorySource(dir: string): Record<string, unknown> {
  return { source: 'directory', path: dir };
}

/**
 * Point awos-marketplace at the worktree and refresh so `claude` serves the
 * worktree's plugin. Returns the original paths for restore. Verifies the
 * worktree is a valid marketplace + has a built engine.
 */
export function repointMarketplace(worktree: string): [MarketPaths, string] {
  const skill = path.join(
    worktree,
    'plugins/awos/skills/ai-readiness-audit/SKILL.md'
  );
  if (!isFile(path.join(worktree, '.claude-plugin/marketplace.json'))) {
    throw new Error(
      `worktree is not a marketplace (no .claude-plugin/marketplace.json): ${worktree}`
    );
  }
  if (!isFile(skill)) throw new Error(`worktree has no SKILL.md at ${skill}`);
  const orig = marketplacePaths();
  const up = setMarketplacePaths(
    directorySource(worktree),
    worktree,
    directorySource(worktree)
  );
  if (up.returncode !== 0) {
    // Roll back the config edits before dying — a failed refresh must not
    // leave the marketplace files pointing at the worktree.
    setMarketplacePaths(orig.km_source, orig.km_install, orig.settings_source);
    throw new Error(
      `claude plugin marketplace update failed (rc=${up.returncode}): ` +
        (up.stderr || up.stdout).trim()
    );
  }
  return [orig, sha256(skill)];
}

export function restoreMarketplace(orig: MarketPaths): void {
  const up = setMarketplacePaths(
    orig.km_source,
    orig.km_install,
    orig.settings_source
  );
  if (up.returncode !== 0) {
    const w = (m: string) => process.stderr.write(m + '\n');
    w('\n' + '!'.repeat(70));
    w(
      `!! WARNING: \`claude plugin marketplace update\` FAILED during restore ` +
        `(rc=${up.returncode}): ${(up.stderr || up.stdout).trim().slice(0, 300)}`
    );
    w(`!! Your ${MARKET_NAME} marketplace may still point at the worktree.`);
    w(
      `!! Check ${KM_PATH} and ${SETTINGS}, then run: ` +
        `claude plugin marketplace update ${MARKET_NAME}`
    );
    w('!'.repeat(70));
  }
}
