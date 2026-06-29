/**
 * adp_g7_change_fail_rate — Change failure rate proxy (DORA banded).
 *
 * kind: "banded"
 * value: revert_merges / total_merges as a fraction (0–1), or null when no merges
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
 * Input raw fields: revert_merges (number), total_merges (number)
 *
 * SKIP: if git.json is absent or total_merges is 0.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';

/** Map change failure rate fraction to a DORA band label. */
function doraChangeFailBand(rate: number): string {
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
  const gitPath = join(collectedDir, 'git.json');
  if (!existsSync(gitPath)) {
    return makeMetricResult(
      'adp_g7_change_fail_rate',
      null,
      'banded',
      [],
      computeReliability('minimal', [], ['git']),
      [],
      ['git']
    );
  }

  const artifact = JSON.parse(readFileSync(gitPath, 'utf8'));
  const raw = artifact?.raw;
  if (!raw || typeof raw.total_merges !== 'number' || raw.total_merges === 0) {
    return makeMetricResult(
      'adp_g7_change_fail_rate',
      null,
      'banded',
      [],
      computeReliability('minimal', [], ['git']),
      [],
      ['git']
    );
  }

  const totalMerges: number = raw.total_merges;
  const revertMerges: number = raw.revert_merges ?? 0;
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
    band,
    undefined,
    undefined,
    expression
  );
}
