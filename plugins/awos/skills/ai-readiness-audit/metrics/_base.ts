import { readFileSync } from 'node:fs';
import { parse } from 'smol-toml';

// ---------------------------------------------------------------------------
// Standards loader
// ---------------------------------------------------------------------------

/** Parse a standards.toml file and return the raw object. */
export function loadStandards(path: string): Record<string, unknown> {
  return parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
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

/** One data point in a monthly history series. */
export interface ValueSeriesEntry {
  /** ISO 8601 start of the 30-day bucket. */
  bucket_start: string;
  /** Computed metric value for this bucket, or null when the bucket has no data. */
  value: number | null;
}

export interface MetricResult {
  metric: string;
  value: unknown;
  kind: string;
  band: string | null;
  categories_awarded: unknown[];
  reliability: Reliability;
  sources_used: string[];
  sources_missing: string[];
  status: 'OK' | 'SKIP';
  /** Monthly history series (one entry per 30-day bucket), omitted for snapshot/non-rate metrics. */
  value_series?: ValueSeriesEntry[];
}

/**
 * Build a standardised metric result object.
 *
 * status is "SKIP" when sourcesUsed is empty (no data was available to
 * compute the metric); "OK" otherwise.
 *
 * Pass `valueSeries` for rate/over-time metrics; omit (or pass undefined) for
 * snapshot metrics — the field will not appear in the result.
 */
export function makeMetricResult(
  metric: string,
  value: unknown,
  kind: string,
  categoriesAwarded: unknown[],
  reliability: Reliability,
  sourcesUsed: string[],
  sourcesMissing: string[],
  band: string | null = null,
  valueSeries?: ValueSeriesEntry[]
): MetricResult {
  const result: MetricResult = {
    metric,
    value,
    kind,
    band,
    categories_awarded: [...categoriesAwarded],
    reliability,
    sources_used: [...sourcesUsed],
    sources_missing: [...sourcesMissing],
    status: sourcesUsed.length === 0 ? 'SKIP' : 'OK',
  };
  if (valueSeries !== undefined) {
    result.value_series = valueSeries;
  }
  return result;
}

// ---------------------------------------------------------------------------
// History series helpers
// ---------------------------------------------------------------------------

/**
 * Cap a monthly_buckets array to at most `maxDays` of history.
 *
 * Buckets are ordered oldest-first (ascending bucket_start). We keep the
 * MOST RECENT buckets that fit within `maxDays`. Each bucket covers
 * `bucketDays` days.
 *
 * When `maxDays` is 0 or negative, returns the full array unchanged (no cap).
 */
export function capBucketsByHistory<T extends { bucket_start: string }>(
  buckets: T[],
  maxDays: number,
  bucketDays: number
): T[] {
  if (maxDays <= 0 || bucketDays <= 0) return buckets;
  const maxBuckets = Math.floor(maxDays / bucketDays);
  if (maxBuckets <= 0) return [];
  if (buckets.length <= maxBuckets) return buckets;
  // Keep the most-recent (tail) buckets.
  return buckets.slice(buckets.length - maxBuckets);
}

// ---------------------------------------------------------------------------
// Category award helper
// ---------------------------------------------------------------------------

type Standards = Record<string, unknown>;

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
    if (!appliesWhen || appliesWhen === 'always') {
      awarded.push(cat['code'] as number);
      continue;
    }
    // topology.<flag>
    const topologyMatch = appliesWhen.match(/^topology\.(.+)$/);
    if (topologyMatch) {
      const flag = topologyMatch[1];
      if (predicateCtx[flag]) {
        awarded.push(cat['code'] as number);
      }
    }
  }
  return awarded;
}
