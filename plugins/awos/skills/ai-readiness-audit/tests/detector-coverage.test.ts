/**
 * detector-coverage.test.ts
 *
 * Ensures every category in standards.toml whose `dimension` is one of the 10
 * scored audit dimensions AND whose `method` is "detected" or "computed" can be
 * evaluated by audit-core — i.e. it is either a file-system detector (in the
 * merged DETECTORS map) OR a registered AST/connector metric (in METRICS).
 * audit-core routes a category to its metric whenever no detector owns the code,
 * so both forms of coverage are valid (e.g. DOC-05/06 doc-coverage are async AST
 * metrics, not synchronous detectors).
 *
 * The test intentionally excludes `dimension = "ai-sdlc-adoption"` because
 * those `computed` ADP categories are metrics, not file-system detectors.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStandards } from './helpers.ts';
import { DETECTORS, METRICS } from '../cli.ts';

// The scored audit dimensions (project-topology is unscored, excluded).
const AUDIT_DIMENSIONS = new Set([
  'ai-development-tooling',
  'ai-security',
  'application-security',
  'code-architecture',
  'documentation',
  'prevention-coverage',
  'quality-assurance',
  'software-best-practices',
  'spec-driven-development',
  'supply-chain-security',
]);

test('every detected/computed audit category is evaluable (a detector OR a registered metric)', () => {
  const standards = loadStandards();
  const categories = standards.category as Record<string, any>;

  const missing: Array<{
    slug: string;
    code: number;
    metric: string;
    dimension: string;
    method: string;
  }> = [];

  for (const [slug, cat] of Object.entries(categories)) {
    if (!AUDIT_DIMENSIONS.has(cat.dimension)) continue;
    if (cat.method !== 'detected' && cat.method !== 'computed') continue;
    const hasDetector = cat.code in DETECTORS;
    const hasMetric = typeof cat.metric === 'string' && cat.metric in METRICS;
    if (!hasDetector && !hasMetric) {
      missing.push({
        slug,
        code: cat.code,
        metric: cat.metric,
        dimension: cat.dimension,
        method: cat.method,
      });
    }
  }

  assert.deepEqual(
    missing,
    [],
    [
      `${missing.length} audit categor${missing.length === 1 ? 'y' : 'ies'} with method=detected/computed`,
      `cannot be evaluated — neither a detector (DETECTORS) nor a registered metric (METRICS):`,
      ...missing.map(
        (m) =>
          `  code=${m.code} metric=${m.metric} dimension=${m.dimension} method=${m.method} (slug: ${m.slug})`
      ),
    ].join('\n')
  );
});
