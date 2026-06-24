/**
 * adp_g3_deploy_frequency — Deploy / merge frequency (DORA banded).
 *
 * kind: "banded"
 * value: merges per week (average across monthly buckets)
 * band: one of "elite" | "high" | "medium" | "low" per DORA thresholds
 * categories_awarded: [301] when data is available
 * reliability_default: "not-reliable" (direction depends on team size)
 *
 * DORA band thresholds (deploy_frequency in standards.toml):
 *   elite  → multiple per day  (>= 7/week proxy)
 *   high   → once/day to once/week  (>= 1/week, < 7/week)
 *   medium → once/week to once/month  (>= 0.25/week, < 1/week)
 *   low    → < once per month  (< 0.25/week)
 *
 * Computation: sum all bucket merges / total bucket period weeks.
 * Buckets come from git.json raw.monthly_buckets (each ~30 days).
 *
 * Source shape: collectedDir/git.json
 * Input raw fields: monthly_buckets (Array<{ merges: number; bucket_days?: number }>)
 * Also uses period.bucket_days for week conversion.
 *
 * SKIP: if git.json is absent or monthly_buckets is empty.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';

/** Map merges-per-week to a DORA band label. */
function doraDeployBand(mergesPerWeek: number): string {
  if (mergesPerWeek >= 7) return 'elite';
  if (mergesPerWeek >= 1) return 'high';
  if (mergesPerWeek >= 0.25) return 'medium';
  return 'low';
}

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const gitPath = join(collectedDir, 'git.json');
  if (!existsSync(gitPath)) {
    return makeMetricResult(
      'adp_g3_deploy_frequency',
      null,
      'banded',
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
      'adp_g3_deploy_frequency',
      null,
      'banded',
      [],
      computeReliability('not-reliable', [], ['git']),
      [],
      ['git']
    );
  }

  const buckets: Array<{ merges: number }> = raw.monthly_buckets;
  const bucketDays: number = artifact?.period?.bucket_days ?? 30;
  const totalMerges = buckets.reduce((sum, b) => sum + (b.merges ?? 0), 0);
  const totalDays = buckets.length * bucketDays;
  const totalWeeks = totalDays / 7;
  const mergesPerWeek = totalWeeks > 0 ? totalMerges / totalWeeks : 0;

  const band = doraDeployBand(mergesPerWeek);
  const reliability = computeReliability('not-reliable', ['git'], []);

  return makeMetricResult(
    'adp_g3_deploy_frequency',
    mergesPerWeek,
    'banded',
    [301],
    reliability,
    ['git'],
    [],
    band
  );
}
