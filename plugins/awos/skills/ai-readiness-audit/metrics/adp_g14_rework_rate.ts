/**
 * adp_g14_rework_rate — Deployment rework rate proxy (DORA 2024, git keyword proxy).
 *
 * DORA definition: "the ratio of deployments that are unplanned but happen as a result
 * of an incident in production" — the percentage of deployments that are unplanned work
 * to fix bugs. Introduced as DORA's fifth metric in 2024.
 * Source: https://dora.dev/guides/dora-metrics/
 *
 * Git proxy: each first-parent merge is treated as a deployment unit. Merges whose
 * commit subject matches fix|bugfix|hotfix|patch|defect|regression (case-insensitive)
 * in the 90-day window are counted as unplanned fix deployments.
 *
 *   rework_rate = window_stats.fix_merges / window_stats.merges
 *
 * Distinct from related metrics:
 *   - adp_g7_change_fail_rate (g7): measures deployments needing immediate intervention
 *     (revert/rollback) AFTER a deployment — a stricter signal of deployment failure.
 *     Both are DORA metrics; hotfix appears in g7's keyword list too because a hotfix
 *     deployment is also a change-failure event. The overlap is inherent to keyword proxies.
 *   - adp_g6_churn (g6): measures line-level code turnover (insertions deleted within the
 *     rework horizon) — a file-content signal, not a deployment-unit signal.
 *
 * Bands are AWOS heuristics. DORA publishes no numeric thresholds for rework rate.
 *   good       → rate < 0.15  (< 15% of merges are unplanned fix deployments)
 *   watch      → rate < 0.30  (15–29%)
 *   concerning → rate >= 0.30 (30%+)
 *
 * Score anchors (linear piecewise, clamped to [0,1]):
 *   x=0.00 → y=1.0
 *   x=0.15 → y=0.8
 *   x=0.30 → y=0.4
 *   x=0.50 → y=0.0
 *
 * kind: "banded"
 * awards_code: 1401
 * reliability_default: "minimal" — lower bound; only keyword-matched merges are counted.
 *
 * SKIP: git.json absent, window_stats absent, or window_stats.merges === 0.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';
import { bandScore, clamp01 } from './_score.ts';

/** AWOS heuristic band anchors for rework rate (no DORA published thresholds). */
const REWORK_ANCHORS = [
  { x: 0, y: 1 },
  { x: 0.15, y: 0.8 },
  { x: 0.3, y: 0.4 },
  { x: 0.5, y: 0 },
];

/**
 * Map rework rate fraction to an AWOS heuristic band label.
 * DORA publishes no numeric thresholds for rework rate; these bands are AWOS heuristics.
 */
export function reworkBand(rate: number): string {
  if (rate < 0.15) return 'good';
  if (rate < 0.3) return 'watch';
  return 'concerning';
}

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const gitPath = join(collectedDir, 'git.json');
  if (!existsSync(gitPath)) {
    return makeMetricResult(
      'adp_g14_rework_rate',
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
  const ws = raw?.window_stats;
  if (!ws || typeof ws.merges !== 'number' || ws.merges === 0) {
    return makeMetricResult(
      'adp_g14_rework_rate',
      null,
      'banded',
      [],
      computeReliability('minimal', [], ['git']),
      [],
      ['git']
    );
  }

  const totalMerges: number = ws.merges;
  const fixMerges: number = ws.fix_merges ?? 0;
  const rate = fixMerges / totalMerges;
  const band = reworkBand(rate);

  // reliability_default = "minimal" — keyword proxy; true rework rate is likely higher
  // because not all unplanned fix deployments carry the matched keywords in their message.
  const reliability = computeReliability('minimal', ['git'], []);

  const pct = (rate * 100).toFixed(1);
  const expression = `${fixMerges}/${totalMerges} merges are unplanned fix work = ${pct}% rework rate (${band})`;

  const score = clamp01(bandScore(rate, REWORK_ANCHORS, 'linear'));

  return makeMetricResult(
    'adp_g14_rework_rate',
    rate,
    'banded',
    [1401],
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
