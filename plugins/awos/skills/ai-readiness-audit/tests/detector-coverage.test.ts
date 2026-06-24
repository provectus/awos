/**
 * detector-coverage.test.ts
 *
 * Ensures every category in standards.toml whose `dimension` is one of the 10
 * scored audit dimensions AND whose `method` is "detected" or "computed" has a
 * corresponding entry in the merged DETECTORS map exported from cli.ts.
 *
 * The test intentionally excludes `dimension = "ai-sdlc-adoption"` because
 * those `computed` ADP categories are metrics, not file-system detectors.
 *
 * RED state: fails for codes 2700-2703 before they are added.
 * GREEN state: passes after detectLinting/detectFormatting/detectTypeSafety/
 *              detectCiCd are wired into the DETECTORS map.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStandards } from './helpers.ts';
import { DETECTORS } from '../cli.ts';

// The scored audit dimensions (project-topology is unscored, excluded).
const AUDIT_DIMENSIONS = new Set([
  'ai-development-tooling',
  'application-security',
  'code-architecture',
  'documentation',
  'end-to-end-delivery',
  'prompt-agent-integrity',
  'quality-assurance',
  'security',
  'software-best-practices',
  'spec-driven-development',
  'supply-chain-security',
]);

test('every detected/computed audit category has a detector in the merged DETECTORS map', () => {
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
    if (!(cat.code in DETECTORS)) {
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
      `are missing from the merged DETECTORS map:`,
      ...missing.map(
        (m) =>
          `  code=${m.code} metric=${m.metric} dimension=${m.dimension} method=${m.method} (slug: ${m.slug})`
      ),
    ].join('\n')
  );
});
