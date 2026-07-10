/**
 * pipeline_duration — Average pipeline duration trend.
 *
 * kind: "duration_seconds"
 * value: average duration in seconds (number)
 * band: null (no label; the score is banded via the curve in standards.toml)
 * score: banded on the average duration via the curve declared in
 *   standards.toml [category.pipeline_duration_trend.scoring].
 * SKIP (with reason) when runs exist but none carries duration_seconds.
 * categories_awarded: [1002] when topology.has_ci is true and data available
 * reliability_default: "not-reliable"
 *
 * Source rules (mirrors ci_pass_rate):
 *   - available=false (no CI config, no connector) → SKIP (sources_used=[])
 *   - available=false (config detected, no run history) → SKIP (collector sets available=false for config-only)
 *   - available=true, runs present → OK + HIGH reliability, compute avg duration
 *
 * Each run record is expected to have: duration_seconds (number).
 * Runs missing duration_seconds are excluded from the average, and so are
 * runs without a pass/fail verdict (see _ci_runs.ts): a skipped trigger run
 * finishes in ~1 s without building anything — averaging it in once made a
 * repo's pipeline look 10× faster than its real (decided) runs.
 *
 * Source shape: collectedDir/ci.json
 * Input raw fields: config_detected (bool), runs (array of run records)
 */
import {
  awardCategories,
  clampToWindow,
  computeReliability,
  loadArtifactOrSkip,
  lookbackDays,
  makeMetricResult,
  plural,
  windowDropNote,
  type MetricResult,
} from './_base.ts';
import { describeExcluded, partitionRuns, runTimestamp } from './_ci_runs.ts';
import { scoreFromConfig, scoringFor } from './_score.ts';

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
  // available=false covers no CI config, no connector, and config-only with no
  // run history — the collector sets available=false for each.
  const loaded = loadArtifactOrSkip(collectedDir, 'ci', {
    metric: 'pipeline_duration',
    kind: 'duration_seconds',
    tag: 'not-reliable',
  });
  if ('skip' in loaded) return loaded.skip;

  const raw = loaded.raw;
  const runs: unknown[] = Array.isArray(raw.runs) ? raw.runs : [];

  // Clamp the fetched history to the audit window (anchored to the newest
  // run) — connectors over-fetch, and runs older than [meta].max_lookback_days
  // must not shape the average duration.
  const windowDays = lookbackDays(standards);
  const windowed = clampToWindow(runs, windowDays, runTimestamp);

  // Average over DECIDED runs only (see _ci_runs.ts) — a skipped trigger
  // run's ~1 s "duration" measures nothing. null when no decided run carries
  // a usable duration_seconds → SKIP with the reason (never a free 1.0 score).
  const partition = partitionRuns(windowed.kept);
  const avgDuration = averageDuration(partition.decided);
  if (avgDuration === null) {
    const excludedNote =
      partition.total > partition.decided.length
        ? ` (${describeExcluded(partition)} excluded — no verdict)`
        : '';
    return makeMetricResult(
      'pipeline_duration',
      null,
      'duration_seconds',
      [],
      {
        tag: 'not-reliable',
        confidence: 'LOW',
        note: `${runs.length} CI ${plural(runs.length, 'run')} present but no decided run carries duration_seconds — cannot compute pipeline duration${excludedNote}`,
      },
      [],
      ['ci']
    );
  }

  const categories = awardCategories(standards, 'pipeline_duration', topology);
  const reliability = computeReliability('not-reliable', ['ci'], []);

  // Score from the average duration via the declared curve
  // (standards.toml [category.pipeline_duration_trend.scoring]).
  const scoring = scoringFor(standards, 'pipeline_duration_trend');
  const score = scoreFromConfig(avgDuration, scoring);

  const excludedTotal = partition.total - partition.decided.length;
  const expression =
    `avg pipeline duration ${avgDuration.toFixed(0)}s across ${partition.decided.length} decided ${plural(partition.decided.length, 'run')}` +
    (excludedTotal > 0
      ? ` (${excludedTotal} without a verdict excluded)`
      : '') +
    windowDropNote(windowed.dropped, windowDays);
  return makeMetricResult(
    'pipeline_duration',
    avgDuration,
    'duration_seconds',
    categories,
    reliability,
    ['ci'],
    [],
    { expression, score, confidence: 1.0 }
  );
}
