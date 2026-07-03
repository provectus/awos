/**
 * adp_g7_change_fail_rate — Change failure rate proxy (DORA banded).
 *
 * kind: "banded"
 * value: window_stats.revert_merges / window_stats.merges as a fraction (0–1),
 *        or null when no merges in the window
 * band: one of "elite" | "high" | "medium" | "low" per DORA change-failure thresholds
 * categories_awarded: [701] when data is available
 * reliability_default: "minimal" — lower bound: only keyword-detected
 *   revert/hotfix/rollback merges are counted; true change failure rate is
 *   likely higher because not all failures are reverted via tracked merge commits.
 *
 * DORA band thresholds (change_failure_rate in standards.toml):
 *   elite  → 0–5%   (rate < 0.05)
 *   high   → 5–10%  (rate < 0.10)
 *   medium → 10–15% (rate < 0.15)
 *   low    → > 15%  (rate >= 0.15)
 *
 * Source shape: collectedDir/git.json
 * Input fields: window_stats.revert_merges (number), window_stats.merges (number)
 *
 * SKIP: if git.json is absent, window_stats is absent, or window_stats.merges is 0.
 */
import {
  computeReliability,
  makeMetricResult,
  readArtifact,
  skipMetric,
  type MetricResult,
} from './_base.ts';
import { clamp01 } from './_score.ts';

/** Map change failure rate fraction to a DORA band label. */
export function doraChangeFailBand(rate: number): string {
  if (rate < 0.05) return 'elite';
  if (rate < 0.1) return 'high';
  if (rate < 0.15) return 'medium';
  return 'low';
}

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const read = readArtifact(collectedDir, 'git');
  if ('error' in read) {
    return skipMetric(
      'adp_g7_change_fail_rate',
      'banded',
      'minimal',
      'git',
      read.error
    );
  }

  const artifact = read.artifact;
  const raw = artifact?.raw;
  const ws = raw?.window_stats;
  if (!ws || typeof ws.merges !== 'number' || ws.merges === 0) {
    return skipMetric('adp_g7_change_fail_rate', 'banded', 'minimal', 'git');
  }

  const totalMerges: number = ws.merges;
  const revertMerges: number = ws.revert_merges ?? 0;
  const rate = revertMerges / totalMerges;
  const band = doraChangeFailBand(rate);

  // Reliability is "minimal" — lower bound: only keyword-detected revert/hotfix
  // commits are counted. True change failure rate may be higher as not all
  // failures result in a reverting merge commit with the right keywords.
  const reliability = computeReliability('minimal', ['git'], []);

  const expression = `${revertMerges}/${totalMerges} reverts = ${(rate * 100).toFixed(1)}% change failure rate (${band})`;
  return makeMetricResult(
    'adp_g7_change_fail_rate',
    rate,
    'banded',
    [701],
    reliability,
    ['git'],
    [],
    { band, expression, score: clamp01(1 - rate / 0.15), confidence: 1.0 }
  );
}
