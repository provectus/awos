/**
 * Tests for org_rollup — org-level cross-repo gap seed (Task 5.5).
 *
 * Contracts verified:
 *   - checks with fail_repos > 0 are included in org_gaps; those with 0 are excluded
 *   - SKIP is NOT counted as fail; only FAIL increments fail_repos
 *   - WARN is NOT counted as fail; only FAIL increments fail_repos
 *   - total_repos counts every repo where the check is present (any status), including SKIP
 *   - org_gaps is sorted by fail_repos desc, then check_id asc (deterministic)
 *   - org_gaps is capped at 15 entries
 *   - a repo with no checks contributes nothing
 *   - a repo with duplicate check_ids only counts once per check_id
 *   - definition comes from the first repo that has the check
 *   - portfolio_metrics / per_repo / org_connections remain intact after adding org_gaps
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollup } from './org_rollup.ts';
import type { PerRepoInput, OrgGap } from './org_rollup.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Three-repo fixture:
 *
 *   check_id  | repo-alpha     | repo-beta      | repo-gamma
 *   ----------|----------------|----------------|---------------
 *   AS-12    | FAIL           | PASS           | SKIP
 *   AIS-07    | FAIL           | FAIL           | PASS
 *   AI-01     | PASS           | PASS           | PASS
 *   DOC-01    | FAIL           | (absent)       | (absent)
 *   ARCH-01   | SKIP           | SKIP           | (absent)
 *
 * Expected org_gaps (fail_repos > 0, sorted fail_repos desc then check_id asc):
 *   1. AIS-07 — fail_repos=2, total_repos=3
 *   2. DOC-01 — fail_repos=1, total_repos=1
 *   3. AS-12 — fail_repos=1, total_repos=3
 *
 * AI-01 excluded (fail_repos=0, all PASS).
 * ARCH-01 excluded (fail_repos=0, all SKIP).
 */
const repoAlpha: PerRepoInput = {
  repo: 'repo-alpha',
  checks: [
    {
      check_id: 'AS-12',
      dimension: 'security',
      definition: 'Security control AS-12',
      status: 'FAIL',
    },
    {
      check_id: 'AIS-07',
      dimension: 'security',
      definition: 'Security control AIS-07',
      status: 'FAIL',
    },
    {
      check_id: 'AI-01',
      dimension: 'ai-tooling',
      definition: 'AI tooling check AI-01',
      status: 'PASS',
    },
    {
      check_id: 'DOC-01',
      dimension: 'documentation',
      definition: 'Documentation check DOC-01',
      status: 'FAIL',
    },
    {
      check_id: 'ARCH-01',
      dimension: 'architecture',
      definition: 'Architecture check ARCH-01',
      status: 'SKIP',
    },
  ],
};

const repoBeta: PerRepoInput = {
  repo: 'repo-beta',
  checks: [
    {
      check_id: 'AS-12',
      dimension: 'security',
      definition: 'Security control AS-12',
      status: 'PASS',
    },
    {
      check_id: 'AIS-07',
      dimension: 'security',
      definition: 'Security control AIS-07',
      status: 'FAIL',
    },
    {
      check_id: 'AI-01',
      dimension: 'ai-tooling',
      definition: 'AI tooling check AI-01',
      status: 'PASS',
    },
    {
      check_id: 'ARCH-01',
      dimension: 'architecture',
      definition: 'Architecture check ARCH-01',
      status: 'SKIP',
    },
  ],
};

const repoGamma: PerRepoInput = {
  repo: 'repo-gamma',
  checks: [
    {
      check_id: 'AS-12',
      dimension: 'security',
      definition: 'Security control AS-12',
      status: 'SKIP',
    },
    {
      check_id: 'AIS-07',
      dimension: 'security',
      definition: 'Security control AIS-07',
      status: 'PASS',
    },
    {
      check_id: 'AI-01',
      dimension: 'ai-tooling',
      definition: 'AI tooling check AI-01',
      status: 'PASS',
    },
  ],
};

function getGap(gaps: OrgGap[], checkId: string): OrgGap | undefined {
  return gaps.find((g) => g.check_id === checkId);
}

// ---------------------------------------------------------------------------
// Basic gap computation
// ---------------------------------------------------------------------------

test('org_gaps: AIS-07 has fail_repos=2 (FAILs in repo-alpha and repo-beta)', () => {
  const result = rollup([repoAlpha, repoBeta, repoGamma]);
  const gap = getGap(result.org_gaps ?? [], 'AIS-07');
  assert.ok(gap, 'AIS-07 gap must be present — it FAILs in 2/3 repos');
  assert.equal(
    gap.fail_repos,
    2,
    'AIS-07: fail_repos must be 2 (FAILs in repo-alpha + repo-beta)'
  );
});

