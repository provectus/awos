/**
 * adp_g6_churn — Code turnover (windowed, banded, directional).
 *
 * kind: "computed"
 * value: code_turnover.ratio — reworked lines ÷ added lines over the window,
 *   where "reworked" = lines deleted within rework_horizon_days (21) of being
 *   authored. Lower is better (less recently-written code being thrown away).
 * band: "good" (<0.12) | "watch" (<0.18) | "concerning" (>=0.18)
 * categories_awarded: [601] when data is available
 * reliability_default: "minimal" (the collector approximates per-line authored
 *   age from per-file numstat counts via a FIFO replay; line identity is not
 *   tracked — industry-accepted approximation for a directional health signal)
 *
 * Source shape: collectedDir/git.json
 * Input raw fields: code_turnover ({ reworked_lines, total_added, ratio })
 *
 * SKIP: if git.json is absent, code_turnover is missing, or its ratio is null
 *   (no in-window additions to normalise against).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';
import { bandScore, clamp01 } from './_score.ts';

/**
 * Turnover→score anchors (linear, lower ratio → higher score):
 *   0%   → 1.0   (no rework)
 *   12%  → 0.8   ("good" / "watch" boundary)
 *   18%  → 0.4   ("watch" / "concerning" boundary)
 *   30%+ → 0.0   (deeply concerning)
 */
const TURNOVER_ANCHORS = [
  { x: 0, y: 1.0 },
  { x: 0.12, y: 0.8 },
  { x: 0.18, y: 0.4 },
  { x: 0.3, y: 0.0 },
] as const;

/** Map a turnover ratio to its band label. */
function turnoverBand(ratio: number): string {
  if (ratio < 0.12) return 'good';
  if (ratio < 0.18) return 'watch';
  return 'concerning';
}

function skip(): MetricResult {
  return makeMetricResult(
    'adp_g6_churn',
    null,
    'computed',
    [],
    computeReliability('minimal', [], ['git']),
    [],
    ['git']
  );
}

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const gitPath = join(collectedDir, 'git.json');
  if (!existsSync(gitPath)) return skip();

  const artifact = JSON.parse(readFileSync(gitPath, 'utf8'));
  const raw = artifact?.raw;
  const turnover = raw?.code_turnover;
  if (
    !turnover ||
    typeof turnover !== 'object' ||
    typeof turnover.ratio !== 'number'
  ) {
    return skip();
  }

  const ratio: number = turnover.ratio;
  const reworked: number = turnover.reworked_lines ?? 0;
  const added: number = turnover.total_added ?? 0;
  const band = turnoverBand(ratio);
  const score = clamp01(
    bandScore(
      ratio,
      TURNOVER_ANCHORS as Array<{ x: number; y: number }>,
      'linear'
    )
  );

  const reliability = computeReliability('minimal', ['git'], []);
  const pct = (ratio * 100).toFixed(1);
  const expression = `${reworked}/${added} lines reworked within 21d = ${pct}% turnover (${band})`;

  return makeMetricResult(
    'adp_g6_churn',
    ratio,
    'computed',
    [601],
    reliability,
    ['git'],
    [],
    band,
    'ratio',
    expression,
    score,
    1.0
  );
}
