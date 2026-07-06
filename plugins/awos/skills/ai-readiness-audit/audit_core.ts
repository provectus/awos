// ---------------------------------------------------------------------------
// audit-core — deterministic, repo-path-only audit pass.
//
// Runs every `detected`/`computed` category across all dimensions in ONE
// process and writes the per-dimension JSON artifacts + the aggregated
// audit.json — the same shapes the orchestrator used to assemble from 11
// subagents. The LLM is left only the irreducible slice: the 5 `judgment`
// categories (emitted here as status PENDING_JUDGMENT) and the tracker/docs
// connector metrics (which SKIP when no connector artifact is present).
//
// Routing (no hardcoded dimension list — derived from the registries):
//   judgment            → PENDING_JUDGMENT (LLM fills later)
//   DETECTORS[code]     → run the detector (repo path only)
//   METRICS[metric]     → run the metric once; it reports categories_awarded
//
// Topology flags are computed deterministically (topology.ts) and gate each
// category's `applies_when` — a category whose flag is false is SKIP (excluded
// from the coverage denominator), never run. check_id comes from each
// category's required `check_id` in standards.toml (the single source of
// check ids). The only LLM-dependent inputs left out here are connectors
// (tracker/docs default to absent → those metrics SKIP) and the 5 judgments.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

import {
  evaluateAppliesWhen,
  loadStandards,
  metaNumber,
} from './metrics/_base.ts';
import { median, round1 } from './metrics/_score.ts';
import type {
  CheckStatus,
  DerivedDelivery,
  WrittenCheck,
} from './artifact_types.ts';
import { COLLECTOR_SOURCES, SOURCE_LABEL_DEFAULTS } from './artifact_types.ts';
import {
  computeTopology,
  detectLinkedRepos,
  detectFrameworks,
  type TopologyFlags,
} from './topology.ts';
import { detectLanguages, LANGUAGES } from './languages.ts';
import { detectAgentTools } from './agent_tools.ts';
import { detectCiConfigPath, ciPlatformName } from './ci_platforms.ts';
import type { DetectorResult } from './detectors/_base.ts';
import { iterFiles, DEFAULT_IGNORE } from './detectors/_base.ts';
import type { MetricResult } from './metrics/_base.ts';
import type { Period } from './collectors/_base.ts';
import { writeArtifact } from './collectors/_base.ts';
import {
  collect as collectGit,
  ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT,
  REWORK_HORIZON_DAYS_DEFAULT,
} from './collectors/git.ts';
import { collect as collectCi } from './collectors/ci.ts';
import { collect as collectTracker } from './collectors/tracker.ts';
import { collect as collectDocs } from './collectors/docs.ts';

// ---------------------------------------------------------------------------
// Engine provenance — the circuit-breaker against hand-assembled audits.
// audit-core stamps every artifact it writes; patch-judgment, render, and
// rollup refuse an audit.json without the stamp, so the only path to a report
// is actually running the engine.
// ---------------------------------------------------------------------------
export const ENGINE_PROVENANCE = { generated_by: 'audit-core' } as const;

/**
 * Compute the connector-gated headline rows (Cycle time, MTTR) from the
 * tracker artifact — deterministically, in the engine. A model-authored row
 * once said "needs ticketing connector" while "Connected: Jira via Atlassian
 * MCP" sat two sections up (barley 2026-07-02, 994 tickets fetched, zero
 * changelogs); deriving both the value and the honest gated note from the
 * SAME artifact makes that contradiction impossible.
 */
export function computeDerivedDelivery(
  collectedDir: string,
  // Pre-read tracker artifact — pass it when the caller already parsed
  // collected/tracker.json so the (potentially MB-sized) file isn't re-read.
  preReadTracker?: Record<string, unknown> | null
): DerivedDelivery {
  let tracker: Record<string, unknown> | null;
  if (preReadTracker !== undefined) {
    tracker = preReadTracker;
  } else {
    try {
      tracker = JSON.parse(
        readFileSync(join(collectedDir, 'tracker.json'), 'utf8')
      );
    } catch {
      tracker = null;
    }
  }
  const out: DerivedDelivery = { cycle_time: {}, mttr: {} };
  if (!tracker?.available) return out;

  const raw = (tracker.raw ?? {}) as Record<string, unknown>;
  const period = (tracker.period ?? {}) as Record<string, unknown>;
  const label =
    (period.source_label as string | undefined) ??
    SOURCE_LABEL_DEFAULTS['tracker'] ??
    'tracker';
  const tickets = Array.isArray(raw.tickets)
    ? (raw.tickets as Array<Record<string, unknown>>)
    : [];
  const resolved = tickets.filter((t) => t.resolved_at);
  const spans = resolved
    .map((t) => {
      if (!t.in_progress_at) return null;
      const start = Date.parse(String(t.in_progress_at));
      const end = Date.parse(String(t.resolved_at));
      if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
      return (end - start) / 86_400_000;
    })
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);

  if (spans.length > 0) {
    out.cycle_time.median_days = round1(median(spans)!);
    out.cycle_time.tickets_used = spans.length;
    out.cycle_time.display_value = `${out.cycle_time.median_days} d`;
    const fm = raw.fetch_meta as Record<string, unknown> | undefined;
    if (fm && fm.complete === false) {
      out.cycle_time.note = `partial fetch: ${fm.tickets_fetched ?? '?'} of ${fm.tickets_total ?? '?'} tickets`;
    }
  } else if (resolved.length > 0) {
    out.cycle_time.note = `${label} connected — per-ticket status history not fetched`;
  } else {
    out.cycle_time.note = `${label} connected — no tickets resolved in window`;
  }

  const incident = raw.incident_source;
  if (typeof incident === 'string' && incident) {
    out.mttr.note = `incident source "${incident}" declared — no incident data mapped`;
  }
  return out;
}

