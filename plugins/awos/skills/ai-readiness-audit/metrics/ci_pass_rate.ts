/**
 * ci_pass_rate — Default-branch CI pass rate.
 *
 * kind: "banded"
 * value: fraction of DECIDED runs that passed (0–1), or null when no run data.
 *   Decided = passed + failed (see _ci_runs.ts): skipped/cancelled/pending
 *   runs never reached a verdict on the code, so they belong in neither the
 *   numerator nor the denominator — counting them as failures once reported
 *   7.6% "low" for a repo whose decided runs pass at 86%. Excluded runs are
 *   disclosed in the expression; unknown conclusion vocab is called out.
 * band: "elite" | "high" | "medium" | "low" per standards.toml band.ci_pass_rate
 * categories_awarded: [1001] when topology.has_ci is true and data available
 * reliability_default: "not-reliable"
 *
 * Band thresholds (ci_pass_rate in standards.toml):
 *   elite  → >= 99%  (rate >= 0.99)
 *   high   → >= 95%  (rate >= 0.95)
 *   medium → >= 90%  (rate >= 0.90)
 *   low    → < 90%   (rate < 0.90)
 *
 * Source rules:
 *   - available=false (no CI config, no connector) → SKIP (sources_used=[])
 *   - available=false (config detected, no run history) → SKIP (collector sets available=false for config-only)
 *   - available=true, runs present → OK + HIGH reliability, compute rate + band
 *
 * Source shape: collectedDir/ci.json
 * Input raw fields: config_detected (bool), runs (array of run records)
 * Each run record is expected to have: conclusion (string, e.g. "success"|"failure")
 */
import {
  awardCategories,
  clampToWindow,
  computeReliability,
  lookbackDays,
  makeMetricResult,
  readArtifact,
  skipMetric,
  type MetricResult,
} from './_base.ts';
import { describeExcluded, partitionRuns, runTimestamp } from './_ci_runs.ts';
import { scoreFromConfig, scoringFor } from './_score.ts';

/** Map pass-rate fraction to a band label. */
function ciPassBand(rate: number): string {
  if (rate >= 0.99) return 'elite';
  if (rate >= 0.95) return 'high';
  if (rate >= 0.9) return 'medium';
  return 'low';
}

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>
): MetricResult {
  const read = readArtifact(collectedDir, 'ci');

  // CI source absent entirely → SKIP.
  if ('error' in read) {
    return skipMetric(
      'ci_pass_rate',
      'banded',
      'not-reliable',
      'ci',
      read.error
    );
  }

  const artifact = read.artifact;

  // available=false: collector found no CI config, no connector, or config-only with no run history.
  if (!artifact?.available) {
    return skipMetric('ci_pass_rate', 'banded', 'not-reliable', 'ci');
  }

  const raw = artifact?.raw ?? {};
  const runs: unknown[] = Array.isArray(raw.runs) ? raw.runs : [];

  // The collector normally guarantees runs.length > 0 when available=true,
  // but a hand-built connector artifact can violate that; an empty runs array
  // would make the rate 0/0 = NaN and poison audit_total → SKIP with reason.
  if (runs.length === 0) {
    return makeMetricResult(
      'ci_pass_rate',
      null,
      'banded',
      [],
      {
        tag: 'not-reliable',
        confidence: 'LOW',
        note: 'ci.json is available but has no run records — cannot compute a pass rate',
      },
      [],
      ['ci']
    );
  }

  // Clamp the fetched history to the audit window (anchored to the newest
  // run) — connectors over-fetch, and runs older than [meta].max_lookback_days
  // must not shape the pass rate.
  const windowDays = lookbackDays(standards);
  const windowed = clampToWindow(runs, windowDays, runTimestamp);

  // Pass rate over DECIDED runs only (see _ci_runs.ts).
  const partition = partitionRuns(windowed.kept);
  if (partition.decided.length === 0) {
    return makeMetricResult(
      'ci_pass_rate',
      null,
      'banded',
      [],
      {
        tag: 'not-reliable',
        confidence: 'LOW',
        note:
          `${partition.total} CI runs fetched but none reached a pass/fail verdict ` +
          `(${describeExcluded(partition)}) — widen the run fetch or exclude ` +
          `trigger-style workflows so decided runs land in the sample`,
      },
      [],
      ['ci']
    );
  }

  const rate = partition.passed / partition.decided.length;
  const band = ciPassBand(rate);
  const categories = awardCategories(standards, 'ci_pass_rate', topology);
  const reliability = computeReliability('not-reliable', ['ci'], []);
  // Score curve lives in standards.toml [category.ci_pass_rate.scoring].
  const scoring = scoringFor(standards, 'ci_pass_rate');

  const excludedTotal = partition.total - partition.decided.length;
  const excludedNote =
    excludedTotal > 0
      ? `; ${excludedTotal} run${excludedTotal !== 1 ? 's' : ''} without a verdict excluded: ${describeExcluded(partition)}`
      : '';
  const unknownNote =
    partition.unknown.length > 0
      ? ` (unrecognized conclusions treated as no-verdict: ${partition.unknown.join(', ')})`
      : '';
  const windowNote =
    windowed.dropped > 0
      ? `; ${windowed.dropped} run${windowed.dropped !== 1 ? 's' : ''} older than the ${windowDays}-day window dropped`
      : '';
  const expression = `${partition.passed}/${partition.decided.length} decided CI runs passed = ${(rate * 100).toFixed(1)}% pass rate (${band})${excludedNote}${unknownNote}${windowNote}`;
  return makeMetricResult(
    'ci_pass_rate',
    rate,
    'banded',
    categories,
    reliability,
    ['ci'],
    [],
    { band, expression, score: scoreFromConfig(rate, scoring), confidence: 1.0 }
  );
}
