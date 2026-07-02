/**
 * adp_c2_pipeline_duration — Average pipeline duration trend.
 *
 * kind: "duration_seconds"
 * value: average duration in seconds (number)
 * band: null (no label; the score is banded via DURATION_ANCHORS)
 * score: log-interp over DURATION_ANCHORS — ≤10 min → 1.0 down to ≥2 h → 0.
 * SKIP (with reason) when runs exist but none carries duration_seconds.
 * categories_awarded: [1002] when topology.has_ci is true and data available
 * reliability_default: "not-reliable"
 *
 * Source rules (mirrors adp_c1_ci_pass_rate):
 *   - available=false (no CI config, no connector) → SKIP (sources_used=[])
 *   - available=false (config detected, no run history) → SKIP (collector sets available=false for config-only)
 *   - available=true, runs present → OK + HIGH reliability, compute avg duration
 *
 * Each run record is expected to have: duration_seconds (number).
 * Runs missing duration_seconds are excluded from the average.
 *
 * Source shape: collectedDir/ci.json
 * Input raw fields: config_detected (bool), runs (array of run records)
 */
import {
  awardCategories,
  computeReliability,
  makeMetricResult,
  readArtifact,
  skipReliability,
  type MetricResult,
} from './_base.ts';
import { bandScore, clamp01 } from './_score.ts';

/**
 * Duration→score anchors in seconds (log-interp, like the other duration
 * metrics — pipeline time spans orders of magnitude). AWOS heuristics:
 *   ≤600 s (10 min) → 1.0   (tight inner loop)
 *   1800 s (30 min) → 0.7
 *   3600 s (1 h)    → 0.4
 *   ≥7200 s (2 h)   → 0.0   (worst case: feedback arrives hours later)
 */
const DURATION_ANCHORS = [
  { x: 600, y: 1.0 },
  { x: 1800, y: 0.7 },
  { x: 3600, y: 0.4 },
  { x: 7200, y: 0.0 },
];

/** Compute average duration_seconds from an array of run records. */
function averageDuration(runs: unknown[]): number | null {
  const durations = runs
    .map((r) => {
      const rec = r as Record<string, unknown>;
      const d = rec['duration_seconds'];
      return typeof d === 'number' && isFinite(d) ? d : null;
    })
    .filter((d): d is number => d !== null);
  if (durations.length === 0) return null;
  return durations.reduce((sum, d) => sum + d, 0) / durations.length;
}

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>
): MetricResult {
  const read = readArtifact(collectedDir, 'ci');

  // CI source absent entirely → SKIP.
  if ('error' in read) {
    return makeMetricResult(
      'adp_c2_pipeline_duration',
      null,
      'duration_seconds',
      [],
      skipReliability('not-reliable', 'ci', read.error),
      [],
      ['ci']
    );
  }

  const artifact = read.artifact;

  // available=false: collector found no CI config, no connector, or config-only with no run history.
  if (!artifact?.available) {
    return makeMetricResult(
      'adp_c2_pipeline_duration',
      null,
      'duration_seconds',
      [],
      computeReliability('not-reliable', [], ['ci']),
      [],
      ['ci']
    );
  }

  const raw = artifact?.raw ?? {};
  const runs: unknown[] = Array.isArray(raw.runs) ? raw.runs : [];

  // Compute average duration from run records. null when no run carries a
  // usable duration_seconds → SKIP with the reason (never a free 1.0 score).
  const avgDuration = averageDuration(runs);
  if (avgDuration === null) {
    return makeMetricResult(
      'adp_c2_pipeline_duration',
      null,
      'duration_seconds',
      [],
      {
        tag: 'not-reliable',
        confidence: 'LOW',
        note: `${runs.length} CI run${runs.length !== 1 ? 's' : ''} present but none carries duration_seconds — cannot compute pipeline duration`,
      },
      [],
      ['ci']
    );
  }

  const categories = awardCategories(
    standards,
    'adp_c2_pipeline_duration',
    topology
  );
  const reliability = computeReliability('not-reliable', ['ci'], []);

  // Score from the average duration (see DURATION_ANCHORS): a ≤10-minute
  // pipeline keeps the inner loop tight (1.0); ≥2 h is worst case (0).
  const score = clamp01(bandScore(avgDuration, DURATION_ANCHORS, 'log'));

  const expression = `avg pipeline duration ${avgDuration.toFixed(0)}s across ${runs.length} run${runs.length !== 1 ? 's' : ''}`;
  return makeMetricResult(
    'adp_c2_pipeline_duration',
    avgDuration,
    'duration_seconds',
    categories,
    reliability,
    ['ci'],
    [],
    null,
    undefined,
    expression,
    score,
    1.0
  );
}