/** True when `obj` carries the audit-core provenance stamp. */
export function hasEngineProvenance(obj: unknown): boolean {
  return (
    !!obj &&
    typeof obj === 'object' &&
    (obj as { engine?: { generated_by?: unknown } }).engine?.generated_by ===
      ENGINE_PROVENANCE.generated_by
  );
}

// ---------------------------------------------------------------------------
// Detection conflicts — files claimed by more than one language's sourceGlobs.
// Uses an extension-based approach on the language registry (O(languages²))
// and a limited file scan to stay fast even on large repos.
// ---------------------------------------------------------------------------
function computeDetectionConflicts(
  repoPath: string
): Array<{ file: string; claimedBy: string[] }> {
  // Build extension → language displayName[] map from the language registry.
  const extLangs = new Map<string, string[]>();
  for (const lang of LANGUAGES) {
    for (const glob of lang.sourceGlobs) {
      // Only handle simple *.ext globs (the common case).
      if (!glob.startsWith('*.')) continue;
      const ext = glob.slice(1); // e.g. ".ts"
      const existing = extLangs.get(ext) ?? [];
      if (!existing.includes(lang.displayName)) {
        existing.push(lang.displayName);
        extLangs.set(ext, existing);
      }
    }
  }

  // Collect conflict extensions (registry-level).
  const conflictExts = new Set<string>();
  for (const [ext, langs] of extLangs) {
    if (langs.length > 1) conflictExts.add(ext);
  }
  if (conflictExts.size === 0) return [];

  // Find actual conflicted files in the repo (limited sample).
  const conflicts: Array<{ file: string; claimedBy: string[] }> = [];
  try {
    const conflictGlobs = [...conflictExts].map((ext) => `*${ext}`);
    const files = iterFiles(repoPath, conflictGlobs, DEFAULT_IGNORE).slice(
      0,
      200
    );
    for (const file of files) {
      const dot = file.lastIndexOf('.');
      if (dot === -1) continue;
      const ext = file.slice(dot);
      const langs = extLangs.get(ext);
      if (langs && langs.length > 1) {
        conflicts.push({
          file: file.replace(repoPath + '/', ''),
          claimedBy: langs,
        });
      }
    }
  } catch {
    /* scan errors are non-fatal */
  }
  return conflicts;
}

// Last-resort lookback window (days) used only when meta.max_lookback_days is
// absent from standards.toml. The source of truth is meta.max_lookback_days.
const MAX_LOOKBACK_DAYS_FALLBACK = 90;

// Fallbacks for the report row-highlight thresholds when standards.toml
// [meta] omits them. The source of truth is meta.highlight_yellow_below /
// meta.highlight_red_below (share of weight_awarded / weight_max).
const HIGHLIGHT_YELLOW_BELOW_DEFAULT = 0.95;
const HIGHLIGHT_RED_BELOW_DEFAULT = 0.05;

/** Build the collection Period from standards.toml [meta] (the source of truth). */
export function periodFromStandards(
  standards: Record<string, unknown>
): Period {
  return {
    bucket_days: 30,
    lookback_days: metaNumber(
      standards,
      'max_lookback_days',
      MAX_LOOKBACK_DAYS_FALLBACK
    ),
    history_available_days: 0,
  };
}

/** Git collector tunables from standards.toml [meta] (the source of truth). */
export function gitOptsFromStandards(standards: Record<string, unknown>): {
  activeContributorThreshold: number;
  reworkHorizonDays: number;
} {
  return {
    activeContributorThreshold: metaNumber(
      standards,
      'active_contributor_threshold',
      ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT
    ),
    reworkHorizonDays: metaNumber(
      standards,
      'rework_horizon_days',
      REWORK_HORIZON_DAYS_DEFAULT
    ),
  };
}

/**
 * Absence reason for a collector artifact that failed to read. ENOENT means
 * the source was never collected ("not found" → the report suggests connecting
 * it); anything else means the artifact IS there but unreadable/corrupted —
 * a different problem, which must not be reported as a missing connector.
 */
function collectorArtifactAbsenceReason(err: unknown): string {
  return (err as { code?: string }).code === 'ENOENT'
    ? 'collector artifact not found'
    : `collector artifact unreadable: ${String(err)}`;
}

/** One parse per collector artifact: the artifact, or the read error. */
export type CollectedMap = Map<
  string,
  { art: Record<string, unknown> | null; err: unknown }
>;

/** Parse every collected/<src>.json once. Both auditCore and aggregate derive
 * their `sources`/`source_windows`/topology blocks from this single map. */
