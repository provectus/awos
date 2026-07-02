/**
 * adp_i1_work_mix — Team work-mix allocation across issue types.
 *
 * kind: "banded"
 * value: fraction of Growth/Feature tickets out of total (0–1), or null when no tickets
 * band: one of "elite" | "high" | "medium" | "low" per standards.toml band.work_mix
 * categories_awarded: [1101] when topology.has_tracker is true and data available
 * reliability_default: "not-reliable"
 *
 * Band thresholds (work_mix in standards.toml):
 *   elite  → Growth >= 60%  (growth_frac >= 0.60)
 *   high   → Growth >= 45%  (growth_frac >= 0.45)
 *   medium → Growth >= 30%  (growth_frac >= 0.30)
 *   low    → Growth < 30%   (growth_frac < 0.30)
 *
 * Growth/Feature tickets are identified by type names matching:
 *   feature, story, enhancement, task (case-insensitive)
 * KTLO/maintenance: bug, incident, maintenance, chore, support (case-insensitive)
 * Unknown types are bucketed as "other" and excluded from growth fraction.
 *
 * Computation: growth_count / total_count
 *
 * Source shape: collectedDir/tracker.json
 * Input raw fields: type_counts (Record<string,number>)
 *
 * SKIP: if tracker.json is absent or available=false (no tracker connector).
 */
import {
  awardCategories,
  computeReliability,
  makeMetricResult,
  readArtifact,
  skipReliability,
  type MetricResult,
} from './_base.ts';
import { clamp01 } from './_score.ts';

const GROWTH_TYPES = new Set([
  'feature',
  'story',
  'enhancement',
  'task',
  'improvement',
]);

/** Map growth fraction to a work-mix band label. */
function workMixBand(growthFrac: number): string {
  if (growthFrac >= 0.6) return 'elite';
  if (growthFrac >= 0.45) return 'high';
  if (growthFrac >= 0.3) return 'medium';
  return 'low';
}

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>
): MetricResult {
  // Tracker source absent or unreadable → SKIP with the reason in the note.
  const read = readArtifact(collectedDir, 'tracker');
  if ('error' in read) {
    return makeMetricResult(
      'adp_i1_work_mix',
      null,
      'banded',
      [],
      skipReliability('not-reliable', 'tracker', read.error),
      [],
      ['tracker']
    );
  }
  const artifact = read.artifact;

  // available=false means no tracker connector was provided.
  if (!artifact?.available) {
    return makeMetricResult(
      'adp_i1_work_mix',
      null,
      'banded',
      [],
      computeReliability('not-reliable', [], ['tracker']),
      [],
      ['tracker']
    );
  }

  const raw = artifact?.raw ?? {};
  const typeCounts: Record<string, number> =
    typeof raw.type_counts === 'object' && raw.type_counts !== null
      ? (raw.type_counts as Record<string, number>)
      : {};

  const total = Object.values(typeCounts).reduce(
    (sum, n) => sum + (n as number),
    0
  );

  // No ticket data → OK with null value (meaningful signal: empty tracker).
  // score=0: an empty / all-unknown-type tracker has 0 growth fraction.
  if (total === 0) {
    const categories = awardCategories(standards, 'adp_i1_work_mix', topology);
    const reliability = computeReliability('not-reliable', ['tracker'], []);
    return makeMetricResult(
      'adp_i1_work_mix',
      null,
      'banded',
      categories,
      reliability,
      ['tracker'],
      [],
      null,
      undefined,
      undefined,
      0,
      1.0
    );
  }

  const growthCount = Object.entries(typeCounts)
    .filter(([type]) => GROWTH_TYPES.has(type.toLowerCase()))
    .reduce((sum, [, n]) => sum + n, 0);

  const growthFrac = growthCount / total;
  const band = workMixBand(growthFrac);
  const categories = awardCategories(standards, 'adp_i1_work_mix', topology);
  const reliability = computeReliability('not-reliable', ['tracker'], []);

  const expression = `${growthCount}/${total} growth tickets = ${growthFrac.toFixed(2)}`;
  return makeMetricResult(
    'adp_i1_work_mix',
    growthFrac,
    'banded',
    categories,
    reliability,
    ['tracker'],
    [],
    band,
    undefined,
    expression,
    clamp01(growthFrac / 0.6),
    1.0
  );
}
