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
 * - measurement coverage is the mean per-repo coverage ratio
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

test('org_rollup: org_capability_score — contributor-weighted mean of awarded points', () => {
  // REPO_A: 40 pts × 10 contributors, REPO_B: 20 pts × 5 contributors
  // → (400 + 100) / 15 = 33.3333 (weighted by active contributors)
  const result = rollup([REPO_A, REPO_B]);
  const score = metricValue(result, 'org_capability_score');
  assert.ok(
    Math.abs(score - 500 / 15) < 0.001,
    `org_capability_score must be contributor-weighted (500/15 ≈ 33.33), got ${score}`
  );
});

test('org_rollup: org_measurement_coverage (Standards coverage) — contributor-weighted mean of per-repo coverage', () => {
  // The old "≥1 reachable collector" definition always read 100% (git is
  // always reachable). The metric is the contributor-weighted mean of the
  // per-repo coverage ratios: (0.8×10 + 0.6×5 + 0.4×2) / 17 = 11.8/17.
  const result = rollup([
    { ...REPO_A, coverage: 0.8 },
    { ...REPO_B, coverage: 0.6 },
    { ...REPO_NO_TOOLING_NO_SOURCES, coverage: 0.4 },
  ]);
  const coverage = metricValue(result, 'org_measurement_coverage');
  assert.ok(
    Math.abs(coverage - 11.8 / 17) < 0.001,
    `Standards coverage must be contributor-weighted (11.8/17 ≈ 0.6941), got ${coverage}`
  );
});

test('org_rollup: portfolio cards are ordered Standards coverage → Capability score → Repos with AI tooling', () => {
  const result = rollup([REPO_A, REPO_B]);
  const order = result.portfolio_metrics.map((m) => m.metric);
  assert.deepEqual(
    order,
    [
      'org_measurement_coverage',
      'org_capability_score',
      'org_ai_tooling_coverage',
    ],
    'card order must lead with Standards coverage'
  );
  const tooling = result.portfolio_metrics.find(
    (m) => m.metric === 'org_ai_tooling_coverage'
  );
  assert.match(
    tooling!.description,
    /1 of 2 repositories/,
    'the AI-tooling card description must carry the plain X-of-Y count'
  );
});