export function readCollectedArtifacts(collectedDir: string): CollectedMap {
  const map: CollectedMap = new Map();
  for (const src of COLLECTOR_SOURCES) {
    try {
      const art = JSON.parse(
        readFileSync(join(collectedDir, `${src}.json`), 'utf8')
      ) as Record<string, unknown>;
      map.set(src, { art, err: null });
    } catch (err) {
      map.set(src, { art: null, err });
    }
  }
  return map;
}

/**
 * Build the audit.json `sources` block. A genuinely absent artifact (ENOENT)
 * means the source was never collected; any other error means the artifact
 * exists but is unreadable/corrupted — say so, so the report never tells a
 * user to "connect" a source they did connect. With `dropEnoent` (the
 * aggregate path) never-collected sources are omitted entirely so a previously
 * stored block can win the fallback.
 */
export function deriveSources(
  collected: CollectedMap,
  dropEnoent: boolean
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const src of COLLECTOR_SOURCES) {
    const { art, err } = collected.get(src)!;
    if (art) {
      const period = art.period as Record<string, unknown> | undefined;
      const row: Record<string, unknown> = {
        source: src,
        available: Boolean(art.available),
        reason_if_absent: art.reason_if_absent ?? null,
        history_available_days: period?.history_available_days ?? null,
      };
      // Provenance note: which trunk ref the git walks used. Omitted for the
      // plain local fallback (nothing remote to disclose) and added only when
      // present so rows keep their existing shape everywhere else.
      const trunk = (art.raw as Record<string, unknown> | undefined)?.trunk as
        | { source?: string; summary?: string }
        | undefined;
      if (src === 'git' && trunk?.summary && trunk.source !== 'local') {
        row.note = trunk.summary;
      }
      out.push(row);
    } else if (!dropEnoent || (err as { code?: string })?.code !== 'ENOENT') {
      out.push({
        source: src,
        available: false,
        reason_if_absent: collectorArtifactAbsenceReason(err),
        history_available_days: null,
      });
    }
  }
  return out;
}

/**
 * Build the audit.json `source_windows` block for per-dimension provenance.
 * days = period.lookback_days ?? period.history_available_days ?? null;
 * label = period.source_label (orchestrator-recorded) if present, else default.
 */
export function deriveSourceWindows(
  collected: CollectedMap
): Record<string, { days: number | null; label: string }> {
  const windows: Record<string, { days: number | null; label: string }> = {};
  for (const src of COLLECTOR_SOURCES) {
    const { art } = collected.get(src)!;
    if (!art) continue;
    const p = (art.period ?? {}) as Record<string, unknown>;
    windows[src] = {
      days:
        (p.lookback_days as number | undefined) ??
        (p.history_available_days as number | undefined) ??
        null,
      label:
        (p.source_label as string | undefined) ??
        SOURCE_LABEL_DEFAULTS[src] ??
        src,
    };
  }
  return windows;
}

type DetectorFn = (repoPath: string, params?: unknown) => DetectorResult;

/** Per-category display metadata captured from a metric result. */
interface MetricMeta {
  unit?: string;
  expression?: string;
  value?: unknown;
  evidence?: string[];
  score?: number;
  confidence?: number;
  /** Reliability note from the metric — surfaces WHY a metric skipped. */
  note?: string | null;
  /** Per-run reliability tag from the metric — a better source can upgrade
   * the standards default (e.g. code-host PR data beats the git proxy). */
  reliability_tag?: string | null;
  /** Sources the metric actually read this run — supersedes the standards
   * declaration in the check record so the report's Sources column reflects
   * what was measured, not what was expected. */
  sources_used?: string[];
}

/** The MetricMeta a metric result yields for one of its category codes. */
function metaForCode(res: MetricResult, code: number): MetricMeta {
  const perCodeScore = (
    res.score_per_code as Record<number, number> | undefined
  )?.[code];
  const perCodeEvidence = (
    res.evidence_per_code as Record<number, string[]> | undefined
  )?.[code];
  return {
    unit: res.unit,
    expression: res.expression,
    value: res.value,
    evidence: perCodeEvidence ?? (res.expression ? [res.expression] : []),
    score: perCodeScore ?? res.score,
    confidence: res.confidence,
    note: res.reliability?.note ?? null,
    reliability_tag: res.reliability?.tag ?? null,
    sources_used: Array.isArray(res.sources_used)
      ? (res.sources_used as string[])
      : undefined,
  };
}

/**
 * A metric compute function — may return synchronously or as a Promise
 * (cyclomatic_complexity is async — requires wasm init). Shared with cli.ts,
 * which builds the METRICS registry auditCore consumes.
 */
export type MetricFn = (
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>,
  repoPath?: string
) => MetricResult | Promise<MetricResult>;

interface Category {
  code: number;
  check_id?: string;
  metric?: string;
  dimension: string;
  weight: number;
  method: string;
  definition?: string;
  /** Optional one-line lead shown inline; the full `definition` stays in the tooltip. */
  summary?: string;
  applies_when?: string;
  reliability_default?: string;
  source?: string;
  sources?: string[];
  url?: string;
  date?: string;
  last_verified?: string;
  threshold?: number;
  threshold_days?: number;
  /** Verdict-step thresholds (0..1 shares) — see references/standards.md.
   * pass_at/warn_at grade higher-is-better shares; fail_at/warn_at grade
   * lower-is-better (bad-share) checks. Detectors read them via params. */
  pass_at?: number;
  warn_at?: number;
  fail_at?: number;
}

