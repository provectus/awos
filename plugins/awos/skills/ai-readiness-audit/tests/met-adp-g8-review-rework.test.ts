/**
 * Tests for adp_g8_review_rework metric.
 *
 * Contracts verified:
 * - value = max(0, total_commits/merge_records.length - 1) (rework proxy)
 * - kind is "computed", categories_awarded=[801], status=OK
 * - reliability tag is "not-reliable" (coarse proxy)
 * - SKIP when git.json absent or merge_records empty
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g8_review_rework.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g8-'));
}

/** Minimal merge record for fixture purposes. */
function mergeRecord(): { merged_at: string; branch_first_commit_at: string } {
  return {
    branch_first_commit_at: '2025-03-01T10:00:00Z',
    merged_at: '2025-03-02T12:00:00Z',
  };
}

test('adp_g8: 10 commits, 2 merges → rework proxy = 4', () => {
  const tmp = makeTmpDir();
  // total_commits=10, merge_records.length=2 → commits_per_pr=5, rework=4
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(), mergeRecord()],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 10,
    ai_marked_commits: 0,
    total_merges: 2,
    revert_merges: 0,
    numstat_totals: { added: 100, deleted: 30 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.status,
    'OK',
    'status must be OK when merge_records present'
  );
  assert.equal(result.kind, 'computed', 'kind must be "computed"');
  assert.ok(
    Math.abs((result.value as number) - 4) < 0.0001,
    `rework proxy must be 4 (10/2-1), got ${result.value}`
  );
  assert.ok(
    result.categories_awarded.includes(801),
    'code 801 must be awarded'
  );
  assert.equal(result.metric, 'adp_g8_review_rework', 'metric id must match');
});

test('adp_g8: 1 commit, 1 merge → rework proxy = 0', () => {
  const tmp = makeTmpDir();
  // total_commits=1, merge_records.length=1 → commits_per_pr=1, rework=max(0,0)=0
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord()],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 1,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 10, deleted: 2 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(result.status, 'OK', 'status must be OK');
  assert.ok(
    Math.abs((result.value as number) - 0) < 0.0001,
    `rework proxy must be 0, got ${result.value}`
  );
});

test('adp_g8: value is floored at 0 when commits < merges', () => {
  const tmp = makeTmpDir();
  // Unusual edge: more merge records than total_commits
  // total_commits=1, merge_records.length=3 → commits_per_pr≈0.33, rework=max(0,-0.67)=0
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(), mergeRecord(), mergeRecord()],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 1,
    ai_marked_commits: 0,
    total_merges: 3,
    revert_merges: 0,
    numstat_totals: { added: 5, deleted: 1 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(result.status, 'OK', 'status must be OK');
  assert.ok(
    (result.value as number) >= 0,
    `rework proxy must be >= 0, got ${result.value}`
  );
});

test('adp_g8: reliability tag is not-reliable', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord()],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 5,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 50, deleted: 10 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability must be "not-reliable" — commit count is a coarse rework proxy'
  );
});

test('adp_g8: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json absent');
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g8: SKIP when merge_records empty', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 5,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 20, deleted: 5 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when no merge records available'
  );
});

// ---------------------------------------------------------------------------
// Phase 3b: score/confidence contracts
// ---------------------------------------------------------------------------

test('adp_g8: score=1.0 and confidence=1.0 when data available (observational metric)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [
      {
        branch_first_commit_at: '2025-01-01T00:00:00Z',
        merged_at: '2025-01-02T00:00:00Z',
      },
    ],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 10,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 50, deleted: 10 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.score,
    1.0,
    'score must be 1.0 when data available (observational — direction is ambiguous)'
  );
  assert.equal(
    result.confidence,
    1.0,
    'confidence must be 1.0 when git data present'
  );
});

test('adp_g8: score=0 and confidence=0 on SKIP', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});