test('org_rollup: org_measurement_coverage is 0 when no repo carries a coverage ratio', () => {
  const result = rollup([REPO_A, REPO_B]);
  assert.equal(
    metricValue(result, 'org_measurement_coverage'),
    0,
    'without per-repo coverage ratios there is nothing to average'
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
    coverage: 0.5,
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
    0.5,
    'single repo → measurement coverage equals its own coverage ratio'
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
 * per-metric MEAN lands unambiguously inside one DORA band. Cycle-time and
 * MTTR are connector-gated (not git-sourced) and never carried in the rollup,
 * so the deterministic headline has exactly 6 rows:
 *   merges   (4+2)/2   = 3       → "3 / contributor"      (no band)
 *   loc      (200+100)/2 = 150   → "150 / contributor"    (no band)
 *   deploy   (8+6)/2    = 7      → elite  (>=7)            "7 / wk"
 *   rework   (0.10+0.20)/2 = 0.15 → watch  (>=0.15,<0.30) "15%"
 *   lead     (12+36)/2  = 24     → high   (>=24,<168)     "24 h"
 *   change   (0.04+0.06)/2 = 0.05 → high  (>=0.05,<0.10)  "5%"
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

  // The deterministic org headline is exactly 6 rows: the 2 git per-active rows
  // plus the 4 git-sourced DORA metrics. Cycle-time and MTTR are connector-gated
  // and never appear here.
  assert.equal(
    result.headline.delivery.length,
    6,
    `deterministic org headline must have 6 rows (no cycle/MTTR), got ${result.headline.delivery.length}`
  );

  const cases: Array<[string, string, string | undefined, string | undefined]> =
    [
      // label, display_value, band, check_id
      ['Merges / active contributor', '3 / contributor', undefined, undefined],
      ['LOC / active contributor', '150 / contributor', undefined, undefined],
      ['Deployment frequency', '7 / wk', 'elite', 'DF-01'],
      ['Rework rate (DORA)', '15%', 'watch', 'DF-06'],
      ['Lead time for change', '24 h', 'high', 'DF-02'],
      ['Change-failure rate', '5%', 'high', 'DF-04'],
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
  const r1NoDeploy: PerRepoInput = {
    ...RICH_1,
    delivery: { ...RICH_1.delivery, deploy_freq: null },
  };
  const r2NoDeploy: PerRepoInput = {
    ...RICH_2,
    delivery: { ...RICH_2.delivery, deploy_freq: null },
  };
  const result = rollup([r1NoDeploy, r2NoDeploy]);
  const deploy = (result.headline?.delivery ?? []).find(
    (x) => x.label === 'Deployment frequency'
  );
  assert.equal(
    deploy,
    undefined,
    'Deployment frequency must be omitted when no repo supplies a value'
  );
});

test('org_rollup: enriched per_repo rows carry audit_total, coverage and all 6 delivery values', () => {
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

// ---------------------------------------------------------------------------
// Task 5.4 — org_connections aggregation
// ---------------------------------------------------------------------------

/**
 * Three repos with overlapping sources, tech-stack items, and linked repos.
 * Used to verify deduplication within a repo and cross-repo counting.
 *
 *   CONN_1: git, tracker; Python, FastAPI, Claude Code (agent_tools), GitHub Actions (ci); awos-recruitment (mcp)
 *   CONN_2: git, ci;     Python, TypeScript, GitHub Actions (ci); awos-recruitment (mcp, via different path)
 *   CONN_3: git;         TypeScript, Express; (no linked repos)
 *
 * Expected counts:
 *   sources:       git(3), ci(1), tracker(1)          [sorted: git(3), ci(1), tracker(1)]
 *   languages:     Python(2), TypeScript(2)
 *   frameworks:    Express(1), FastAPI(1)
 *   agent_tools:   Claude Code(1)
 *   ci:            GitHub Actions(2)
 *   linked_repos:  awos-recruitment(2)   ← CONN_2 links it via two paths but counts once per repo
 */
const CONN_1: PerRepoInput = {
  repo: 'org/conn-1',
  awarded_weight: 10,
  sources_reachable: ['git', 'tracker'],
  has_ai_tooling: true,
  tech_stack: {
    languages: [{ name: 'Python', evidence: '10 .py files' }],
    frameworks: [{ name: 'FastAPI', evidence: 'fastapi in requirements' }],
    agent_tools: [{ name: 'Claude Code', evidence: '.claude' }],
    ci: [{ name: 'GitHub Actions', evidence: '.github/workflows' }],
  },
  linked_repos: [{ name: 'awos-recruitment', kind: 'mcp', via: '.awos' }],
};

const CONN_2: PerRepoInput = {
  repo: 'org/conn-2',
  awarded_weight: 20,
  sources_reachable: ['git', 'ci'],
  has_ai_tooling: false,
  tech_stack: {
    languages: [
      { name: 'Python', evidence: '5 .py files' },
      { name: 'TypeScript', evidence: '20 .ts files' },
    ],
    frameworks: [],
    agent_tools: [],
    ci: [{ name: 'GitHub Actions', evidence: '.github/workflows' }],
  },
  // Two linked-repo entries for the same name via different paths → counts as 1 for this repo.
  linked_repos: [
    { name: 'awos-recruitment', kind: 'mcp', via: '.claude/settings.json' },
    { name: 'awos-recruitment', kind: 'mcp', via: '.mcp.json' },
  ],
};

const CONN_3: PerRepoInput = {
  repo: 'org/conn-3',
  awarded_weight: 5,
  sources_reachable: ['git'],
  has_ai_tooling: false,
  tech_stack: {
    languages: [{ name: 'TypeScript', evidence: '30 .ts files' }],
    frameworks: [{ name: 'Express', evidence: 'express in package.json' }],
    agent_tools: [],
    ci: [],
  },
  linked_repos: [],
};

test('org_rollup: org_connections is present in the result', () => {
  const result = rollup([CONN_1, CONN_2, CONN_3]);
  assert.ok(
    result.org_connections !== undefined,
    'org_connections must be present when tech_stack or linked_repos are supplied'
  );
});

test('org_rollup: org_connections.sources counts repos where each source key is available', () => {
  const result = rollup([CONN_1, CONN_2, CONN_3]);
  const sources = result.org_connections!.sources;
  const byName = Object.fromEntries(sources.map((e) => [e.name, e.count]));
  assert.equal(
    byName['git'],
    3,
    'git is available in all 3 repos → count must be 3'
  );
  assert.equal(
    byName['tracker'],
    1,
    'tracker is available in 1 repo → count must be 1'
  );
  assert.equal(
    byName['ci'],
    1,
    'ci is available in 1 repo (sources_reachable) → count must be 1'
  );
});

test('org_rollup: org_connections.languages counts repos with each language name', () => {
  const result = rollup([CONN_1, CONN_2, CONN_3]);
  const langs = result.org_connections!.languages;
  const byName = Object.fromEntries(langs.map((e) => [e.name, e.count]));
  assert.equal(byName['Python'], 2, 'Python appears in 2 repos → count 2');
  assert.equal(
    byName['TypeScript'],
    2,
    'TypeScript appears in 2 repos → count 2'
  );
});

test('org_rollup: org_connections.frameworks counts repos with each framework', () => {
  const result = rollup([CONN_1, CONN_2, CONN_3]);
  const fws = result.org_connections!.frameworks;
  const byName = Object.fromEntries(fws.map((e) => [e.name, e.count]));
  assert.equal(byName['FastAPI'], 1, 'FastAPI appears in 1 repo → count 1');
  assert.equal(byName['Express'], 1, 'Express appears in 1 repo → count 1');
});

test('org_rollup: org_connections.ci counts repos with each CI system', () => {
  const result = rollup([CONN_1, CONN_2, CONN_3]);
  const ciItems = result.org_connections!.ci;
  const byName = Object.fromEntries(ciItems.map((e) => [e.name, e.count]));
  assert.equal(
    byName['GitHub Actions'],
    2,
    'GitHub Actions appears in 2 repos → count 2'
  );
});

test('org_rollup: org_connections.agent_tools counts repos with each agent tool', () => {
  const result = rollup([CONN_1, CONN_2, CONN_3]);
  const tools = result.org_connections!.agent_tools;
  const byName = Object.fromEntries(tools.map((e) => [e.name, e.count]));
  assert.equal(
    byName['Claude Code'],
    1,
    'Claude Code appears in 1 repo → count 1'
  );
});

test('org_rollup: org_connections.linked_repos dedupes within a repo (same name via 2 paths counts once)', () => {
  const result = rollup([CONN_1, CONN_2, CONN_3]);
  const linked = result.org_connections!.linked_repos;
  const byName = Object.fromEntries(linked.map((e) => [e.name, e.count]));
  assert.equal(
    byName['awos-recruitment'],
    2,
    'awos-recruitment is linked by 2 repos (CONN_2 links it via 2 paths but counts once) → count 2'
  );
});

test('org_rollup: org_connections lists are sorted by count desc then name asc', () => {
  const result = rollup([CONN_1, CONN_2, CONN_3]);
  const sources = result.org_connections!.sources;
  // git(3) first, then ci(1) and tracker(1) alphabetically
  assert.equal(
    sources[0].name,
    'git',
    'highest count (git, 3) must come first'
  );
  const countOneItems = sources.slice(1).map((e) => e.name);
  assert.deepEqual(
    countOneItems,
    [...countOneItems].sort(),
    'items with equal count must be sorted alphabetically'
  );

  const langs = result.org_connections!.languages;
  // Both Python and TypeScript have count 2 → alphabetical order: Python, TypeScript
  assert.equal(
    langs[0].name,
    'Python',
    'Python before TypeScript (same count, alphabetical)'
  );
  assert.equal(
    langs[1].name,
    'TypeScript',
    'TypeScript second (same count, alphabetical)'
  );
});

test('org_rollup: org_connections is present and non-empty for repos without tech_stack', () => {
  // Repos without tech_stack should still produce org_connections with sources from sources_reachable.
  const result = rollup([REPO_A, REPO_B]);
  assert.ok(
    result.org_connections !== undefined,
    'org_connections must be present even when tech_stack is absent'
  );
  const srcNames = result.org_connections!.sources.map((e) => e.name);
  assert.ok(
    srcNames.includes('git'),
    'git must appear in sources (both repos have it)'
  );
});
