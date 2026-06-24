/**
 * Tests for adp_g7_change_fail_rate metric.
 *
 * Contracts verified:
 * - value = revert_merges / total_merges
 * - DORA band assigned correctly (elite/high/medium/low)
 * - kind is "banded", categories_awarded=[701], status=OK
 * - reliability tag is "minimal" (lower bound — keyword-detected only)
 * - SKIP when git.json absent or total_merges is 0
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g7_change_fail_rate.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g7-'));
}

test('adp_g7: 0 reverts out of 20 merges → elite band (0%)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 40,
    ai_marked_commits: 0,
    total_merges: 20,
    revert_merges: 0,
    numstat_totals: { added: 200, deleted: 50 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});

  assert.equal(result.status, 'OK', 'status must be OK when total_merges > 0');
  assert.equal(result.kind, 'banded', 'kind must be "banded"');
  assert.equal(result.band, 'elite', '0% failure rate → elite band');
  assert.ok(
    result.categories_awarded.includes(701),
    'code 701 must be awarded'
  );
  assert.equal(
    result.metric,
    'adp_g7_change_fail_rate',
    'metric id must match'
  );
  assert.ok(
    Math.abs((result.value as number) - 0) < 0.0001,
    `value must be 0.0, got ${result.value}`
  );
});

test('adp_g7: 1 revert out of 20 merges → elite band (5%)', () => {
  const tmp = makeTmpDir();
  // 1/20 = 5% — boundary: < 0.05 is elite, = 0.05 is high
  // Actually 5/100 = 0.05 which is NOT < 0.05, so high
  // 1/20 = 0.05 exactly → high (since elite requires < 0.05)
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 40,
    ai_marked_commits: 0,
    total_merges: 20,
    revert_merges: 1,
    numstat_totals: { added: 200, deleted: 50 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  // 1/20 = 0.05 → not < 0.05 → high
  assert.equal(
    result.band,
    'high',
    `1/20=5% failure rate must be "high" (elite requires <5%), got ${result.band}`
  );
  assert.ok(
    Math.abs((result.value as number) - 0.05) < 0.0001,
    `value must be 0.05, got ${result.value}`
  );
});

test('adp_g7: 2 reverts out of 100 merges → elite band (2%)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 200,
    ai_marked_commits: 0,
    total_merges: 100,
    revert_merges: 2,
    numstat_totals: { added: 1000, deleted: 200 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'elite',
    `2% failure rate must be "elite", got ${result.band}`
  );
});

test('adp_g7: 12 reverts out of 100 merges → medium band (12%)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 200,
    ai_marked_commits: 0,
    total_merges: 100,
    revert_merges: 12,
    numstat_totals: { added: 800, deleted: 300 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'medium',
    `12% failure rate must be "medium", got ${result.band}`
  );
});

test('adp_g7: 20 reverts out of 100 merges → low band (20%)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 200,
    ai_marked_commits: 0,
    total_merges: 100,
    revert_merges: 20,
    numstat_totals: { added: 500, deleted: 200 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'low',
    `20% failure rate must be "low", got ${result.band}`
  );
});

test('adp_g7: reliability tag is minimal (lower bound)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 20,
    ai_marked_commits: 0,
    total_merges: 10,
    revert_merges: 1,
    numstat_totals: { added: 100, deleted: 30 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'minimal',
    'reliability must be "minimal" — keyword-detected reverts only; true rate may be higher'
  );
});

test('adp_g7: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json absent');
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g7: SKIP when total_merges is 0', () => {
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
    'must SKIP when total_merges is 0 (cannot compute rate)'
  );
});
