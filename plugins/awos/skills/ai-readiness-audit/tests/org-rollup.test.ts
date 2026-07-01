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

// ---------------------------------------------------------------------------
// Task 5.2 — org headline (average matrix) + enriched per_repo rows
// ---------------------------------------------------------------------------

/**
 * Two repos carrying the full rich delivery slice. Values are chosen so each
 * per-metric MEAN lands unambiguously inside one DORA band:
 *   merges   (4+2)/2   = 3       → "3 / contributor"      (no band)
 *   loc      (200+100)/2 = 150   → "150 / contributor"    (no band)
 *   deploy   (8+6)/2    = 7      → elite  (>=7)            "7 / wk"
 *   rework   (0.10+0.20)/2 = 0.15 → watch  (>=0.15,<0.30) "15%"
 *   lead     (12+36)/2  = 24     → high   (>=24,<168)     "24 h"
 *   change   (0.04+0.06)/2 = 0.05 → high  (>=0.05,<0.10)  "5%"
 *   cycle    (20+28)/2  = 24     → high   (>=24,<168)     "24 h"
 *   mttr     (0.5+1.5)/2 = 1.0   → high   (>=1,<24)       "1 h"
 */
const RICH_1: PerRepoInput = {
  repo: 'org/rich-1',
  contributors: 8,
  awarded_weight: 50,
  sources_reachable: ['git', 'ci'],
  has_ai_tooling: true,
  audit_total: 50,
  coverage: 0.5,
  delivery: {
    merges_per_active: 4,
    loc_per_active: 200,
    deploy_freq: 8,
    rework_rate: 0.1,
    lead_time: 12,
    change_fail: 0.04,
    cycle_time: 20,
    mttr: 0.5,
  },
};

const RICH_2: PerRepoInput = {
  repo: 'org/rich-2',
  contributors: 4,
  awarded_weight: 30,
  sources_reachable: ['git'],
  has_ai_tooling: false,
  audit_total: 30,
  coverage: 0.3,
  delivery: {
    merges_per_active: 2,
    loc_per_active: 100,
    deploy_freq: 6,
    rework_rate: 0.2,
    lead_time: 36,
    change_fail: 0.06,
    cycle_time: 28,
    mttr: 1.5,
  },
};

function deliveryRow(result: OrgRollupResult, label: string) {
  const rows = result.headline?.delivery ?? [];
  const d = rows.find((x) => x.label === label);
  assert.ok(d, `headline.delivery row "${label}" not found`);
  return d;
}

test('org_rollup: headline.delivery values are the per-metric MEAN, re-banded', () => {
  const result = rollup([RICH_1, RICH_2]);
  assert.ok(result.headline, 'rich input must produce a headline block');

  const cases: Array<[string, string, string | undefined, string | undefined]> =
    [
      // label, display_value, band, check_id
      ['Merges / active contributor', '3 / contributor', undefined, undefined],
      ['LOC / active contributor', '150 / contributor', undefined, undefined],
      ['Deployment frequency', '7 / wk', 'elite', 'ADP-09'],
      ['Rework rate (DORA)', '15%', 'watch', 'ADP-25'],
      ['Lead time for change', '24 h', 'high', 'ADP-10'],
      ['Change-failure rate', '5%', 'high', 'ADP-13'],
      ['Cycle time', '24 h', 'high', 'ADP-11'],
      ['MTTR', '1 h', 'high', 'ADP-I4'],
    ];
  for (const [label, display, band, checkId] of cases) {
    const d = deliveryRow(result, label);
    assert.equal(
      d.display_value,
      display,
      `${label}: display_value must be the re-formatted MEAN "${display}", got "${d.display_value}"`
    );
    assert.equal(
      d.band,
      band,
      `${label}: band must re-band the MEAN to "${band}", got "${d.band}"`
    );
    assert.equal(
      d.check_id,
      checkId,
      `${label}: check_id must be "${checkId}", got "${d.check_id}"`
    );
  }
});

test('org_rollup: a metric present in only some repos averages over just those repos', () => {
  // Only RICH_1 supplies lead_time; RICH_2 has it null → mean over 1 repo = 12.
  const r2NoLead: PerRepoInput = {
    ...RICH_2,
    delivery: { ...RICH_2.delivery, lead_time: null },
  };
  const result = rollup([RICH_1, r2NoLead]);
  const lead = deliveryRow(result, 'Lead time for change');
  assert.equal(
    lead.display_value,
    '12 h',
    `lead time must average only the repo that has it (12h), got "${lead.display_value}"`
  );
  assert.equal(
    lead.band,
    'elite',
    `12h re-bands to elite (<24), got "${lead.band}"`
  );
  assert.equal(
    lead.repos_counted,
    1,
    `lead time coverage must note it was averaged over 1 repo, got ${lead.repos_counted}`
  );
});

test('org_rollup: a metric absent in ALL repos is omitted from the headline', () => {
  const r1NoCycle: PerRepoInput = {
    ...RICH_1,
    delivery: { ...RICH_1.delivery, cycle_time: null },
  };
  const r2NoCycle: PerRepoInput = {
    ...RICH_2,
    delivery: { ...RICH_2.delivery, cycle_time: null },
  };
  const result = rollup([r1NoCycle, r2NoCycle]);
  const cycle = (result.headline?.delivery ?? []).find(
    (x) => x.label === 'Cycle time'
  );
  assert.equal(
    cycle,
    undefined,
    'Cycle time must be omitted when no repo supplies a value'
  );
});

test('org_rollup: enriched per_repo rows carry audit_total, coverage and all 8 delivery values', () => {
  const result = rollup([RICH_1, RICH_2]);
  const row = result.per_repo.find((r) => r.repo === 'org/rich-1');
  assert.ok(row, 'per_repo must include org/rich-1');
  assert.equal(row.audit_total, 50, 'per_repo row must carry audit_total');
  assert.equal(row.coverage, 0.5, 'per_repo row must carry coverage');
  assert.equal(
    row.merges_per_active,
    4,
    'per_repo row must carry merges/active'
  );
  assert.equal(row.loc_per_active, 200, 'per_repo row must carry loc/active');
  assert.equal(row.deploy_freq, 8, 'per_repo row must carry deploy_freq');
  assert.equal(row.rework_rate, 0.1, 'per_repo row must carry rework_rate');
  assert.equal(row.lead_time, 12, 'per_repo row must carry lead_time');
  assert.equal(row.change_fail, 0.04, 'per_repo row must carry change_fail');
  assert.equal(row.cycle_time, 20, 'per_repo row must carry cycle_time');
  assert.equal(row.mttr, 0.5, 'per_repo row must carry mttr');
});

test('org_rollup: legacy input without delivery produces no headline', () => {
  const result = rollup([REPO_A, REPO_B]);
  assert.equal(
    result.headline,
    undefined,
    'headline must be omitted when no repo supplies delivery data'
  );
  // Legacy per_repo rows still expose the enriched fields as null.
  const row = result.per_repo.find((r) => r.repo === 'org/service-a')!;
  assert.equal(
    row.deploy_freq,
    null,
    'legacy per_repo row must default delivery values to null'
  );
});
