/**
 * adp_c2_pipeline_duration — Average pipeline duration trend.
 *
 * kind: "duration_seconds"
 * value: average duration in seconds (number), or null when no run data
 * band: null (this metric is not banded; raw duration is reported)
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
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  awardCategories,
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';

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
  const ciPath = join(collectedDir, 'ci.json');

  // CI source absent entirely → SKIP.
  if (!existsSync(ciPath)) {
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

  const artifact = JSON.parse(readFileSync(ciPath, 'utf8'));

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

  // available=true guarantees runs.length > 0 (collector contract).
  // Compute average duration from run records.
  const avgDuration = averageDuration(runs);
  const categories = awardCategories(
    standards,
    'adp_c2_pipeline_duration',
    topology
  );
  const reliability = computeReliability('not-reliable', ['ci'], []);

  const expression = `avg pipeline duration ${avgDuration !== null ? avgDuration.toFixed(0) + 's' : 'unknown'} across ${runs.length} run${runs.length !== 1 ? 's' : ''}`;
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
    undefined,
    expression,
    1.0,
    1.0
  );
}