// The check record audit-core writes — the writer-truth shape from
// artifact_types.ts (every enrichment field required, since this file is the
// one that writes them).
type CheckRecord = WrittenCheck;

export interface AuditCoreSummary {
  audit_total: number;
  categories: number;
  detected: number;
  computed: number;
  judgment_pending: number;
  /**
   * The checks awaiting the orchestrator's judgment verdict, listed so the
   * orchestrator never has to inspect the artifacts to find them — the
   * summary line is the complete work list for the judgment step.
   */
  pending_judgment_checks: Array<{
    check_id: string;
    dimension: string;
    code: number[];
  }>;
  skipped: number;
  duration_ms: number;
}

export async function auditCore(
  repoPath: string,
  outDir: string,
  detectors: Record<number, DetectorFn>,
  metrics: Record<string, MetricFn>,
  standardsPath: string,
  // When set, skip the deterministic collectors and score against this already
  // populated collected/ directory instead. This is the `enrich` path: after the
  // orchestrator writes connector artifacts (tracker/docs/ci) into collected/,
  // re-scoring reuses them rather than overwriting them with empty ones.
  // Repo-derived checks (detectors, AST metrics) are reused from the
  // per-dimension artifacts already in outDir instead of being recomputed —
  // the repo hasn't changed; only connector-affected categories re-score.
  collectedDirOverride?: string
): Promise<AuditCoreSummary> {
  const start = Date.now();
  const standards = loadStandards(standardsPath);
  const cats = standards.category as Record<string, Category>;
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(outDir, { recursive: true });

  const skillRoot = dirname(dirname(standardsPath));

  // 1. Deterministic collectors → collected/ artifacts. git is always present;
  //    ci self-probes; tracker/docs emit available:false without a connector.
  //    When collectedDirOverride is set (the `enrich` re-score path), skip
  //    collection entirely and reuse the caller's already-populated artifacts.
  const collectedDir = collectedDirOverride ?? join(outDir, 'collected');
  if (!collectedDirOverride) {
    // All tunables come from standards.toml [meta] — never hardcoded here.
    const period = periodFromStandards(standards);
    const gitOpts = gitOptsFromStandards(standards);
    for (const art of [
      collectGit(repoPath, period, gitOpts),
      collectCi(repoPath, period),
      collectTracker(repoPath, period),
      collectDocs(repoPath, period),
    ]) {
      writeArtifact(art as { source: string }, collectedDir);
    }
  }

  // One parse per collector artifact; sources/source_windows/topology flags
  // all derive from the same map.
  const collected = readCollectedArtifacts(collectedDir);
  const sources = deriveSources(collected, false);
  const sourceWindows = deriveSourceWindows(collected);

  // 2. Deterministic topology flags. Connector-dependent flags (has_tracker,
  //    has_docs_connector, has_incident_source) are derived from the collected
  //    artifacts' availability: without a connector they are absent (checks
  //    SKIP); once the orchestrator writes an available connector artifact and
  //    `enrich` re-scores, they flip true so the gated categories score.
  const readCollected = (src: string): Record<string, unknown> | null => {
    const { art, err } = collected.get(src)!;
    if (!art && (err as { code?: string })?.code !== 'ENOENT') {
      process.stderr.write(
        `audit-core: collected/${src}.json is unreadable: ${String(err)}\n`
      );
    }
    return art;
  };
  const trackerArt = readCollected('tracker');
  const docsArt = readCollected('docs');
  const codeHostArt = readCollected('code_host');
  const topology: TopologyFlags = computeTopology(repoPath, {
    has_tracker: Boolean(trackerArt?.available),
    has_docs_connector: Boolean(docsArt?.available),
    has_incident_source: Boolean(
      trackerArt?.available && trackerArt?.incident_source
    ),
    has_code_host: Boolean(codeHostArt?.available),
  });

  // 2b. Enrich reuse: on the enrich path the repo has not changed since
  //     audit-core wrote the per-dimension artifacts, so repo-derived results
  //     — detector checks and repo-scan (AST) metrics, the expensive part of
  //     the pass — are reused from the artifacts on disk. Only the categories
  //     a connector can affect are recomputed: judgment checks (re-emitted
  //     PENDING_JUDGMENT), categories gated by a connector topology flag, and
  //     metrics that read a collected artifact.
  const reusableChecks = new Map<number, CheckRecord>();
  if (collectedDirOverride) {
    for (const { checks } of dimensionFiles(outDir)) {
      for (const rec of checks) {
        for (const code of Array.isArray(rec.code) ? rec.code : [rec.code]) {
          if (!reusableChecks.has(code)) reusableChecks.set(code, rec);
        }
      }
    }
  }
  const canReuse = (c: Category): boolean => {
    if (!collectedDirOverride || c.method === 'judgment') return false;
    const flag = c.applies_when?.match(/^topology\.(.+)$/)?.[1];
    if (flag && CONNECTOR_TOPOLOGY_FLAGS.has(flag)) return false;
    if (!reusableChecks.has(c.code)) return false;
    if (detectors[c.code] !== undefined) return true;
    // Metric-routed: reusable only when the metric never reads a collected
    // artifact (pure repo scan — the AST metrics).
    return (
      c.metric !== undefined &&
      (c.sources ?? []).every((s) => !COLLECTED_ARTIFACT_SOURCES.has(s))
    );
  };

  // 3. Run each metric once. A metric reports the category codes it awarded
  //    (PASS) and whether it ran (OK) or skipped (no sources).
  const metricIds = new Set<string>();
  const catsByMetric = new Map<string, Category[]>();
  for (const c of Object.values(cats)) {
    if (c.metric) {
      const list = catsByMetric.get(c.metric) ?? [];
      list.push(c);
      catsByMetric.set(c.metric, list);
    }
    if (c.dimension === 'org-portfolio' || c.method === 'judgment') continue;
    if (canReuse(c)) continue;
    if (detectors[c.code] === undefined && c.metric) metricIds.add(c.metric);
  }
  const awarded = new Set<number>();
  const skippedByMetric = new Set<number>();
  const metricMeta = new Map<number, MetricMeta>();
  // Metrics that could not run — the id resolves to no function, or the
  // function threw. Their categories must SKIP ("couldn't measure"), never
  // FAIL ("measured, absent"), mirroring the detector branch's
  // `detector-error:` annotation.
  const metricErrors = new Map<string, string>();
  const metricResults = await Promise.all(
    [...metricIds].map(async (id) => {
      const fn = metrics[id];
      if (!fn) {
        process.stderr.write(`audit-core: unknown metric: ${id}\n`);
        metricErrors.set(id, `unknown metric: ${id}`);
        return null;
      }
      try {
        const res = await fn(collectedDir, standards, topology, repoPath);
        return { id, res };
      } catch (err) {
        process.stderr.write(
          `audit-core: metric ${id} threw: ${String(err)}\n`
        );
        metricErrors.set(id, `metric-error: ${String(err)}`);
        return null;
      }
    })
  );
  for (const [id, reason] of metricErrors) {
    for (const c of catsByMetric.get(id) ?? []) {
      skippedByMetric.add(c.code);
      if (!metricMeta.has(c.code)) metricMeta.set(c.code, { note: reason });
    }
  }
  for (const item of metricResults) {
    if (!item) continue;
    const { id, res } = item;
    // Awarded codes always take the metric's fresh meta; the metric's other
    // codes get it only when nothing was stored yet (e.g. no error note).
    for (const code of (res.categories_awarded ?? []) as number[]) {
      awarded.add(code);
      metricMeta.set(code, metaForCode(res, code));
    }
    for (const c of catsByMetric.get(id) ?? []) {
      if (res.status === 'SKIP') skippedByMetric.add(c.code);
      if (!metricMeta.has(c.code))
        metricMeta.set(c.code, metaForCode(res, c.code));
    }
  }

  // 4. Build a check record for every scored category, grouped by dimension.
  const byDimension: Record<string, CheckRecord[]> = {};
  let detected = 0;
  let computed = 0;
  let judgmentPending = 0;
  let skipped = 0;
  const pendingJudgmentChecks: AuditCoreSummary['pending_judgment_checks'] = [];

  for (const [key, c] of Object.entries(cats)) {
    if (c.dimension === 'org-portfolio') continue;
    const rec = canReuse(c)
      ? reusableChecks.get(c.code)!
      : buildCheck(
          key,
          c,
          detectors,
          repoPath,
          awarded,
          skippedByMetric,
          topology,
          metricMeta
        );
    (byDimension[c.dimension] ??= []).push(rec);
    if (rec.status === 'PENDING_JUDGMENT') {
      judgmentPending++;
      pendingJudgmentChecks.push({
        check_id: rec.check_id,
        dimension: c.dimension,
        code: Array.isArray(rec.code) ? rec.code : [rec.code],
      });
    } else if (rec.status === 'SKIP') skipped++;
    else if (c.method === 'computed') computed++;
    else detected++;
  }

  // 5. Per-dimension JSON + aggregated audit.json. Dimensions are emitted in
  //    the presentation order from standards.toml [meta].dimension_order
  //    (industry-standard engineering first, unscored descriptors last); each
  //    per-dimension JSON carries its `order` index plus the title/description
  //    from its dimensions/*.md frontmatter so aggregate/render can preserve
  //    the order and show the description as a tooltip without re-parsing.
  const dimOrder = metaDimensionOrder(standards);
  const dimMeta = parseDimensionMeta(join(skillRoot, 'dimensions'));
  let auditTotal = 0;
  let auditApplicable = 0;
  const dimensions: unknown[] = [];
  const dimNames = Object.keys(byDimension).sort(
    (a, b) => dimOrderIndex(a, dimOrder) - dimOrderIndex(b, dimOrder)
  );
  for (const dimension of dimNames) {
    const checks = byDimension[dimension];
    const score = round1(checks.reduce((s, c) => s + c.weight_awarded, 0));
    const applicable = checks
      .filter((c) => c.applies)
      .reduce((s, c) => s + c.weight_max, 0);
    auditTotal = round1(auditTotal + score);
    auditApplicable += applicable;
    const sourcesUsed = [
      ...new Set(checks.filter((c) => c.applies).flatMap((c) => c.sources)),
    ].sort();
    const meta = dimMeta.get(dimension);
    const dim = {
      dimension,
      date,
      order: dimOrderIndex(dimension, dimOrder),
      ...(meta?.title ? { title: meta.title } : {}),
      ...(meta?.description ? { description: meta.description } : {}),
      score,
      // null (not 0) when nothing is applicable: "no measurable surface" is
      // not the same statement as "0% of the surface is covered".
      coverage: applicable > 0 ? score / applicable : null,
      checks,
      sources_used: sourcesUsed,
      engine: ENGINE_PROVENANCE,
    };
    writeFileSync(
      join(outDir, `${dimension}.json`),
      JSON.stringify(dim, null, 2)
    );
    dimensions.push(dim);
  }

  // Compute linked repos, tech stack, and detection conflicts.
  const linkedRepos = detectLinkedRepos(repoPath);
  const ciPath = detectCiConfigPath(repoPath);
  const techStack = {
    languages: detectLanguages(repoPath).map((l) => ({
      name: l.def.displayName,
      evidence: l.evidence,
    })),
    agent_tools: detectAgentTools(repoPath).map((t) => ({
      name: t.def.displayName,
      evidence: t.evidence,
    })),
    ci: ciPath ? [{ name: ciPlatformName(ciPath), evidence: ciPath }] : [],
    frameworks: detectFrameworks(repoPath).map((f) => ({
      name: f.name,
      evidence: f.evidence,
    })),
  };
  const detectionConflicts = computeDetectionConflicts(repoPath);

  // Standards provenance for the report: the date the standard was last
  // verified (max last_verified across categories — the coverage headline
  // cites it) and the active-contributor threshold (interpolated into the
  // Reach tooltip so prose never drifts from the data).
  const standardsDate = Object.values(cats)
    .map((c) => c.last_verified ?? '')
    .filter(Boolean)
    .sort()
    .pop();
  const standardsMeta = {
    ...(standardsDate ? { standards_date: standardsDate } : {}),
    active_contributor_threshold: metaNumber(
      standards,
      'active_contributor_threshold',
      ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT
    ),
    highlight_yellow_below: metaNumber(
      standards,
      'highlight_yellow_below',
      HIGHLIGHT_YELLOW_BELOW_DEFAULT
    ),
    highlight_red_below: metaNumber(
      standards,
      'highlight_red_below',
      HIGHLIGHT_RED_BELOW_DEFAULT
    ),
  };

  const audit: Record<string, unknown> = {
    date,
    project: basename(repoPath),
    audit_total: auditTotal,
    coverage: auditApplicable > 0 ? auditTotal / auditApplicable : null,
    standards_meta: standardsMeta,
    dimensions,
    sources,
    linked_repos: linkedRepos,
    tech_stack: techStack,
    detection_conflicts: detectionConflicts,
    derived_delivery: computeDerivedDelivery(collectedDir, trackerArt),
    engine: ENGINE_PROVENANCE,
  };
  if (Object.keys(sourceWindows).length > 0)
    audit.source_windows = sourceWindows;
  writeFileSync(join(outDir, 'audit.json'), JSON.stringify(audit, null, 2));

  return {
    audit_total: auditTotal,
    categories: detected + computed + judgmentPending + skipped,
    detected,
    computed,
    judgment_pending: judgmentPending,
    pending_judgment_checks: pendingJudgmentChecks,
    skipped,
    duration_ms: Date.now() - start,
  };
}

