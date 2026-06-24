/**
 * Tests for adp_g2_contributors metric.
 *
 * Contracts verified:
 * - fixture with known monthly_buckets → expected average author count
 * - status is OK when git source present
 * - categories_awarded contains [201]
 * - kind is "computed"
 * - SKIP when git.json absent
 * - SKIP when monthly_buckets is empty
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

test('adp_g2: avg contributors computed correctly from buckets', () => {
  const tmp = makeTmpDir();
  // Buckets with authors: 2, 4, 6 → avg = 4
  const collectedDir = writeCollected(tmp, 'git', {
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 2, commits: 10, merges: 2 },
      { bucket_start: '2025-02-01', authors: 4, commits: 12, merges: 3 },
      { bucket_start: '2025-03-01', authors: 6, commits: 15, merges: 4 },
    ],
    tooling_paths: [],
    merge_records: [],
    total_commits: 37,
    ai_marked_commits: 0,
    total_merges: 9,
    revert_merges: 0,
    numstat_totals: { added: 100, deleted: 20 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});

  assert.equal(result.status, 'OK', 'status must be OK when git data present');
  assert.equal(result.kind, 'computed', 'kind must be "computed"');
  assert.ok(
    result.categories_awarded.includes(201),
    'categories_awarded must include 201 (active_contributors)'
  );
  assert.equal(result.metric, 'adp_g2_contributors', 'metric id must match');
  assert.ok(
    Math.abs((result.value as number) - 4) < 0.001,
    `average authors must be 4, got ${result.value}`
  );
});

test('adp_g2: single bucket → value equals that bucket authors', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 5, commits: 20, merges: 3 },
    ],
    tooling_paths: [],
    merge_records: [],
    total_commits: 20,
    ai_marked_commits: 0,
    total_merges: 3,
    revert_merges: 0,
    numstat_totals: { added: 50, deleted: 10 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.value,
    5,
    'single bucket: value must equal bucket authors count'
  );
});

test('adp_g2: reliability tag is not-reliable', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 3, commits: 8, merges: 1 },
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
  assert.equal(
    result.reliability.confidence,
    'HIGH',
    'confidence is HIGH when all sources present'
  );
});

test('adp_g2: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  const collectedDir = join(tmp, 'no-collected');

  const result = compute(collectedDir, standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json absent');
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g2: SKIP when monthly_buckets empty', () => {
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
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when monthly_buckets is empty'
  );
});
