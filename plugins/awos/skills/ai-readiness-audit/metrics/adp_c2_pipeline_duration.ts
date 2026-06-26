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

  // available=false means the collector found no CI config and no connector.
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
  const configDetected: boolean = Boolean(raw.config_detected);

  // Partial case: CI config present but no run data.
  // Return OK (source is available) with downgraded reliability (MED).
  if (runs.length === 0) {
    const categories = awardCategories(
      standards,
      'adp_c2_pipeline_duration',
      topology
    );
    const partialReliability = {
      tag: 'not-reliable',
      confidence: 'MED' as const,
      note: configDetected
        ? 'CI config detected but no run data available; pipeline duration cannot be computed'
        : 'CI source available but no run data available; pipeline duration cannot be computed',
    };
    return makeMetricResult(
      'adp_c2_pipeline_duration',
      null,
      'duration_seconds',
      categories,
      partialReliability,
      ['ci'],
      []
    );
  }

  // Full case: compute average duration from run records.
  const avgDuration = averageDuration(runs);
  const categories = awardCategories(
    standards,
    'adp_c2_pipeline_duration',
    topology
  );
  const reliability = computeReliability('not-reliable', ['ci'], []);

  return makeMetricResult(
    'adp_c2_pipeline_duration',
    avgDuration,
    'duration_seconds',
    categories,
    reliability,
    ['ci'],
    []
  );
}
