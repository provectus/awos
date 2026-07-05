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
import { join } from 'node:path';
import { compute } from '../metrics/adp_g8_review_rework.ts';
import { gitRaw, tmpDir, writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

/** Minimal merge record for fixture purposes. */
function mergeRecord(): { merged_at: string; branch_first_commit_at: string } {
  return {
    branch_first_commit_at: '2025-03-01T10:00:00Z',
    merged_at: '2025-03-02T12:00:00Z',
  };
}

test('adp_g8: 10 commits, 2 merges → rework proxy = 4', () => {
  const tmp = tmpDir('g8-');
  // total_commits=10, merge_records.length=2 → commits_per_pr=5, rework=4
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [mergeRecord(), mergeRecord()], total_commits: 10 })
  );

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
  const tmp = tmpDir('g8-');
  // total_commits=1, merge_records.length=1 → commits_per_pr=1, rework=max(0,0)=0
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [mergeRecord()], total_commits: 1 })
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(result.status, 'OK', 'status must be OK');
  assert.ok(
    Math.abs((result.value as number) - 0) < 0.0001,
    `rework proxy must be 0, got ${result.value}`
  );
});

test('adp_g8: value is floored at 0 when commits < merges', () => {
  const tmp = tmpDir('g8-');
  // Unusual edge: more merge records than total_commits
  // total_commits=1, merge_records.length=3 → commits_per_pr≈0.33, rework=max(0,-0.67)=0
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({
      merge_records: [mergeRecord(), mergeRecord(), mergeRecord()],
      total_commits: 1,
    })
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(result.status, 'OK', 'status must be OK');
  assert.ok(
    (result.value as number) >= 0,
    `rework proxy must be >= 0, got ${result.value}`
  );
});

test('adp_g8: reliability tag is not-reliable', () => {
  const tmp = tmpDir('g8-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [mergeRecord()], total_commits: 5 })
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability must be "not-reliable" — commit count is a coarse rework proxy'
  );
});

test('adp_g8: SKIP when git.json absent', () => {
  const tmp = tmpDir('g8-');
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json absent');
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g8: SKIP when merge_records empty', () => {
  const tmp = tmpDir('g8-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [], total_commits: 5 })
  );

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

/** Fixture with `commits` total commits spread over `merges` merge records. */
function collectedWithRatio(commits: number, merges: number): string {
  const tmp = tmpDir('g8-');
  return writeCollected(
    tmp,
    'git',
    gitRaw({
      merge_records: Array.from({ length: merges }, mergeRecord),
      total_commits: commits,
    })
  );
}

test('adp_g8: best case — ≤2 commits/PR scores 1.0 with confidence 1.0', () => {
  // 4 commits over 2 merges → 2 commits/PR: focused review-clean merges.
  const result = compute(collectedWithRatio(4, 2), standards, {});
  assert.equal(
    result.score,
    1.0,
    'score must be 1.0 at ≤2 commits/PR (best-case review rework)'
  );
  assert.equal(
    result.confidence,
    1.0,
    'confidence must be 1.0 when git data present'
  );
});

test('adp_g8: worst case — ≥10 commits/PR scores 0', () => {
  // 20 commits over 1 merge → 20 commits/PR: heavy in-review thrashing.
  const result = compute(collectedWithRatio(20, 1), standards, {});
  assert.equal(
    result.status,
    'OK',
    'worst-case repo must still be scored (OK), not skipped'
  );
  assert.equal(
    result.score,
    0,
    'score must reach 0 at ≥10 commits/PR (worst-case review rework)'
  );
});

test('adp_g8: score declines between the 1.0 and 0 anchors', () => {
  // 5 commits/PR sits between the {x:4,y:0.7} and {x:6,y:0.4} anchors.
  const result = compute(collectedWithRatio(10, 2), standards, {});
  assert.ok(
    (result.score as number) > 0 && (result.score as number) < 1,
    `mid-range commits/PR must score strictly between 0 and 1, got ${result.score}`
  );
  assert.ok(
    Math.abs((result.score as number) - 0.55) < 0.0001,
    `5 commits/PR must interpolate to 0.55 between the 4→0.7 and 6→0.4 anchors, got ${result.score}`
  );
});

test('adp_g8: score=0 and confidence=0 on SKIP', () => {
  const tmp = tmpDir('g8-');
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});

test('adp_g8: squash-merge strategy → SKIP (merge-record proxy unavailable)', () => {
  const tmp = tmpDir('g8-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({
      merge_records: [mergeRecord()],
      window_stats: { merge_strategy: 'squash' },
      total_commits: 50,
    })
  );
  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'squash-merge repos must SKIP the review-rework merge-record proxy'
  );
  assert.equal(
    result.kind,
    'computed',
    'squash SKIP must report the same kind ("computed") as the scored path'
  );
});

// ---------------------------------------------------------------------------
// Windowed git fallback (regression: the merge-commit-repo fallback divided
// all-history total_commits by all-history merge count, so old workflow eras
// dominated the "current" rework proxy).
// ---------------------------------------------------------------------------

test('adp_g8: windowed trunk counts outrank all-history totals in the git fallback', () => {
  const tmp = tmpDir('g8-');
  // All-history says 100/2 = 50 commits/PR; the window says 12/4 = 3.
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({
      merge_records: [mergeRecord(), mergeRecord()],
      total_commits: 100,
      window_stats: {
        window_days: 90,
        trunk_commits: 12,
        merges: 4,
        merge_strategy: 'merge-commit',
      },
    })
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(result.status, 'OK', 'windowed fallback must produce a result');
  assert.ok(
    Math.abs((result.value as number) - 2) < 0.0001,
    `rework proxy must use WINDOWED 12 commits / 4 merges - 1 = 2, not the all-history 100/2-1 = 49; got ${result.value}`
  );
  assert.ok(
    String(result.expression).includes('over the last 90 days'),
    `expression must state the window, got "${result.expression}"`
  );
});

test('adp_g8: windowed artifact with zero in-window merges SKIPs instead of reporting stale history', () => {
  const tmp = tmpDir('g8-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({
      merge_records: [mergeRecord()],
      total_commits: 100,
      window_stats: {
        window_days: 90,
        trunk_commits: 5,
        merges: 0,
        merge_strategy: 'unknown',
      },
    })
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'no in-window merges means current review practice is unmeasurable — falling back to all-history merges would defeat the windowing'
  );
});
