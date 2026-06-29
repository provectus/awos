/**
 * Tests for adp_g3_deploy_frequency metric.
 *
 * Contracts verified:
 * - fixture with known merge counts → expected merges/week value
 * - DORA band is correctly assigned (elite/high/medium/low)
 * - status is OK when git source present, categories_awarded=[301]
 * - kind is "banded"
 * - SKIP when git.json absent or monthly_buckets empty
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g3_deploy_frequency.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g3-'));
}

test('adp_g3: high-frequency merges → elite band', () => {
  const tmp = makeTmpDir();
  // 70 merges over 2 buckets × 30 days = 60 days = ~8.57 weeks → ~8.17 merges/week → elite (>=7)
  const collectedDir = writeCollected(tmp, 'git', {
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 4, commits: 50, merges: 35 },
      { bucket_start: '2025-02-01', authors: 4, commits: 50, merges: 35 },
    ],
    tooling_paths: [],
    merge_records: [],
    total_commits: 100,
    ai_marked_commits: 0,
    total_merges: 70,
    revert_merges: 0,
    numstat_totals: { added: 500, deleted: 100 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});

  assert.equal(result.status, 'OK', 'status must be OK');
  assert.equal(result.kind, 'banded', 'kind must be "banded"');
  assert.equal(result.band, 'elite', 'elite when merges/week >= 7');
  assert.ok(
    result.categories_awarded.includes(301),
    'code 301 must be awarded'
  );
  assert.equal(
    result.metric,
    'adp_g3_deploy_frequency',
    'metric id must match'
  );
});

test('adp_g3: medium-frequency → medium band (~0.5/week)', () => {
  const tmp = makeTmpDir();
  // 3 merges over 2 buckets × 30 days = 60 days = ~8.57 weeks → 0.35/week → medium (>=0.25,<1)
  const collectedDir = writeCollected(tmp, 'git', {
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 2, commits: 10, merges: 2 },
      { bucket_start: '2025-02-01', authors: 2, commits: 8, merges: 1 },
    ],
    tooling_paths: [],
    merge_records: [],
    total_commits: 18,
    ai_marked_commits: 0,
    total_merges: 3,
    revert_merges: 0,
    numstat_totals: { added: 80, deleted: 20 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'medium',
    `expected medium band, got ${result.band} (value=${result.value})`
  );
});

test('adp_g3: low-frequency → low band (<0.25/week)', () => {
  const tmp = makeTmpDir();
  // 0 merges → 0/week → low
  const collectedDir = writeCollected(tmp, 'git', {
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 1, commits: 5, merges: 0 },
      { bucket_start: '2025-02-01', authors: 1, commits: 3, merges: 0 },
    ],
    tooling_paths: [],
    merge_records: [],
    total_commits: 8,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 20, deleted: 5 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(result.band, 'low', 'must be low when no merges');
});

test('adp_g3: once/day merges → high band (>=1/week, <7/week)', () => {
  const tmp = makeTmpDir();
  // 5 merges in 1 bucket × 30 days = ~4.28 weeks → 5/4.28 ≈ 1.17/week → high
  const collectedDir = writeCollected(tmp, 'git', {
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 3, commits: 20, merges: 5 },
    ],
    tooling_paths: [],
    merge_records: [],
    total_commits: 20,
    ai_marked_commits: 0,
    total_merges: 5,
    revert_merges: 0,
    numstat_totals: { added: 100, deleted: 30 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'high',
    `expected high band, got ${result.band} (value=${result.value})`
  );
});

test('adp_g3: reliability tag is not-reliable', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 2, commits: 8, merges: 1 },
    ],
    tooling_paths: [],
    merge_records: [],
    total_commits: 8,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 30, deleted: 5 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability tag must be "not-reliable"'
  );
});

test('adp_g3: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json absent');
});

test('adp_g3: SKIP when monthly_buckets empty', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    monthly_buckets: [],
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
  assert.equal(result.status, 'SKIP', 'must SKIP when no bucket data');
});

// ---------------------------------------------------------------------------
// Phase 3b: score/confidence contracts
// ---------------------------------------------------------------------------

test('adp_g3: score=1.0 and confidence=1.0 at exactly 7.0 merges/week (elite anchor)', () => {
  const tmp = makeTmpDir();
  // 1 bucket × 30 days = 30/7 weeks; 30 merges / (30/7) weeks = 7.0 merges/week exactly
  const collectedDir = writeCollected(tmp, 'git', {
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 5, commits: 100, merges: 30 },
    ],
    tooling_paths: [],
    merge_records: [],
    total_commits: 100,
    ai_marked_commits: 0,
    total_merges: 30,
    revert_merges: 0,
    numstat_totals: { added: 500, deleted: 100 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs(result.score - 1.0) < 0.0001,
    `score must be 1.0 at 7 merges/week (elite anchor), got ${result.score}`
  );
  assert.equal(result.confidence, 1.0, 'confidence must be 1.0');
});

test('adp_g3: score=0 when 0 merges (below lower anchor)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 2, commits: 5, merges: 0 },
    ],
    tooling_paths: [],
    merge_records: [],
    total_commits: 5,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 20, deleted: 5 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.score,
    0,
    'score must be 0 when no merges (below 0.03/week anchor)'
  );
});

test('adp_g3: score=0 and confidence=0 on SKIP', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});
