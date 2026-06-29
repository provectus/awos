/**
 * adp_g2_contributors — Active monthly contributor count.
 *
 * kind: "computed"
 * value: average distinct author count per 30-day monthly bucket
 * categories_awarded: [201] when data is available
 * reliability_default: "not-reliable" (raw count; no direction without context)
 *
 * Source shape: collectedDir/git.json
 * Input raw fields: monthly_buckets (Array<{ authors: number }>)
 *
 * SKIP: if git.json is absent or monthly_buckets is empty.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  capBucketsByHistory,
  computeReliability,
  makeMetricResult,
  type MetricResult,
  type ValueSeriesEntry,
} from './_base.ts';

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const gitPath = join(collectedDir, 'git.json');
  if (!existsSync(gitPath)) {
    return makeMetricResult(
      'adp_g2_contributors',
      null,
      'computed',
      [],
      computeReliability('not-reliable', [], ['git']),
      [],
      ['git']
    );
  }

  const artifact = JSON.parse(readFileSync(gitPath, 'utf8'));
  const raw = artifact?.raw;
  if (
    !raw ||
    !Array.isArray(raw.monthly_buckets) ||
    raw.monthly_buckets.length === 0
  ) {
    return makeMetricResult(
      'adp_g2_contributors',
      null,
      'computed',
      [],
      computeReliability('not-reliable', [], ['git']),
      [],
      ['git']
    );
  }

  const historyAvailableDays: number =
    artifact?.period?.history_available_days ?? 0;
  const bucketDays: number = artifact?.period?.bucket_days ?? 30;

  const allBuckets: Array<{ bucket_start: string; authors: number }> =
    raw.monthly_buckets;
  const buckets = capBucketsByHistory(
    allBuckets,
    historyAvailableDays,
    bucketDays
  );

  const avg =
    buckets.reduce((sum, b) => sum + (b.authors ?? 0), 0) / buckets.length;

  const value_series: ValueSeriesEntry[] = buckets.map((b) => ({
    bucket_start: b.bucket_start,
    value: b.authors ?? null,
  }));

  const reliability = computeReliability('not-reliable', ['git'], []);

  const expression = `avg ${avg.toFixed(1)} contributors/month over ${buckets.length} bucket${buckets.length !== 1 ? 's' : ''}`;
  return makeMetricResult(
    'adp_g2_contributors',
    avg,
    'computed',
    [201],
    reliability,
    ['git'],
    [],
    null,
    value_series,
    undefined,
    expression
  );
}