/**
 * Iterate the per-dimension <name>.json files in `outDir` (everything but
 * audit.json / org-portfolio.json) that parse and carry a checks array.
 * Unreadable files go to `onError` (or are silently skipped without one).
 */
export function* dimensionFiles(
  outDir: string,
  onError?: (file: string, err: unknown) => void
): Generator<{
  file: string;
  dim: Record<string, unknown>;
  checks: CheckRecord[];
}> {
  const files = readdirSync(outDir).filter(
    (f) =>
      f.endsWith('.json') && f !== 'audit.json' && f !== 'org-portfolio.json'
  );
  for (const file of files) {
    let dim: Record<string, unknown>;
    try {
      dim = JSON.parse(readFileSync(join(outDir, file), 'utf8'));
    } catch (err) {
      onError?.(file, err);
      continue;
    }
    const checks = dim.checks as CheckRecord[] | undefined;
    if (!Array.isArray(checks)) continue;
    yield { file, dim, checks };
  }
}

/** Presentation order from standards.toml [meta].dimension_order (empty when absent). */
function metaDimensionOrder(standards: Record<string, unknown>): string[] {
  const meta = standards['meta'] as Record<string, unknown> | undefined;
  const order = meta?.['dimension_order'];
  return Array.isArray(order) ? order.map(String) : [];
}

