/**
 * Tests for active_contributors metric — active contributor count over 90-day window.
 *
 * Contracts verified:
 * - 6-person team (4 code contributors, 2 drive-by) → 4 active with T=0.1
 * - single author → 1 active
 * - status is OK when window_stats.per_author is present and non-empty
 * - categories_awarded contains [201]
 * - kind is "computed"
 * - SKIP when git.json absent
 * - SKIP when per_author is absent or empty
 * - threshold T read from meta.active_contributor_threshold (default 0.1)
 * - score=1 / confidence=1 when OK; score=0 / confidence=0 on SKIP
 * - reliability tag is "not-reliable"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/active_contributors.ts';
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
  // 3 SDE + 1 ML each have ≥10% merge share (SDE: 10/40=0.25; ML: 10/40=0.25) → active
  // PM + QA each have 0% merge share and tiny LOC share → excluded on both dimensions
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([
      { author: 'SDE1', commits: 50, merges: 10, lines: 1000 },
      { author: 'SDE2', commits: 50, merges: 10, lines: 1000 },
      { author: 'SDE3', commits: 50, merges: 10, lines: 1000 },
      { author: 'ML1', commits: 30, merges: 10, lines: 1000 },
      { author: 'PM1', commits: 5, merges: 0, lines: 10 },
      { author: 'QA1', commits: 5, merges: 0, lines: 10 },
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
  assert.equal(result.metric, 'active_contributors', 'metric id must match');
  assert.equal(
    result.value,
    4,
    '6-person team: active count must be 4 (PM + QA excluded — both merge share and LOC share < 10%)'
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

test('adp_g2: threshold T read from meta.active_contributor_threshold (default 0.1 from standards)', () => {
  // With T=0.1 (from standards.toml meta), authors with both merge/LOC share ≥10% are active.
  // Both authors here are active at T=0.1 (each has 50% share) — confirms default threshold works.
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
    'with default T=0.1: both authors have 50% share so both are active'
  );
});

test('adp_g2: higher T from standards meta excludes more authors', () => {
  // With T=0.3 (30%), Bob has merge_share=20/100=0.2 < 0.3 AND loc_share=200/1000=0.2 < 0.3 → excluded.
  // Alice has 80% share → active. Result: 1 active.
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([
      { author: 'Alice', commits: 80, merges: 80, lines: 800 },
      { author: 'Bob', commits: 20, merges: 20, lines: 200 },
    ])
  );

  // Pass custom standards override with T=0.3
  const customStandards = {
    ...standards,
    meta: {
      ...((standards as any).meta ?? {}),
      active_contributor_threshold: 0.3,
    },
  };
  const result = compute(collectedDir, customStandards as any, {});
  assert.equal(
    result.value,
    1,
    'with T=0.3: Bob (20% share) is excluded; only Alice (80% share) is active'
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
