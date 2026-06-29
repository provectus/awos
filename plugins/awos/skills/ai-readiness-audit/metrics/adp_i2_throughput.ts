/**
 * adp_i2_throughput — Issue/ticket throughput per month.
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
 * Input raw fields: resolved_count (number)
 *
 * SKIP: if tracker.json is absent or available=false (no tracker connector).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  awardCategories,
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>
): MetricResult {
  const trackerPath = join(collectedDir, 'tracker.json');

  // Tracker source file absent → SKIP.
  if (!existsSync(trackerPath)) {
    return makeMetricResult(
      'adp_i2_throughput',
      null,
      'rate',
      [],
      computeReliability('not-reliable', [], ['tracker']),
      [],
      ['tracker']
    );
  }

  const artifact = JSON.parse(readFileSync(trackerPath, 'utf8'));

  // available=false means no tracker connector was provided.
  if (!artifact?.available) {
    return makeMetricResult(
      'adp_i2_throughput',
      null,
      'rate',
      [],
      computeReliability('not-reliable', [], ['tracker']),
      [],
      ['tracker']
    );
  }

  const raw = artifact?.raw ?? {};
  const resolvedCount: number =
    typeof raw.resolved_count === 'number' ? raw.resolved_count : 0;

  const categories = awardCategories(standards, 'adp_i2_throughput', topology);
  const reliability = computeReliability('not-reliable', ['tracker'], []);

  const expression = `${resolvedCount} tickets resolved`;
  return makeMetricResult(
    'adp_i2_throughput',
    resolvedCount,
    'rate',
    categories,
    reliability,
    ['tracker'],
    [],
    null,
    undefined,
    undefined,
    expression,
    1.0,
    1.0
  );
}