/** Index of a dimension in the presentation order; unknown dimensions sort last, alphabetically. */
function dimOrderIndex(dimension: string, order: string[]): number {
  const i = order.indexOf(dimension);
  return i === -1 ? order.length : i;
}

/**
 * Parse `title:` and `description:` from every dimensions/*.md frontmatter,
 * keyed by the `name:` field. The description becomes the dimension tooltip in
 * the report. Handles plain values and `>-` folded scalars (single level).
 */
export function parseDimensionMeta(
  dimensionsDir: string
): Map<string, { title?: string; description?: string }> {
  const map = new Map<string, { title?: string; description?: string }>();
  let files: string[];
  try {
    files = readdirSync(dimensionsDir).filter((f) => f.endsWith('.md'));
  } catch {
    return map;
  }
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(dimensionsDir, file), 'utf8');
    } catch {
      continue;
    }
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) continue;
    const lines = fm[1].split('\n');
    const fields: Record<string, string> = {};
    for (let i = 0; i < lines.length; i++) {
      const kv = lines[i].match(/^(name|title|description):\s*(.*)$/);
      if (!kv) continue;
      let value = kv[2].trim();
      if (value === '>-' || value === '>' || value === '') {
        // folded scalar: join the following more-indented lines with spaces
        const parts: string[] = [];
        while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
          parts.push(lines[++i].trim());
        }
        value = parts.join(' ');
      }
      fields[kv[1]] = value;
    }
    if (fields.name) {
      map.set(fields.name, {
        title: fields.title,
        description: fields.description,
      });
    }
  }
  return map;
}

