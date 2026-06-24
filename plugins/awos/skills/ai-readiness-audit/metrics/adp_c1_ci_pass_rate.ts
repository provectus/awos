/**
 * adp_c1_ci_pass_rate — Default-branch CI pass rate.
 *
 * kind: "banded"
 * value: fraction of successful runs (0–1), or null when no run data
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
 * Partial-source rule (critical):
 *   - available=false (no CI config, no connector) → SKIP (sources_used=[])
 *   - available=true, config_detected=true, runs=[] → OK + MED reliability + note
 *     (config is evidence CI exists; no run data to compute a rate, value=null, no band)
 *   - available=true, runs present → OK + HIGH reliability, compute rate + band
 *
 * Source shape: collectedDir/ci.json
 * Input raw fields: config_detected (bool), runs (array of run records)
 * Each run record is expected to have: conclusion (string, e.g. "success"|"failure")
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  awardCategories,
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';

/** Map pass-rate fraction to a band label. */
function ciPassBand(rate: number): string {
  if (rate >= 0.99) return 'elite';
  if (rate >= 0.95) return 'high';
  if (rate >= 0.9) return 'medium';
  return 'low';
}

/** Count successful runs. A run is successful when its conclusion is "success". */
function countSuccessful(runs: unknown[]): number {
  return runs.filter((r) => {
    const rec = r as Record<string, unknown>;
    return rec['conclusion'] === 'success';
  }).length;
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
      'adp_c1_ci_pass_rate',
      null,
      'banded',
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
      'adp_c1_ci_pass_rate',
      null,
      'banded',
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
      'adp_c1_ci_pass_rate',
      topology
    );
    const reliability = computeReliability('not-reliable', ['ci'], []);
    // Downgrade to MED: we have a source but it carries no run records.
    const partialReliability = {
      tag: reliability.tag,
      confidence: 'MED' as const,
      note: configDetected
        ? 'CI config detected but no run data available; pass rate cannot be computed'
        : 'CI source available but no run data available; pass rate cannot be computed',
    };
    return makeMetricResult(
      'adp_c1_ci_pass_rate',
      null,
      'banded',
      categories,
      partialReliability,
      ['ci'],
      []
    );
  }

  // Full case: compute pass rate from run records.
  const successful = countSuccessful(runs);
  const rate = successful / runs.length;
  const band = ciPassBand(rate);
  const categories = awardCategories(
    standards,
    'adp_c1_ci_pass_rate',
    topology
  );
  const reliability = computeReliability('not-reliable', ['ci'], []);

  return makeMetricResult(
    'adp_c1_ci_pass_rate',
    rate,
    'banded',
    categories,
    reliability,
    ['ci'],
    [],
    band
  );
}