test('org_gaps: AIS-07 has total_repos=3 (present in all three repos)', () => {
  const result = rollup([repoAlpha, repoBeta, repoGamma]);
  const gap = getGap(result.org_gaps ?? [], 'AIS-07');
  assert.ok(gap, 'AIS-07 gap must be present');
  assert.equal(
    gap.total_repos,
    3,
    'AIS-07: total_repos must be 3 (present in all repos)'
  );
});

test('org_gaps: AS-12 has fail_repos=1 (FAIL only in repo-alpha)', () => {
  const result = rollup([repoAlpha, repoBeta, repoGamma]);
  const gap = getGap(result.org_gaps ?? [], 'AS-12');
  assert.ok(gap, 'AS-12 gap must be present — it FAILs in 1 repo');
  assert.equal(
    gap.fail_repos,
    1,
    'AS-12: fail_repos must be 1 (only repo-alpha FAILs)'
  );
});

test('org_gaps: AS-12 has total_repos=3 (present in all three repos, SKIP counts as present)', () => {
  // repo-gamma has AS-12 with status SKIP — SKIP counts toward total_repos (check is present)
  const result = rollup([repoAlpha, repoBeta, repoGamma]);
  const gap = getGap(result.org_gaps ?? [], 'AS-12');
  assert.ok(gap, 'AS-12 gap must be present');
  assert.equal(
    gap.total_repos,
    3,
    'SKIP counts as present for total_repos; AS-12 total_repos must be 3'
  );
});

test('org_gaps: DOC-01 has fail_repos=1 (FAIL in repo-alpha only) and total_repos=1', () => {
  const result = rollup([repoAlpha, repoBeta, repoGamma]);
  const gap = getGap(result.org_gaps ?? [], 'DOC-01');
  assert.ok(gap, 'DOC-01 gap must be present');
  assert.equal(gap.fail_repos, 1, 'DOC-01: fail_repos must be 1');
  assert.equal(
    gap.total_repos,
    1,
    'DOC-01: total_repos must be 1 (only in repo-alpha)'
  );
});

// ---------------------------------------------------------------------------
// SKIP and WARN are not failures
// ---------------------------------------------------------------------------

test('org_gaps: ARCH-01 is excluded because its only statuses are SKIP (fail_repos=0)', () => {
  // ARCH-01 is SKIP in repo-alpha and repo-beta; absent in repo-gamma
  const result = rollup([repoAlpha, repoBeta, repoGamma]);
  const gap = getGap(result.org_gaps ?? [], 'ARCH-01');
  assert.equal(
    gap,
    undefined,
    'ARCH-01 must be excluded: SKIP is not a failure; fail_repos=0'
  );
});

test('org_gaps: AI-01 is excluded because all statuses are PASS (fail_repos=0)', () => {
  const result = rollup([repoAlpha, repoBeta, repoGamma]);
  const gap = getGap(result.org_gaps ?? [], 'AI-01');
  assert.equal(
    gap,
    undefined,
    'AI-01 must be excluded: all PASS, fail_repos=0'
  );
});

test('org_gaps: WARN is not counted as FAIL', () => {
  const repos: PerRepoInput[] = [
    {
      repo: 'repo-warn',
      checks: [
        {
          check_id: 'XYZ-01',
          dimension: 'test',
          definition: 'Test check XYZ-01',
          status: 'WARN',
        },
      ],
    },
    {
      repo: 'repo-pass',
      checks: [
        {
          check_id: 'XYZ-01',
          dimension: 'test',
          definition: 'Test check XYZ-01',
          status: 'PASS',
        },
      ],
    },
  ];
  const result = rollup(repos);
  const gap = getGap(result.org_gaps ?? [], 'XYZ-01');
  assert.equal(
    gap,
    undefined,
    'XYZ-01 must be excluded: WARN does not count as FAIL; fail_repos=0'
  );
});

// ---------------------------------------------------------------------------
// Sort order: fail_repos desc, then check_id asc
// ---------------------------------------------------------------------------

test('org_gaps: sorted fail_repos desc, then check_id asc (deterministic order)', () => {
  const result = rollup([repoAlpha, repoBeta, repoGamma]);
  const gaps = result.org_gaps ?? [];

  // AIS-07 (fail=2) must come before DOC-01 (fail=1) and AS-12 (fail=1)
  const idxSec02 = gaps.findIndex((g) => g.check_id === 'AIS-07');
  const idxDoc01 = gaps.findIndex((g) => g.check_id === 'DOC-01');
  const idxSec01 = gaps.findIndex((g) => g.check_id === 'AS-12');

  assert.ok(idxSec02 !== -1, 'AIS-07 must be in org_gaps');
  assert.ok(idxDoc01 !== -1, 'DOC-01 must be in org_gaps');
  assert.ok(idxSec01 !== -1, 'AS-12 must be in org_gaps');

  assert.ok(
    idxSec02 < idxDoc01,
    'AIS-07 (fail_repos=2) must come before DOC-01 (fail_repos=1) — sorted by fail_repos desc'
  );
  assert.ok(
    idxSec02 < idxSec01,
    'AIS-07 (fail_repos=2) must come before AS-12 (fail_repos=1) — sorted by fail_repos desc'
  );
  // AS-12 vs DOC-01: both fail_repos=1; "AS-12" < "DOC-01" alphabetically
  assert.ok(
    idxSec01 < idxDoc01,
    'AS-12 must come before DOC-01 when fail_repos ties — sorted check_id asc'
  );
});

