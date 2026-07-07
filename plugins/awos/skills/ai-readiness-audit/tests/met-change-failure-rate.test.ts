/**
 * Tests for change_failure_rate metric.
 *
 * Contracts verified:
 * - value = window_stats.revert_merges / window_stats.merges (whole-window aggregate)
 * - DORA band assigned correctly (elite/high/medium/low)
 * - kind is "banded", categories_awarded=[701], status=OK
 * - reliability tag is "minimal" (lower bound — keyword-detected only)
 * - SKIP when git.json absent, window_stats absent, or window_stats.merges === 0
 * - [category.change_failure_rate].weight === 10
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {} from 'node:fs';
import { join } from 'node:path';
import { compute } from '../metrics/change_failure_rate.ts';
import { writeCollected, loadStandards } from './helpers.ts';
import { tmpDir } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return tmpDir('g7-');
}

/** Minimal window_stats fixture — only the fields g7 reads. */
function makeWindowStats(merges: number, revert_merges: number) {
  return {
    window_days: 90,
    commits: merges * 5,
    merges,
    revert_merges,
    authors_total: 2,
    per_author: [],
    merges_per_active: null,
    loc_per_active: null,
    window_start: '2025-01-01T00:00:00.000Z',
  };
}

/** Build a git.json raw fixture using window_stats for the g7 fields. */
function makeGitRaw(merges: number, revert_merges: number) {
  return {
    merge_records: [],
    tooling_paths: [],
    total_commits: merges * 10,
    ai_marked_commits: 0,
    total_merges: merges,
    revert_merges,
    numstat_totals: { added: 200, deleted: 50 },
    default_branch: 'main',
    window_stats: makeWindowStats(merges, revert_merges),
  };
}

// ---------------------------------------------------------------------------
// Band tests
// ---------------------------------------------------------------------------

test('adp_g7: 0 reverts out of 20 merges → elite band (0%)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(20, 0));

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.status,
    'OK',
    'status must be OK when window_stats.merges > 0'
  );
  assert.equal(result.kind, 'banded', 'kind must be "banded"');
  assert.equal(result.band, 'elite', '0% failure rate → elite band');
  assert.ok(
    result.categories_awarded.includes(701),
    'code 701 must be awarded'
  );
  assert.equal(result.metric, 'change_failure_rate', 'metric id must match');
  assert.ok(
    Math.abs((result.value as number) - 0) < 0.0001,
    `value must be 0.0, got ${result.value}`
  );
});

test('adp_g7: 1 revert out of 20 merges → high band (5%)', () => {
  const tmp = makeTmpDir();
  // 1/20 = 0.05 exactly → NOT < 0.05 → high
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(20, 1));

  const result = compute(collectedDir, standards, {});
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
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(100, 2));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'elite',
    `2% failure rate must be "elite", got ${result.band}`
  );
});

test('adp_g7: 3 reverts out of 20 merges → 15% → low band (whole-window aggregate)', () => {
  const tmp = makeTmpDir();
  // 3/20 = 15% → exactly at boundary → low (>= 0.15)
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(20, 3));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'low',
    `3/20=15% must be "low", got ${result.band}`
  );
  assert.ok(
    Math.abs((result.value as number) - 0.15) < 0.0001,
    `value must be 0.15, got ${result.value}`
  );
});

test('adp_g7: 12 reverts out of 100 merges → medium band (12%)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(100, 12));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'medium',
    `12% failure rate must be "medium", got ${result.band}`
  );
});

test('adp_g7: 20 reverts out of 100 merges → low band (20%)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(100, 20));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'low',
    `20% failure rate must be "low", got ${result.band}`
  );
});

// ---------------------------------------------------------------------------
// Reliability
// ---------------------------------------------------------------------------

test('adp_g7: reliability tag is minimal (lower bound)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(10, 1));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'minimal',
    'reliability must be "minimal" — keyword-detected reverts only; true rate may be higher'
  );
});

// ---------------------------------------------------------------------------
// SKIP cases
// ---------------------------------------------------------------------------

test('adp_g7: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json absent');
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g7: SKIP when window_stats absent', () => {
  const tmp = makeTmpDir();
  // Provide git.json without window_stats
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    tooling_paths: [],
    total_commits: 5,
    ai_marked_commits: 0,
    total_merges: 10,
    revert_merges: 1,
    numstat_totals: { added: 20, deleted: 5 },
    default_branch: 'main',
    // no window_stats key
  });
  const result = compute(collectedDir, standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when window_stats is absent');
});

test('adp_g7: SKIP when window_stats.merges is 0', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(0, 0));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when window_stats.merges is 0 (cannot compute rate)'
  );
});

// ---------------------------------------------------------------------------
// Score / confidence contracts
// ---------------------------------------------------------------------------

test('adp_g7: score=1.0 and confidence=1.0 when 0% change failure rate (elite band)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(10, 0));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.score,
    1.0,
    'score must be 1.0 when failure rate = 0 (clamp01(1 - 0/0.15) = 1)'
  );
  assert.equal(result.confidence, 1.0, 'confidence must be 1.0');
});

test('adp_g7: score=0 when failure rate >= 15% (low band)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(100, 15));

  const result = compute(collectedDir, standards, {});
  assert.ok(
    result.score <= 0.001,
    `score must be 0 at 15% failure rate (clamp01(1 - 0.15/0.15) = 0), got ${result.score}`
  );
});

test('adp_g7: score~=0.5 at 7.5% failure rate', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(200, 15)); // 15/200 = 7.5%

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs(result.score - 0.5) < 0.0001,
    `score must be 0.5 at 7.5% failure rate (clamp01(1 - 0.075/0.15)), got ${result.score}`
  );
});

test('adp_g7: score=0 and confidence=0 on SKIP', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});

// ---------------------------------------------------------------------------
// Weight contract
// ---------------------------------------------------------------------------

test('adp_g7: [category.change_failure_rate].weight === 10', () => {
  const cats = standards as Record<string, unknown>;
  const category = (cats['category'] as Record<string, unknown>)?.[
    'change_failure_rate'
  ] as Record<string, unknown> | undefined;
  assert.ok(
    category !== undefined,
    'standards.toml must define [category.change_failure_rate]'
  );
  assert.equal(
    category?.weight,
    10,
    `[category.change_failure_rate].weight must be 10; got ${category?.weight}`
  );
});