/** Evaluate a category's applies_when against topology flags — via the shared
 * applies_when interpreter so audit_core and awardCategories can't drift. */
function appliesGatedOff(c: Category, topology: TopologyFlags): boolean {
  return !evaluateAppliesWhen(c.applies_when, topology);
}

/**
 * Human-readable reason for a SKIP, shown in the report's evidence column so a
 * skipped check never renders as a bare "—". Prefers naming the missing data
 * source (actionable); falls back to the applies_when condition.
 */
/** Sources a user can actually connect. `audit` (source code) and `scale` are
 * pseudo-sources the engine always has — telling a reader to "connect a audit
 * source" for a topology-gated check was misleading noise. */
const CONNECTABLE_SOURCES = new Set([
  'tracker',
  'docs',
  'ci',
  'incident',
  'code_host',
]);

/** Sources whose data lives in a collected/<src>.json artifact — a metric
 * declaring any of these can change between audit-core and enrich. */
const COLLECTED_ARTIFACT_SOURCES = new Set([
  'git',
  'ci',
  'tracker',
  'docs',
  'incident',
  'code_host',
]);

/** Topology flags that flip when a connector artifact appears (see
 * computeTopology's connectors argument) — categories gated on them must be
 * re-evaluated on enrich. */
const CONNECTOR_TOPOLOGY_FLAGS = new Set([
  'has_tracker',
  'has_docs_connector',
  'has_incident_source',
  'has_code_host',
]);

function buildSkipReason(c: Category, topology: TopologyFlags): string {
  // Applicability wins: "this check doesn't apply to this repo" is the truth
  // even when the check also lists a connector source.
  if (appliesGatedOff(c, topology) && c.applies_when) {
    return `Not applicable — "${c.applies_when}" is false for this repository.`;
  }
  const connectable = (c.sources ?? []).filter((s) =>
    CONNECTABLE_SOURCES.has(s)
  );
  if (connectable.length > 0) {
    const label = connectable.join('/');
    const article = /^[aeiou]/i.test(label) ? 'an' : 'a';
    return `No ${label} data available — connect ${article} ${label} source (connector or config) to score this check.`;
  }
  return 'Skipped — the required data was not available.';
}

/**
 * Badge for an awarded metric-routed check, derived from the SAME rounded
 * weight the report displays (weight_awarded = round1(weight × score)). The
 * old raw-score cutoff (PASS at ≥0.999) could contradict the row: a 0.996
 * score rendered as "3/3 (100.0%)" yet wore a PARTIAL badge. Rounds-to-full
 * → PASS; rounds-to-zero → FAIL; anything between → PARTIAL. Weight-0
 * categories keep raw-score thresholds (they become INFO downstream anyway).
 */
export function scoreBadge(
  weight: number,
  score: number
): 'PASS' | 'PARTIAL' | 'FAIL' {
  if (weight > 0) {
    const awardedRounded = round1(weight * score);
    if (awardedRounded >= weight) return 'PASS';
    if (awardedRounded <= 0) return 'FAIL';
    return 'PARTIAL';
  }
  return score >= 0.999 ? 'PASS' : score <= 0.001 ? 'FAIL' : 'PARTIAL';
}

