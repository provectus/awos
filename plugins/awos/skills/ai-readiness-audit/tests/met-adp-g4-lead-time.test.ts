/**
 * Tests for adp_g4_lead_time metric.
 *
 * Contracts verified:
 * - fixture with known merge dates → expected band
 * - median computed correctly from odd/even record counts
 * - kind is "banded", categories_awarded=[401], status=OK
 * - reliability tag is "minimal" (git approximation)
 * - SKIP when git.json absent or merge_records empty
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g4_lead_time.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g4-'));
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

test('adp_g4: < 24h lead time → elite band', () => {
  const tmp = makeTmpDir();
  // Single merge record with 12-hour lead time → elite
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(12)],
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
  assert.equal(result.band, 'elite', 'lead time < 24h → elite band');
  assert.ok(
    result.categories_awarded.includes(401),
    'code 401 must be awarded'
  );
  assert.equal(result.metric, 'adp_g4_lead_time', 'metric id must match');
});

test('adp_g4: 48h lead time → high band (< 1 week)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(48)],
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
    result.band,
    'high',
    `48h lead time must be "high", got ${result.band}`
  );
});

test('adp_g4: 240h lead time → medium band (< 1 month)', () => {
  const tmp = makeTmpDir();
  // 240 hours = 10 days, < 720h (30 days) → medium
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(240)],
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
    result.band,
    'medium',
    `240h lead time must be "medium", got ${result.band}`
  );
});

test('adp_g4: >= 720h lead time → low band', () => {
  const tmp = makeTmpDir();
  // 800 hours > 720h (30 days) → low
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(800)],
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
    result.band,
    'low',
    `800h lead time must be "low", got ${result.band}`
  );
});

test('adp_g4: median from odd count of records', () => {
  const tmp = makeTmpDir();
  // Lead times: 10h, 50h, 300h → median = 50h → high
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(10), mergeRecord(50), mergeRecord(300)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 10,
    ai_marked_commits: 0,
    total_merges: 3,
    revert_merges: 0,
    numstat_totals: { added: 50, deleted: 10 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs((result.value as number) - 50) < 0.001,
    `median of [10,50,300] must be 50, got ${result.value}`
  );
  assert.equal(result.band, 'high', 'median 50h → high band');
});

test('adp_g4: median from even count of records', () => {
  const tmp = makeTmpDir();
  // Lead times: 12h, 36h → median = 24h → high (just at boundary, <168)
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(12), mergeRecord(36)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 5,
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
  // 24h = exactly 1 day, which is NOT < 24, so → high
  assert.equal(
    result.band,
    'high',
    'median 24h is not elite (requires <24), must be high'
  );
});

test('adp_g4: reliability tag is minimal (git approximation)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(20)],
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
    result.reliability.tag,
    'minimal',
    'reliability must be "minimal" — git-approximated branch-first-commit is a lower bound'
  );
});

test('adp_g4: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json absent');
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g4: SKIP when merge_records empty', () => {
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
// Phase 3b: score/confidence contracts
// ---------------------------------------------------------------------------

test('adp_g4: score=0.75 and confidence=1.0 when median lead time is 24h (DORA high anchor)', () => {
  const tmp = makeTmpDir();
  // Single merge record with 24h lead time → median = 24h → score = 0.75 (log anchor)
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
    `score must be 0.75 at 24h median lead time (log anchor), got ${result.score}`
  );
  assert.equal(
    result.confidence,
    1.0,
    'confidence must be 1.0 when git data available'
  );
});

test('adp_g4: score=1.0 when median lead time is <= 1h (below first anchor)', () => {
  const tmp = makeTmpDir();
  const base = new Date('2025-01-01T00:00:00Z');
  const merged = new Date(base.getTime() + 1 * 3_600_000);
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [
      {
        branch_first_commit_at: base.toISOString(),
        merged_at: merged.toISOString(),
      },
    ],
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 2, commits: 5, merges: 1 },
    ],
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
    result.score,
    1.0,
    'score must be 1.0 when lead time <= 1h (clamps to first anchor)'
  );
});

test('adp_g4: score=0 and confidence=0 on SKIP', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});