// ---------------------------------------------------------------------------
// Cap at 15
// ---------------------------------------------------------------------------

test('org_gaps: capped at 15 entries even when more checks fail across repos', () => {
  // Build 20 checks that all FAIL in a single repo
  const checks = Array.from({ length: 20 }, (_, i) => ({
    check_id: `CHECK-${String(i + 1).padStart(2, '0')}`,
    dimension: 'test',
    definition: `Test check ${i + 1}`,
    status: 'FAIL' as const,
  }));
  const repos: PerRepoInput[] = [{ repo: 'big-repo', checks }];
  const result = rollup(repos);
  assert.ok(
    (result.org_gaps ?? []).length <= 15,
    `org_gaps must be capped at 15 entries; got ${result.org_gaps?.length ?? 0}`
  );
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('org_gaps: empty when no repos have checks', () => {
  const repos: PerRepoInput[] = [{ repo: 'no-checks' }];
  const result = rollup(repos);
  assert.deepEqual(
    result.org_gaps,
    [],
    'org_gaps must be empty when no repo has checks'
  );
});

test('org_gaps: repo with no checks contributes nothing', () => {
  const repoNoChecks: PerRepoInput = { repo: 'empty' };
  const result = rollup([repoAlpha, repoNoChecks]);
  // Should still see repo-alpha's gaps
  const gap = getGap(result.org_gaps ?? [], 'AIS-07');
  assert.ok(gap, 'AIS-07 must still appear even when one repo has no checks');
  assert.equal(
    gap.total_repos,
    1,
    'total_repos must count only repos where the check is present'
  );
});

test('org_gaps: duplicate check_ids within a single repo count once per repo', () => {
  // If a repo's checks array somehow has AS-12 twice, it should only count once
  const repoWithDupe: PerRepoInput = {
    repo: 'dupe-repo',
    checks: [
      {
        check_id: 'AS-12',
        dimension: 'security',
        definition: 'Security control AS-12',
        status: 'FAIL',
      },
      {
        check_id: 'AS-12',
        dimension: 'security',
        definition: 'Security control AS-12',
        status: 'FAIL',
      },
    ],
  };
  const result = rollup([repoWithDupe]);
  const gap = getGap(result.org_gaps ?? [], 'AS-12');
  assert.ok(gap, 'AS-12 must be in org_gaps');
  assert.equal(
    gap.fail_repos,
    1,
    'duplicate check_id within a repo must count once; fail_repos=1'
  );
  assert.equal(
    gap.total_repos,
    1,
    'duplicate check_id within a repo must count once; total_repos=1'
  );
});

test('org_gaps: definition comes from the first repo that has the check', () => {
  // repo-alpha has AS-12 with one definition; repo-beta has it with a different label
  const alpha: PerRepoInput = {
    repo: 'alpha',
    checks: [
      {
        check_id: 'AS-12',
        dimension: 'security',
        definition: 'First definition',
        status: 'FAIL',
      },
    ],
  };
  const beta: PerRepoInput = {
    repo: 'beta',
    checks: [
      {
        check_id: 'AS-12',
        dimension: 'security',
        definition: 'Second definition',
        status: 'FAIL',
      },
    ],
  };
  // alpha is first in the array
  const result = rollup([alpha, beta]);
  const gap = getGap(result.org_gaps ?? [], 'AS-12');
  assert.ok(gap, 'AS-12 must be in org_gaps');
  assert.equal(
    gap.definition,
    'First definition',
    'definition must come from the first repo that has the check'
  );
});

// ---------------------------------------------------------------------------
// Non-target contracts remain intact
// ---------------------------------------------------------------------------

test('org_gaps: does not disturb portfolio_metrics, per_repo, or org_connections', () => {
  const result = rollup([repoAlpha, repoBeta, repoGamma]);
  assert.equal(
    result.portfolio_metrics.length,
    3,
    'portfolio_metrics must still have 3 entries'
  );
  assert.equal(result.per_repo.length, 3, 'per_repo must still have 3 entries');
  assert.ok(
    result.org_connections !== undefined,
    'org_connections must still be present'
  );
});
