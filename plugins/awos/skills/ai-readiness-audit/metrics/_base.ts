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
