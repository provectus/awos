/**
 * issue_throughput — Issue/ticket throughput per month.
 *
 * kind: "rate"
 * value: resolved_count (total tickets resolved during the collected period), or null
 * band: null (raw count is reported; no universal banding applies across team sizes)
 * categories_awarded: [1102] when topology.has_tracker is true and data available
 * reliability_default: "not-reliable"
 *
 * Computation: read resolved_count from tracker.json raw directly.
 * The collector pre-computes resolved_count as the count of tickets whose
 * status is "done" or that have a resolved_at timestamp.
 *
 * Source shape: collectedDir/tracker.json
 * Input raw fields: resolved_count (number); period.lookback_days (number, optional)
 *
 * score: 0 when resolved_count === 0 (worst case); otherwise banded by
 * resolved-per-week over the artifact's period.lookback_days window
 * (default 90 days) via the curve declared in
 * standards.toml [category.issue_throughput.scoring].
 *
 * SKIP: if tracker.json is absent or available=false (no tracker connector).
 */
import {
  appendReliabilityNote,
  awardCategories,
  computeReliability,
  loadArtifactOrSkip,
  makeMetricResult,
  trackerFetchNote,
  type MetricResult,
} from './_base.ts';
import { scoreFromConfig, scoringFor } from './_score.ts';

/** Default tracker lookback (days) when the artifact carries no period block. */
const DEFAULT_LOOKBACK_DAYS = 90;

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>
): MetricResult {
  const loaded = loadArtifactOrSkip(collectedDir, 'tracker', {
    metric: 'issue_throughput',
    kind: 'rate',
    tag: 'not-reliable',
  });
  if ('skip' in loaded) return loaded.skip;

  const { raw, artifact } = loaded;
  const resolvedCount: number =
    typeof raw.resolved_count === 'number' ? raw.resolved_count : 0;

  const categories = awardCategories(standards, 'issue_throughput', topology);
  // Surface a partial tracker fetch (fetch_meta) — a truncated fetch
  // undercounts resolved tickets, so the note must say so.
  const reliability = appendReliabilityNote(
    computeReliability('not-reliable', ['tracker'], []),
    trackerFetchNote(raw)
  );

  // Normalise the count to a per-week rate over the collected window so the
  // score does not depend on how long a window the connector fetched.
  const lookbackDays: number =
    typeof artifact?.period?.lookback_days === 'number' &&
    artifact.period.lookback_days > 0
      ? artifact.period.lookback_days
      : DEFAULT_LOOKBACK_DAYS;
  const resolvedPerWeek = resolvedCount / (lookbackDays / 7);

  // Worst case (nothing resolved in the whole window) scores 0; anything else
  // is banded by resolved-per-week via the declared curve
  // (standards.toml [category.issue_throughput.scoring]).
  const score =
    resolvedCount === 0
      ? 0
      : scoreFromConfig(
          resolvedPerWeek,
          scoringFor(standards, 'issue_throughput')
        );

  const expression = `${resolvedCount} tickets resolved in ${lookbackDays}d ≈ ${resolvedPerWeek.toFixed(1)}/week`;
  return makeMetricResult(
    'issue_throughput',
    resolvedCount,
    'rate',
    categories,
    reliability,
    ['tracker'],
    [],
    { expression, score, confidence: 1.0 }
  );
}
