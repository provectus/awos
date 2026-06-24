/**
 * Tests for org_rollup — portfolio-level rollup from per-repo audit JSONs.
 *
 * Contracts verified:
 * - exactly 3 portfolio metrics are always returned
 * - metric ids are the canonical three (org_ai_tooling_coverage,
 *   org_capability_score, org_measurement_coverage)
 * - per_repo detail is preserved for all input repos
 * - tooling coverage is correctly computed (contributor-weighted)
 * - capability score = avg awarded_weight across repos
 * - measurement coverage reflects sources_reachable correctly
 * - contributor-weighted path activates when all repos supply contributors
 * - equal-weighted fallback when any repo is missing contributor count
 * - empty input returns 3 zero-value metrics and empty per_repo
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollup } from '../metrics/org_rollup.ts';
import type { PerRepoInput, OrgRollupResult } from '../metrics/org_rollup.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REPO_A: PerRepoInput = {
  repo: 'org/service-a',
  contributors: 10,
  awarded_weight: 40,
  sources_reachable: ['git', 'ci'],
  has_ai_tooling: true,
};

const REPO_B: PerRepoInput = {
  repo: 'org/service-b',
  contributors: 5,
  awarded_weight: 20,
  sources_reachable: ['git'],
  has_ai_tooling: false,
};

const REPO_NO_TOOLING_NO_SOURCES: PerRepoInput = {
  repo: 'org/legacy',
  contributors: 2,
  awarded_weight: 0,
  sources_reachable: [],
  has_ai_tooling: false,
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function metricValue(result: OrgRollupResult, id: string): number {
  const m = result.portfolio_metrics.find((p) => p.metric === id);
  assert.ok(m, `portfolio metric "${id}" not found`);
  return m.value;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('org_rollup: always returns exactly 3 portfolio metrics', () => {
  const result = rollup([REPO_A, REPO_B]);
  assert.equal(
    result.portfolio_metrics.length,
    3,
    'portfolio_metrics must contain exactly 3 entries (≤3 org metrics rule)'
  );
});

test('org_rollup: the three portfolio metric ids are canonical', () => {
  const result = rollup([REPO_A, REPO_B]);
  const ids = result.portfolio_metrics.map((m) => m.metric).sort();
  assert.deepEqual(
    ids,
    [
      'org_ai_tooling_coverage',
      'org_capability_score',
      'org_measurement_coverage',
    ].sort(),
    'portfolio metric ids must be the three canonical org metrics'
  );
});

test('org_rollup: per_repo preserves all input repos', () => {
  const result = rollup([REPO_A, REPO_B, REPO_NO_TOOLING_NO_SOURCES]);
  assert.equal(
    result.per_repo.length,
    3,
    'per_repo must contain one entry per input repo'
  );
  const names = result.per_repo.map((r) => r.repo).sort();
  assert.deepEqual(
    names,
    ['org/legacy', 'org/service-a', 'org/service-b'],
    'per_repo must preserve repo identifiers'
  );
});

test('org_rollup: org_ai_tooling_coverage — contributor-weighted fraction', () => {
  // REPO_A: has_ai_tooling=true, contributors=10
  // REPO_B: has_ai_tooling=false, contributors=5
  // Weighted: 10/(10+5) = 0.6667
  const result = rollup([REPO_A, REPO_B]);
  const coverage = metricValue(result, 'org_ai_tooling_coverage');
  assert.ok(
    Math.abs(coverage - 10 / 15) < 0.001,
    `org_ai_tooling_coverage must be ~${(10 / 15).toFixed(4)}, got ${coverage}`
  );
  const m = result.portfolio_metrics.find(
    (p) => p.metric === 'org_ai_tooling_coverage'
  )!;
  assert.equal(
    m.contributor_weighted,
    true,
    'contributor_weighted must be true when all repos supply contributors'
  );
});

test('org_rollup: org_capability_score — average awarded_weight across repos', () => {
  // REPO_A: 40, REPO_B: 20 → avg = 30
  const result = rollup([REPO_A, REPO_B]);
  const score = metricValue(result, 'org_capability_score');
  assert.ok(
    Math.abs(score - 30) < 0.001,
    `org_capability_score must be 30, got ${score}`
  );
});

test('org_rollup: org_measurement_coverage — contributor-weighted reachable fraction', () => {
  // REPO_A: reachable (sources_reachable.length>0), contributors=10
  // REPO_B: reachable, contributors=5
  // REPO_NO_TOOLING_NO_SOURCES: not reachable, contributors=2
  // Weighted: (10+5)/(10+5+2) = 15/17 ≈ 0.8824
  const result = rollup([REPO_A, REPO_B, REPO_NO_TOOLING_NO_SOURCES]);
  const coverage = metricValue(result, 'org_measurement_coverage');
  assert.ok(
    Math.abs(coverage - 15 / 17) < 0.001,
    `org_measurement_coverage must be ~${(15 / 17).toFixed(4)}, got ${coverage}`
  );
});

test('org_rollup: equal-weighted fallback when contributors unavailable', () => {
  const repoX: PerRepoInput = {
    repo: 'org/x',
    // no contributors field
    awarded_weight: 10,
    sources_reachable: ['git'],
    has_ai_tooling: true,
  };
  const repoY: PerRepoInput = {
    repo: 'org/y',
    contributors: 5,
    awarded_weight: 30,
    sources_reachable: [],
    has_ai_tooling: false,
  };
  const result = rollup([repoX, repoY]);
  // repoX has no contributors → equal weighting (each repo = weight 1)
  const m = result.portfolio_metrics.find(
    (p) => p.metric === 'org_ai_tooling_coverage'
  )!;
  assert.equal(
    m.contributor_weighted,
    false,
    'contributor_weighted must be false when any repo is missing a contributor count'
  );
  // Equal-weighted: 1 of 2 repos has tooling → 0.5
  assert.ok(
    Math.abs(m.value - 0.5) < 0.001,
    `equal-weighted tooling coverage must be 0.5, got ${m.value}`
  );
});

test('org_rollup: empty input returns 3 zero-value metrics and empty per_repo', () => {
  const result = rollup([]);
  assert.equal(
    result.portfolio_metrics.length,
    3,
    'must still return 3 portfolio metrics for empty input'
  );
  for (const m of result.portfolio_metrics) {
    assert.equal(m.value, 0, `${m.metric} value must be 0 for empty input`);
  }
  assert.deepEqual(
    result.per_repo,
    [],
    'per_repo must be empty for empty input'
  );
});

test('org_rollup: single repo with full tooling and all sources', () => {
  const single: PerRepoInput = {
    repo: 'org/single',
    contributors: 3,
    awarded_weight: 75,
    sources_reachable: ['git', 'ci', 'tracker', 'docs'],
    has_ai_tooling: true,
  };
  const result = rollup([single]);
  assert.equal(
    metricValue(result, 'org_ai_tooling_coverage'),
    1,
    'single repo with tooling → 100% tooling coverage'
  );
  assert.equal(
    metricValue(result, 'org_capability_score'),
    75,
    'single repo → capability score equals its awarded_weight'
  );
  assert.equal(
    metricValue(result, 'org_measurement_coverage'),
    1,
    'single repo with reachable sources → 100% measurement coverage'
  );
});

test('org_rollup: repos_counted field reflects input size', () => {
  const result = rollup([REPO_A, REPO_B, REPO_NO_TOOLING_NO_SOURCES]);
  for (const m of result.portfolio_metrics) {
    assert.equal(
      m.repos_counted,
      3,
      `${m.metric}.repos_counted must equal the number of input repos`
    );
  }
});
