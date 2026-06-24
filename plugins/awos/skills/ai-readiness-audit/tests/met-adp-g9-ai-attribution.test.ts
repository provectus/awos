/**
 * Tests for adp_g9_ai_attribution metric.
 *
 * Contracts verified:
 * - value = ai_marked_commits / total_commits
 * - 1 AI-coauthored out of 2 total → value 0.5
 * - kind is "computed", categories_awarded=[901], status=OK
 * - reliability tag is "minimal" (lower bound — attribution easily disabled)
 * - SKIP when git.json absent or total_commits is 0
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g9_ai_attribution.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g9-'));
}

test('adp_g9: 1 AI commit out of 2 total → value 0.5', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 2,
    ai_marked_commits: 1,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 10, deleted: 2 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});

  assert.equal(result.status, 'OK', 'status must be OK when total_commits > 0');
  assert.equal(result.kind, 'computed', 'kind must be "computed"');
  assert.ok(
    Math.abs((result.value as number) - 0.5) < 0.0001,
    `1 AI commit of 2 must give value 0.5, got ${result.value}`
  );
  assert.ok(
    result.categories_awarded.includes(901),
    'code 901 must be awarded'
  );
  assert.equal(result.metric, 'adp_g9_ai_attribution', 'metric id must match');
});

test('adp_g9: 0 AI commits → value 0.0', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 10,
    ai_marked_commits: 0,
    total_merges: 2,
    revert_merges: 0,
    numstat_totals: { added: 80, deleted: 20 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs((result.value as number) - 0) < 0.0001,
    `0 AI commits must give value 0.0, got ${result.value}`
  );
  assert.equal(result.status, 'OK', 'status must be OK');
});

test('adp_g9: all commits AI-attributed → value 1.0', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 5,
    ai_marked_commits: 5,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 50, deleted: 10 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs((result.value as number) - 1.0) < 0.0001,
    `all AI commits must give value 1.0, got ${result.value}`
  );
});

test('adp_g9: 3 out of 12 commits AI-attributed → value ~0.25', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 12,
    ai_marked_commits: 3,
    total_merges: 2,
    revert_merges: 0,
    numstat_totals: { added: 120, deleted: 40 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs((result.value as number) - 0.25) < 0.0001,
    `3/12 AI commits must give value 0.25, got ${result.value}`
  );
});

test('adp_g9: reliability tag is minimal (lower bound)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 4,
    ai_marked_commits: 2,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 30, deleted: 8 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'minimal',
    'reliability must be "minimal" — attribution easily disabled; true rate >= shown'
  );
  assert.equal(
    result.reliability.confidence,
    'HIGH',
    'confidence must be HIGH when git source is available and no missing sources'
  );
});

test('adp_g9: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json absent');
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g9: SKIP when total_commits is 0', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
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
    'must SKIP when total_commits is 0 (cannot compute ratio)'
  );
});
