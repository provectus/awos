/**
 * Tests for adp_g5_pr_cycle_time metric.
 *
 * Contracts verified:
 * - fixture with known merge dates → expected band
 * - median computed correctly from odd/even record counts
 * - kind is "banded", categories_awarded=[501], status=OK
 * - reliability tag is "not-reliable" (git approximation, not real PR open time)
 * - SKIP when git.json absent or merge_records empty
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g5_pr_cycle_time.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g5-'));
}

/** Create a merge record where merged_at is N hours after branch_first_commit_at. */
function mergeRecord(hoursApart: number): {
  merged_at: string;
  branch_first_commit_at: string;
} {
  const base = new Date('2025-03-01T12:00:00Z');
  const merged = new Date(base.getTime() + hoursApart * 3_600_000);
  return {
    branch_first_commit_at: base.toISOString(),
    merged_at: merged.toISOString(),
  };
}

test('adp_g5: < 24h cycle time → elite band', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(10)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 5,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 20, deleted: 5 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.status,
    'OK',
    'status must be OK when merge_records present'
  );
  assert.equal(result.kind, 'banded', 'kind must be "banded"');
  assert.equal(result.band, 'elite', 'cycle time < 24h → elite band');
  assert.ok(
    result.categories_awarded.includes(501),
    'code 501 must be awarded'
  );
  assert.equal(result.metric, 'adp_g5_pr_cycle_time', 'metric id must match');
});

test('adp_g5: 48h cycle time → high band', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(48)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 3,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 10, deleted: 2 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'high',
    `48h cycle time must be "high", got ${result.band}`
  );
});

test('adp_g5: 240h cycle time → medium band', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(240)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 8,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 50, deleted: 10 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'medium',
    `240h cycle time must be "medium", got ${result.band}`
  );
});

test('adp_g5: >= 720h cycle time → low band', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(800)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 20,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 100, deleted: 30 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'low',
    `800h cycle time must be "low", got ${result.band}`
  );
});

test('adp_g5: median from odd count of records', () => {
  const tmp = makeTmpDir();
  // Cycle times: 10h, 50h, 300h → median = 50h → high
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(10), mergeRecord(50), mergeRecord(300)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 12,
    ai_marked_commits: 0,
    total_merges: 3,
    revert_merges: 0,
    numstat_totals: { added: 80, deleted: 20 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs((result.value as number) - 50) < 0.001,
    `median of [10,50,300] must be 50, got ${result.value}`
  );
  assert.equal(result.band, 'high', 'median 50h → high band');
});

test('adp_g5: median from even count of records', () => {
  const tmp = makeTmpDir();
  // Cycle times: 12h, 36h → median = 24h → high (>=24 so not elite)
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(12), mergeRecord(36)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 6,
    ai_marked_commits: 0,
    total_merges: 2,
    revert_merges: 0,
    numstat_totals: { added: 30, deleted: 5 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs((result.value as number) - 24) < 0.001,
    `median of [12,36] must be 24, got ${result.value}`
  );
  assert.equal(
    result.band,
    'high',
    'median 24h is not elite (requires <24), must be high'
  );
});

test('adp_g5: reliability tag is not-reliable (git approximation)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(20)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 4,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 15, deleted: 3 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability must be "not-reliable" — branch_first_commit is not PR open time'
  );
});

test('adp_g5: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json absent');
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g5: SKIP when merge_records empty', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 2,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 5, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when no merge records to compute from'
  );
});

// ---------------------------------------------------------------------------
// Phase 3b: score/confidence contracts (identical formula to adp_g4_lead_time)
// ---------------------------------------------------------------------------

test('adp_g5: score=0.75 and confidence=1.0 when median cycle time is 24h (DORA high anchor)', () => {
  const tmp = makeTmpDir();
  const base = new Date('2025-01-01T00:00:00Z');
  const merged = new Date(base.getTime() + 24 * 3_600_000);
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [
      {
        branch_first_commit_at: base.toISOString(),
        merged_at: merged.toISOString(),
      },
    ],
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 2, commits: 10, merges: 1 },
    ],
    tooling_paths: [],
    total_commits: 10,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 50, deleted: 10 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs(result.score - 0.75) < 0.0001,
    `score must be 0.75 at 24h median cycle time, got ${result.score}`
  );
  assert.equal(result.confidence, 1.0, 'confidence must be 1.0');
});

test('adp_g5: score=0 and confidence=0 on SKIP', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});
