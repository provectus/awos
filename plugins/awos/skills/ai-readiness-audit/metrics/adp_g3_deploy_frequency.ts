/**
 * adp_g3_deploy_frequency — Deploy / merge frequency (DORA banded).
 *
 * kind: "banded"
 * value: merges per week over the whole audit window
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
 * Computation: window_stats.merges / (window_stats.window_days / 7)
 * Single whole-window aggregate — no bucket averaging.
 *
 * Source shape: collectedDir/git.json
 * Input raw fields: window_stats (WindowStats — merges, window_days)
 *
 * SKIP: if git.json is absent or raw.window_stats is absent.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';
import { bandScore } from './_score.ts';

const DEPLOY_FREQ_ANCHORS = [
  { x: 0.03, y: 0 },
  { x: 0.25, y: 0.1 },
  { x: 1.0, y: 0.5 },
  { x: 7.0, y: 1.0 },
] as const;

/** Map merges-per-week to a DORA band label. */
export function doraDeployBand(mergesPerWeek: number): string {
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
  if (!raw || !raw.window_stats) {
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

  const windowStats = raw.window_stats;
  const totalMerges: number = windowStats.merges ?? 0;
  const windowDays: number = windowStats.window_days ?? 0;

  if (windowDays <= 0) {
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

  const totalWeeks = windowDays / 7;
  const mergesPerWeek = totalMerges / totalWeeks;

  const band = doraDeployBand(mergesPerWeek);
  const reliability = computeReliability('not-reliable', ['git'], []);

  const score = bandScore(
    mergesPerWeek,
    DEPLOY_FREQ_ANCHORS as Array<{ x: number; y: number }>,
    'log'
  );
  const expression = `${totalMerges} merges / ${totalWeeks.toFixed(1)}w = ${mergesPerWeek.toFixed(2)}/week (${band})`;
  return makeMetricResult(
    'adp_g3_deploy_frequency',
    mergesPerWeek,
    'banded',
    [301],
    reliability,
    ['git'],
    [],
    band,
    undefined,
    expression,
    score,
    1.0
  );
}
