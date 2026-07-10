import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'smol-toml';

// ---------------------------------------------------------------------------
// Standards loader
// ---------------------------------------------------------------------------

/** Parse a standards.toml file and return the raw object. */
export function loadStandards(path: string): Record<string, unknown> {
  return parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

/**
 * Read a numeric tunable from the standards.toml `[meta]` table. standards.toml
 * is the single source of truth for these values; `fallback` applies only when
 * the key is absent or malformed. Use this everywhere instead of hardcoding a
 * copy of a meta value.
 */
export function metaNumber(
  standards: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const meta = standards['meta'] as Record<string, unknown> | undefined;
  const value = meta?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The audit-wide measurement window in days (`[meta].max_lookback_days`). */
export function lookbackDays(standards: Record<string, unknown>): number {
  return metaNumber(standards, 'max_lookback_days', 90);
}

// ---------------------------------------------------------------------------
// Window clamping for connector records
// ---------------------------------------------------------------------------

export interface WindowClamp<T> {
  /** Records inside the window (plus records with no parseable timestamp). */
  kept: T[];
  /** Records older than the window, excluded from the metric. */
  dropped: number;
}

/**
 * Clamp connector records (CI runs, tracker tickets) to the audit window,
 * anchored to the NEWEST record timestamp — mirroring the git collector,
 * which anchors its window to the newest commit — so the result is
 * deterministic for a given artifact. Connectors routinely over-fetch
 * (e.g. `gh run list --limit 500` reaching months back); without this clamp
 * that history would leak into metrics that must measure the last
 * `[meta].max_lookback_days` only. Records with no parseable timestamp are
 * kept: they cannot be judged against the window, and silently dropping them
 * would misreport the sample.
 */
export function clampToWindow<T>(
  records: T[],
  days: number,
  tsOf: (r: T) => unknown
): WindowClamp<T> {
  let anchor = -Infinity;
  const stamps = records.map((r) => {
    const t = Date.parse(String(tsOf(r) ?? ''));
    if (Number.isFinite(t) && t > anchor) anchor = t;
    return t;
  });
  if (!Number.isFinite(anchor)) return { kept: records, dropped: 0 };
  const since = anchor - days * 86_400_000;
  const kept: T[] = [];
  let dropped = 0;
  records.forEach((r, i) => {
    if (Number.isFinite(stamps[i]) && stamps[i] < since) dropped++;
    else kept.push(r);
  });
  return { kept, dropped };
}

/** Pluralize `word` by suffixing "s" unless `n` is exactly 1. */
export function plural(n: number, word: string): string {
  return `${word}${n !== 1 ? 's' : ''}`;
}

/**
 * Trailing note for connector records dropped for falling outside the audit
 * window (see clampToWindow). Empty string when none were dropped, so callers
 * append it unconditionally.
 */
export function windowDropNote(dropped: number, days: number): string {
  return dropped > 0
    ? `; ${dropped} ${plural(dropped, 'run')} older than the ${days}-day window dropped`
    : '';
}

// ---------------------------------------------------------------------------
// Collected-artifact reader
// ---------------------------------------------------------------------------

/**
 * Read of a collected artifact: either the parsed JSON or a SKIP-worthy error.
 * The artifact is intentionally loosely typed — it is the raw JSON.parse
 * result, exactly what metrics previously produced inline.
 */
export type ArtifactRead =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { artifact: any } | { error: string };

/**
 * Read and parse `<collectedDir>/<source>.json`.
 *
 * Returns `{artifact}` on success, or `{error}` when the file is absent or
 * unparseable — metrics degrade to SKIP with the error carried in the
 * reliability note (see skipReliability) instead of crashing the whole
 * audit-core pass on one truncated artifact.
 */
// Parsed-artifact memo: a dozen metrics read the same git/tracker artifact
// (which can be MBs) within one audit-core pass. Keyed on mtime+size so a
// test that rewrites an artifact in-process still gets the fresh parse.
// Consumers treat artifacts as read-only, so sharing the parsed object is safe.
const ARTIFACT_CACHE = new Map<string, { stamp: string; read: ArtifactRead }>();

export function readArtifact(
  collectedDir: string,
  source: string
): ArtifactRead {
  const path = join(collectedDir, `${source}.json`);
  let stamp: string;
  try {
    const st = statSync(path);
    stamp = `${st.mtimeMs}:${st.size}`;
  } catch {
    return { error: `${source}.json not found` };
  }
  const hit = ARTIFACT_CACHE.get(path);
  if (hit && hit.stamp === stamp) return hit.read;
  let read: ArtifactRead;
  try {
    read = { artifact: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (err) {
    read = {
      error: `${source}.json unreadable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  ARTIFACT_CACHE.set(path, { stamp, read });
  return read;
}

/**
 * Reliability for a metric that degrades to SKIP because its source artifact
 * could not be read. Same shape computeReliability produces for a fully
 * missing source, with the concrete read error appended so the report says
 * why the source was unusable.
 */
export function skipReliability(
  defaultTag: string,
  source: string,
  error: string
): Reliability {
  return {
    tag: defaultTag,
    confidence: 'LOW',
    note: `missing sources: ${source} (${error})`,
  };
}

// ---------------------------------------------------------------------------
// Tracker fetch-completeness note
// ---------------------------------------------------------------------------

/**
 * Optional fetch-completeness block the orchestrator writes into the tracker
 * artifact's `raw` (see references/connector-shapes.md). Absent on older
 * artifacts; every field is optional.
 */
interface TrackerFetchMeta {
  tickets_fetched?: number;
  tickets_total?: number | null;
  complete?: boolean;
  pages_fetched?: number;
  changelog_fetched_for?: number;
  note?: string;
}

/**
 * Human note when the tracker fetch was PARTIAL — `fetch_meta.complete` is
 * explicitly false, or `tickets_total` exceeds `tickets_fetched` (e.g. exactly
 * one Jira page of 100 out of 432 tickets). Returns null when fetch_meta is
 * absent or the fetch looks complete, so metrics can append it unconditionally.
 * Tracker-consuming metrics append this to their reliability note so a
 * silently-truncated fetch is visible in the report.
 */
export function trackerFetchNote(raw: unknown): string | null {
  const meta = (raw as { fetch_meta?: unknown } | null | undefined)?.fetch_meta;
  if (!meta || typeof meta !== 'object') return null;
  const fm = meta as TrackerFetchMeta;
  const fetched =
    typeof fm.tickets_fetched === 'number' &&
    Number.isFinite(fm.tickets_fetched)
      ? fm.tickets_fetched
      : null;
  const total =
    typeof fm.tickets_total === 'number' && Number.isFinite(fm.tickets_total)
      ? fm.tickets_total
      : null;
  const partial =
    fm.complete === false ||
    (total !== null && fetched !== null && total > fetched);
  if (!partial) return null;
  let note = 'partial tracker fetch';
  if (fetched !== null && total !== null) {
    note += `: ${fetched} of ${total} tickets`;
  } else if (fetched !== null) {
    note += `: ${fetched} tickets fetched`;
  }
  if (typeof fm.note === 'string' && fm.note.trim().length > 0) {
    note += `; ${fm.note.trim()}`;
  }
  return note;
}

/**
 * Return `rel` with `extra` appended to its note (semicolon-joined), or `rel`
 * unchanged when `extra` is null/empty. Never mutates the input.
 */
export function appendReliabilityNote(
  rel: Reliability,
  extra: string | null
): Reliability {
  if (!extra) return rel;
  return { ...rel, note: rel.note ? `${rel.note}; ${extra}` : extra };
}

// ---------------------------------------------------------------------------
// Reliability computation
// ---------------------------------------------------------------------------

export interface Reliability {
  tag: string;
  confidence: 'HIGH' | 'MED' | 'LOW';
  note: string | null;
}

/**
 * Compute a reliability descriptor for a metric result.
 *
 * Rules:
 * - HIGH  → no sources are missing (sourcesMissing is empty)
 * - MED   → at least one source was used but some are missing
 * - LOW   → no sources were used (sourcesUsed is empty, only proxy/partial coverage)
 *
 * The tag is always passed through unchanged; it names the reliability
 * regime from standards.toml (e.g. "maximal", "not-reliable").
 */
export function computeReliability(
  defaultTag: string,
  sourcesUsed: string[],
  sourcesMissing: string[]
): Reliability {
  if (sourcesMissing.length === 0) {
    return { tag: defaultTag, confidence: 'HIGH', note: null };
  }
  if (sourcesUsed.length > 0) {
    return {
      tag: defaultTag,
      confidence: 'MED',
      note: `missing sources: ${sourcesMissing.join(', ')}`,
    };
  }
  return {
    tag: defaultTag,
    confidence: 'LOW',
    note: `missing sources: ${sourcesMissing.join(', ')}`,
  };
}

// ---------------------------------------------------------------------------
// Metric result builder
// ---------------------------------------------------------------------------

export interface MetricResult {
  metric: string;
  value: unknown;
  kind: string;
  band: string | null;
  categories_awarded: number[];
  reliability: Reliability;
  sources_used: string[];
  sources_missing: string[];
  status: 'OK' | 'SKIP';
  /** Fraction of capability present: ∈ [0,1]. Default: 1 when any category awarded, 0 otherwise (or 0 on SKIP). */
  score: number;
  /** Fraction of applicable surface measured: ∈ [0,1]. Default: 1 when OK, 0 on SKIP. */
  confidence: number;
  /** Per-category-code score overrides for metrics that award multiple codes with different natural scores. */
  score_per_code?: Record<number, number>;
  /** Per-category-code evidence lines for metrics that emit layer-specific evidence (e.g. tooling_depth). */
  evidence_per_code?: Record<number, string[]>;
  /** Human-readable derivation of the value (e.g. "42 of 50 public defs documented = 0.84"). */
  expression?: string;
  /** Unit of the value (e.g. "ratio", "days", "count"). */
  unit?: string;
}

/** The uniform signature every metric module exports into the METRICS registry. */
export type MetricFn = (
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>,
  repoPath?: string
) => MetricResult | Promise<MetricResult>;

/**
 * Build a standardised metric result object.
 *
 * status is "SKIP" when sourcesUsed is empty (no data was available to
 * compute the metric); "OK" otherwise.
 *
 * score defaults to 1 when any category is awarded, 0 otherwise (and 0 on SKIP).
 * confidence defaults to 1 when OK, 0 on SKIP.
 * scorePerCode provides per-code overrides for metrics that feed multiple codes
 * with different natural scores (e.g. doc_coverage).
 */
export interface MetricResultOptions {
  band?: string | null;
  unit?: string;
  /** Human-readable derivation of the value. */
  expression?: string;
  score?: number;
  confidence?: number;
  scorePerCode?: Record<number, number>;
  evidencePerCode?: Record<number, string[]>;
}

export function makeMetricResult(
  metric: string,
  value: unknown,
  kind: string,
  categoriesAwarded: number[],
  reliability: Reliability,
  sourcesUsed: string[],
  sourcesMissing: string[],
  opts: MetricResultOptions = {}
): MetricResult {
  const {
    band = null,
    unit,
    expression,
    score,
    confidence,
    scorePerCode,
    evidencePerCode,
  } = opts;
  const status: 'OK' | 'SKIP' = sourcesUsed.length === 0 ? 'SKIP' : 'OK';
  const result: MetricResult = {
    metric,
    value,
    kind,
    band,
    categories_awarded: [...categoriesAwarded],
    reliability,
    sources_used: [...sourcesUsed],
    sources_missing: [...sourcesMissing],
    status,
    score:
      score ?? (status === 'SKIP' ? 0 : categoriesAwarded.length > 0 ? 1 : 0),
    confidence: confidence ?? (status === 'SKIP' ? 0 : 1),
  };
  if (scorePerCode !== undefined) {
    result.score_per_code = scorePerCode;
  }
  if (evidencePerCode !== undefined) {
    result.evidence_per_code = evidencePerCode;
  }
  if (unit !== undefined) {
    result.unit = unit;
  }
  if (expression !== undefined) {
    result.expression = expression;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Metric SKIP shorthand
// ---------------------------------------------------------------------------

/**
 * Standard SKIP result for a metric whose single source artifact is unusable.
 * With `error`, the artifact file was absent/unparseable (skipReliability);
 * without, the artifact exists but reports `available: false` — no connector
 * was provided (computeReliability with the source missing).
 */
export function skipMetric(
  metric: string,
  kind: string,
  tag: string,
  source: string,
  error?: string
): MetricResult {
  const reliability = error
    ? skipReliability(tag, source, error)
    : computeReliability(tag, [], [source]);
  return makeMetricResult(metric, null, kind, [], reliability, [], [source]);
}

/** Common (metric, kind, tag) identity a connector metric SKIPs under. */
export interface SkipIdentity {
  metric: string;
  kind: string;
  tag: string;
}

/** Payload keys a connector artifact can carry records under — checked both
 * at the top level (the malformed-envelope case: a bare `{fetch_meta, period,
 * runs}` write) and under `raw` (the documented envelope). */
const PAYLOAD_KEYS = [
  'runs',
  'tickets',
  'prs',
  'pages',
  'pipelines',
  'incidents',
  'issues',
];

/**
 * Count the records stranded in an artifact that is NOT marked available.
 * A non-zero count means the orchestrator fetched real data but wrote a
 * malformed envelope (most often: payload at the top level with no
 * `available: true`), and the engine would otherwise silently score the
 * source as absent while hundreds of fetched records sit on disk.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function strandedPayloadCount(artifact: any): number {
  let n = 0;
  for (const container of [artifact, artifact?.raw]) {
    if (!container || typeof container !== 'object') continue;
    for (const key of PAYLOAD_KEYS) {
      const v = container[key];
      if (Array.isArray(v)) n += v.length;
    }
  }
  return n;
}

/** The loud note for a data-rich artifact whose envelope disables it. */
export function malformedEnvelopeNote(source: string, records: number): string {
  return (
    `${source}.json holds ${records} fetched record(s) but lacks ` +
    `\`available: true\` — malformed envelope, data ignored by the engine; ` +
    `rewrite as {source, available, period, raw: {…}} per references/connector-shapes.md and re-run enrich`
  );
}

/**
 * Load a connector artifact for a metric, short-circuiting to the metric's
 * standard SKIP when the source is unusable. Collapses the four-line dance
 * every connector metric opens with: read → SKIP on read error → SKIP when
 * `available` is false → default `raw` to `{}`. On success returns the parsed
 * `raw` block and the whole `artifact` (callers that also read `period` etc.).
 */
export function loadArtifactOrSkip(
  collectedDir: string,
  source: string,
  id: SkipIdentity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { raw: any; artifact: any } | { skip: MetricResult } {
  const read = readArtifact(collectedDir, source);
  if ('error' in read) {
    return { skip: skipMetric(id.metric, id.kind, id.tag, source, read.error) };
  }
  const artifact = read.artifact;
  if (!artifact?.available) {
    // Data-rich but mis-enveloped artifact: skip as usual, but say WHY loudly
    // — a generic "missing sources" note here hid 688 fetched CI runs once.
    const stranded = strandedPayloadCount(artifact);
    if (stranded > 0) {
      return {
        skip: skipMetric(
          id.metric,
          id.kind,
          id.tag,
          source,
          malformedEnvelopeNote(source, stranded)
        ),
      };
    }
    return { skip: skipMetric(id.metric, id.kind, id.tag, source) };
  }
  return { raw: artifact?.raw ?? {}, artifact };
}

/**
 * Load git.json's `window_stats` for a metric, short-circuiting to the metric's
 * standard SKIP when git.json is unreadable or carries no `window_stats`.
 * Returns both `raw` (some callers also read `merge_records`) and `ws` (the
 * `window_stats` block). Git is not availability-gated, so — unlike
 * loadArtifactOrSkip — there is no `available` check.
 */
export function readGitWindow(
  collectedDir: string,
  id: SkipIdentity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { raw: any; ws: any } | { skip: MetricResult } {
  const read = readArtifact(collectedDir, 'git');
  if ('error' in read) {
    return { skip: skipMetric(id.metric, id.kind, id.tag, 'git', read.error) };
  }
  const raw = read.artifact?.raw;
  if (!raw || !raw.window_stats) {
    return { skip: skipMetric(id.metric, id.kind, id.tag, 'git') };
  }
  return { raw, ws: raw.window_stats };
}

/**
 * Squash/rebase-merge workflows produce no merge commits, so merge_records is
 * empty or unrepresentative (only the rare true merge). Reporting a confident
 * number from that residue would mis-measure a healthy repo — merge-record
 * metrics degrade with this shared note instead.
 */
export const SQUASH_MERGE_NOTE =
  'squash-merge workflow: no branch merge records in git — connect a code-host connector (PR API) to measure this';

/** Reliability for the squash-merge circuit breaker (see SQUASH_MERGE_NOTE). */
export function squashSkipReliability(): Reliability {
  return { tag: 'not-reliable', confidence: 'LOW', note: SQUASH_MERGE_NOTE };
}

// ---------------------------------------------------------------------------
// Category award helper
// ---------------------------------------------------------------------------

type Standards = Record<string, unknown>;

/**
 * Evaluate a standards.toml `applies_when` expression against topology flags.
 *   "always" (or absent)   → true
 *   "topology.<flag>"      → flags[flag] is truthy
 *   anything else          → false
 * The single interpreter for this mini-DSL — audit_core and awardCategories
 * must agree on its semantics.
 */
export function evaluateAppliesWhen(
  appliesWhen: string | undefined,
  flags: Record<string, boolean>
): boolean {
  if (!appliesWhen || appliesWhen === 'always') return true;
  const m = appliesWhen.match(/^topology\.(.+)$/);
  return m !== null && Boolean(flags[m[1]]);
}

/**
 * Return the category codes from standards whose metric equals metricName
 * and whose applies_when condition evaluates true against predicateCtx.
 *
 * applies_when values:
 *   "always"               → always included
 *   "topology.<flag>"      → included when predicateCtx[flag] is truthy
 */
export function awardCategories(
  standards: Standards,
  metricName: string,
  predicateCtx: Record<string, boolean>
): number[] {
  const categoryTable = standards['category'] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!categoryTable) return [];

  const awarded: number[] = [];
  for (const cat of Object.values(categoryTable)) {
    if (cat['metric'] !== metricName) continue;
    const appliesWhen = cat['applies_when'] as string | undefined;
    if (evaluateAppliesWhen(appliesWhen, predicateCtx)) {
      awarded.push(cat['code'] as number);
    }
  }
  return awarded;
}
