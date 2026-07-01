/**
 * Tests for adp_g2_contributors metric — active contributor count over 90-day window.
 *
 * Contracts verified:
 * - 6-person team (4 code contributors, 2 single-commit drive-by) → 4 active
 * - single author → 1 active
 * - status is OK when window_stats.per_author is present and non-empty
 * - categories_awarded contains [201]
 * - kind is "computed"
 * - SKIP when git.json absent
 * - SKIP when per_author is absent or empty
 * - active = authors with ≥ meta.active_contributor_min_commits commits (default 2)
 * - score=1 / confidence=1 when OK; score=0 / confidence=0 on SKIP
 * - reliability tag is "not-reliable"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g2_contributors.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g2-'));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGitRaw(
  perAuthor: Array<{
    author: string;
    commits: number;
    merges: number;
    lines: number;
  }>
) {
  return {
    window_stats: {
      window_days: 90,
      commits: perAuthor.reduce((s, a) => s + a.commits, 0),
      merges: perAuthor.reduce((s, a) => s + a.merges, 0),
      authors_total: perAuthor.length,
      per_author: perAuthor,
    },
    tooling_paths: [],
    merge_records: [],
    total_commits: perAuthor.reduce((s, a) => s + a.commits, 0),
    ai_marked_commits: 0,
    total_merges: perAuthor.reduce((s, a) => s + a.merges, 0),
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  };
}

// ---------------------------------------------------------------------------
// Core cases
// ---------------------------------------------------------------------------

test('adp_g2: 6-person team with 4 code contributors and 2 drive-by → 4 active', () => {
  // Active = distinct authors with ≥ active_contributor_min_commits (default 2) commits.
  // The 4 code contributors have many commits → active; PM + QA each made a single
  // drive-by commit (< 2) → excluded.
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([
      { author: 'SDE1', commits: 50, merges: 10, lines: 1000 },
      { author: 'SDE2', commits: 50, merges: 10, lines: 1000 },
      { author: 'SDE3', commits: 50, merges: 10, lines: 1000 },
      { author: 'ML1', commits: 30, merges: 10, lines: 1000 },
      { author: 'PM1', commits: 1, merges: 0, lines: 10 },
      { author: 'QA1', commits: 1, merges: 0, lines: 10 },
    ])
  );

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.status,
    'OK',
    'status must be OK when per_author is present and non-empty'
  );
  assert.equal(result.kind, 'computed', 'kind must be "computed"');
  assert.ok(
    result.categories_awarded.includes(201),
    'categories_awarded must include 201 (active_contributors code)'
  );
  assert.equal(result.metric, 'adp_g2_contributors', 'metric id must match');
  assert.equal(
    result.value,
    4,
    '6-person team: active count must be 4 (PM + QA excluded — each has < 2 commits)'
  );
  assert.ok(
    typeof result.expression === 'string' &&
      result.expression.includes('4 active contributor'),
    `expression must mention "4 active contributor"; got: ${result.expression}`
  );
  assert.ok(
    typeof result.expression === 'string' &&
      result.expression.includes('2 excluded'),
    `expression must mention "2 excluded"; got: ${result.expression}`
  );
});

test('adp_g2: single author → value is 1 (100% of merges and LOC)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([{ author: 'Alice', commits: 20, merges: 5, lines: 500 }])
  );

  const result = compute(collectedDir, standards, {});

  assert.equal(result.status, 'OK', 'single-author repo: status must be OK');
  assert.equal(
    result.value,
    1,
    'single author: active count must be 1 (sole author cannot be excluded)'
  );
});

test('adp_g2: reliability tag is not-reliable with HIGH confidence when git present', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([{ author: 'Alice', commits: 10, merges: 3, lines: 300 }])
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability tag must be "not-reliable" (raw count; no direction without context)'
  );
  assert.equal(
    result.reliability.confidence,
    'HIGH',
    'confidence must be HIGH when git source is available'
  );
});

test('adp_g2: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  const collectedDir = join(tmp, 'no-collected');

  const result = compute(collectedDir, standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json is absent');
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g2: SKIP when window_stats.per_author is absent', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    // window_stats absent entirely
    tooling_paths: [],
    merge_records: [],
    total_commits: 0,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when window_stats is absent from git.json'
  );
});

test('adp_g2: SKIP when per_author is empty array', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw([]));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when per_author is an empty array'
  );
});

// ---------------------------------------------------------------------------
// Threshold
// ---------------------------------------------------------------------------

test('adp_g2: min-commits bar read from meta.active_contributor_min_commits (default 2)', () => {
  // With the default bar of 2 commits, both authors clear it → both active.
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([
      { author: 'Alice', commits: 30, merges: 5, lines: 500 },
      { author: 'Bob', commits: 20, merges: 5, lines: 500 },
    ])
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.value,
    2,
    'with the default 2-commit bar: both authors have ≥2 commits so both are active'
  );
});

test('adp_g2: higher min-commits from standards meta excludes more authors', () => {
  // With the default bar (2) both are active; raising the bar to 5 excludes Bob (3 commits).
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([
      { author: 'Alice', commits: 80, merges: 80, lines: 800 },
      { author: 'Bob', commits: 3, merges: 0, lines: 200 },
    ])
  );

  // Pass custom standards override raising the min-commits bar to 5.
  const customStandards = {
    ...standards,
    meta: {
      ...((standards as any).meta ?? {}),
      active_contributor_min_commits: 5,
    },
  };
  const result = compute(collectedDir, customStandards as any, {});
  assert.equal(
    result.value,
    1,
    'with min_commits=5: Bob (3 commits) is excluded; only Alice (80 commits) is active'
  );
});

// ---------------------------------------------------------------------------
// score / confidence
// ---------------------------------------------------------------------------

test('adp_g2: score=1 and confidence=1 when data available (observational metric)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([{ author: 'Alice', commits: 10, merges: 3, lines: 200 }])
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.score,
    1.0,
    'score must be 1.0 when data available (observational metric — direction is ambiguous)'
  );
  assert.equal(
    result.confidence,
    1.0,
    'confidence must be 1.0 when full git history scanned'
  );
});

test('adp_g2: score=0 and confidence=0 on SKIP', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});