function buildCheck(
  key: string,
  c: Category,
  detectors: Record<number, DetectorFn>,
  repoPath: string,
  awarded: Set<number>,
  skippedByMetric: Set<number>,
  topology: TopologyFlags,
  metricMeta?: Map<number, MetricMeta>
): CheckRecord {
  let status: CheckStatus;
  let value: unknown = null;
  let evidence: string[] = [];
  let unit: string | undefined;
  let expression: string | undefined;
  let score = 0;
  let confidence = 0;

  if (appliesGatedOff(c, topology)) {
    // applies_when topology flag is false → category does not apply.
    // A human-readable reason is filled into `evidence` below (see skip-reason block).
    status = 'SKIP';
    // score=0, confidence=0 (already initialised)
  } else if (c.method === 'judgment') {
    status = 'PENDING_JUDGMENT';
    // score=0, confidence=0 until the orchestrator patches this check
  } else if (detectors[c.code] !== undefined) {
    // Detector branch: take status/score/confidence straight from DetectorResult.
    // Pass the category's threshold fields so detectors can read from standards.toml
    // instead of hardcoding threshold values.
    let r: DetectorResult;
    try {
      r = detectors[c.code](repoPath, {
        threshold: c.threshold,
        threshold_days: c.threshold_days,
        pass_at: c.pass_at,
        warn_at: c.warn_at,
        fail_at: c.fail_at,
      });
    } catch (err) {
      r = {
        status: 'FAIL',
        value: `detector-error: ${String(err)}`,
        evidence: [],
        method: c.method,
        score: 0,
        confidence: 1,
      };
    }
    status = r.status;
    value = r.value;
    evidence = r.evidence;
    score = r.score;
    confidence = r.confidence;
  } else {
    // Metric-routed branch (Correction 2): score is gated by applicability —
    // only an AWARDED (PASS) code carries the metric's continuous score.
    let baseStatus: CheckStatus;
    if (awarded.has(c.code)) baseStatus = 'PASS';
    else if (skippedByMetric.has(c.code)) baseStatus = 'SKIP';
    else baseStatus = 'FAIL';
    const meta = metricMeta?.get(c.code);
    if (meta) {
      unit = meta.unit;
      expression = meta.expression;
      value = meta.value ?? value;
      if (evidence.length === 0 && meta.evidence) evidence = meta.evidence;
    }

    if (baseStatus === 'SKIP') {
      score = 0;
      confidence = 0;
    } else if (baseStatus === 'FAIL') {
      score = 0;
      confidence = meta?.confidence ?? 1;
    } else {
      // awarded
      score = meta?.score ?? 1; // continuous metric score; default 1 (binary-present)
      confidence = meta?.confidence ?? 1;
    }

    // Derive the display badge from the score for awarded continuous metrics:
    if (baseStatus === 'PASS') {
      status = scoreBadge(c.weight, score);
    } else {
      status = baseStatus; // SKIP / FAIL unchanged
    }
  }

  // Weight-0 categories are informational descriptors: they carry a value but
  // no judgment, so a PASS/FAIL/PARTIAL badge would misread as an assessment.
  // INFO replaces any evaluated status (SKIP keeps its meaning).
  if (c.weight === 0 && status !== 'SKIP' && status !== 'PENDING_JUDGMENT') {
    status = 'INFO';
  }

  // A SKIP with no evidence renders as a bare "—"; give the reader a reason
  // why — preferring the metric's own reliability note (e.g. "squash-merge
  // workflow: no branch merge records…") over the generic source fallback.
  if (status === 'SKIP' && evidence.length === 0) {
    const metricNote = metricMeta?.get(c.code)?.note;
    evidence = [metricNote || buildSkipReason(c, topology)];
  }

  const applies = status !== 'SKIP';
  const weightAwarded = round1(c.weight * score);
  const source_date = c.date ?? null;
  const source_url = c.url ?? null;
  const hintDate = source_date ?? '';
  const rec: CheckRecord = {
    // standards.toml is the single source of truth for check ids (a Layer-1
    // lint requires check_id on every category); the table key is a last-
    // resort fallback so a malformed record still yields a stable id.
    check_id: c.check_id ?? key,
    code: [c.code],
    method: c.method,
    status,
    value,
    evidence,
    weight_awarded: weightAwarded,
    weight_max: c.weight,
    applies,
    reliability: {
      // Prefer the metric's PER-RUN tag: which sources were actually used
      // this run decides the regime (code-host PR data upgrades a metric
      // whose standards default assumes the git proxy). Detectors and
      // judgment checks have no metric result and keep the default.
      tag:
        metricMeta?.get(c.code)?.reliability_tag ??
        c.reliability_default ??
        'unknown',
      // Same vocabulary the metrics write (metrics/_base.ts Reliability).
      confidence: c.method === 'judgment' ? 'MED' : 'HIGH',
      note: null,
    },
    source: c.source ?? '',
    definition: c.definition ?? '',
    hint: `${c.definition ?? ''} · ${c.method} · ${c.source ?? ''}${hintDate ? ` (${hintDate})` : ''}`,
    // Inline lead: prefer a concise `summary`, fall back to the full definition.
    // The verbose `definition` still renders in the HTML tooltip regardless.
    plain: c.summary ?? c.definition ?? '',
    score,
    confidence,
    source_date,
    source_url,
    last_verified: c.last_verified ?? null,
    // Per-run provenance beats the standards declaration: a metric scored
    // from the code-host connector must list code_host in the report's
    // Sources column, not the git proxy it would have fallen back to.
    sources: metricMeta?.get(c.code)?.sources_used?.length
      ? metricMeta.get(c.code)!.sources_used!
      : (c.sources ?? []),
  };
  if (unit !== undefined) rec.unit = unit;
  if (expression !== undefined) rec.expression = expression;
  return rec;
}
