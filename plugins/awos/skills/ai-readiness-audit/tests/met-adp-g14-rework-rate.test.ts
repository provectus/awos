/**
 * Tests for adp_g14_rework_rate metric.
 *
 * Contracts verified:
 * - value = window_stats.fix_merges / window_stats.merges (rework_rate as fraction)
 * - Band assigned correctly (good/watch/concerning — AWOS heuristics, no DORA thresholds)
 * - kind is "banded", categories_awarded=[1401], status=OK
 * - reliability tag is "minimal" (lower bound — keyword-detected fix merges only)
 * - SKIP when git.json absent, window_stats absent, or window_stats.merges === 0
 * - [category.rework_rate].weight === 10
 *
 * Band definitions (AWOS heuristics — DORA publishes no rework-rate thresholds):
 *   good       → rate < 0.15  (< 15% of merges are unplanned fix work)
 *   watch      → rate < 0.30  (15–29%)
 *   concerning → rate >= 0.30 (30%+)
 *
 * Score anchors: [{x:0,y:1},{x:0.15,y:0.8},{x:0.30,y:0.4},{x:0.50,y:0}], linear, clamp01.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g14_rework_rate.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g14-'));
}

/** Minimal window_stats fixture — only the fields g14 reads. */
function makeWindowStats(merges: number, fix_merges: number) {
  return {
    window_days: 90,
    commits: merges * 5,
    merges,
    fix_merges,
    revert_merges: 0,
    authors_total: 2,
    per_author: [],
    merges_per_active: null,
    loc_per_active: null,
    window_start: '2025-01-01T00:00:00.000Z',
  };
}

/** Build a git.json raw fixture using window_stats for the g14 fields. */
function makeGitRaw(merges: number, fix_merges: number) {
  return {
    merge_records: [],
    tooling_paths: [],
    total_commits: merges * 10,
    ai_marked_commits: 0,
    total_merges: merges,
    revert_merges: 0,
    numstat_totals: { added: 200, deleted: 50 },
    default_branch: 'main',
    window_stats: makeWindowStats(merges, fix_merges),
  };
}

// ---------------------------------------------------------------------------
// Band tests
// ---------------------------------------------------------------------------

test('adp_g14: 0 fix merges out of 20 merges → good band (0% rework rate)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(20, 0));

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.status,
    'OK',
    'status must be OK when window_stats.merges > 0'
  );
  assert.equal(result.kind, 'banded', 'kind must be "banded"');
  assert.equal(result.band, 'good', '0% rework rate → good band');
  assert.ok(
    result.categories_awarded.includes(1401),
    'code 1401 must be awarded'
  );
  assert.equal(
    result.metric,
    'adp_g14_rework_rate',
    'metric id must be adp_g14_rework_rate'
  );
  assert.ok(
    Math.abs((result.value as number) - 0) < 0.0001,
    `value must be 0.0, got ${result.value}`
  );
});

test('adp_g14: 3 fix merges out of 20 merges → 15% → watch band (boundary: not < 0.15)', () => {
  const tmp = makeTmpDir();
  // 3/20 = 0.15 exactly → NOT < 0.15 → watch
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(20, 3));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'watch',
    `3/20=15% rework rate must be "watch" (good requires < 15%); got ${result.band}`
  );
  assert.ok(
    Math.abs((result.value as number) - 0.15) < 0.0001,
    `value must be 0.15, got ${result.value}`
  );
});

test('adp_g14: 2 fix merges out of 100 merges → good band (2%)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(100, 2));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'good',
    `2% rework rate must be "good"; got ${result.band}`
  );
});

test('adp_g14: 6 fix merges out of 20 merges → 30% → concerning band (boundary: not < 0.30)', () => {
  const tmp = makeTmpDir();
  // 6/20 = 0.30 exactly → NOT < 0.30 → concerning
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(20, 6));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'concerning',
    `6/20=30% must be "concerning"; got ${result.band}`
  );
  assert.ok(
    Math.abs((result.value as number) - 0.3) < 0.0001,
    `value must be 0.30, got ${result.value}`
  );
});

test('adp_g14: 5 fix merges out of 20 merges → 25% → watch band', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(20, 5));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'watch',
    `25% rework rate must be "watch"; got ${result.band}`
  );
});

test('adp_g14: 10 fix merges out of 20 merges → 50% → concerning band', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(20, 10));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'concerning',
    `50% rework rate must be "concerning"; got ${result.band}`
  );
});

// ---------------------------------------------------------------------------
// Reliability
// ---------------------------------------------------------------------------

test('adp_g14: reliability tag is minimal (lower bound — keyword git proxy)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(10, 1));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'minimal',
    'reliability must be "minimal" — keyword-detected fix merges only; true rework rate may be higher'
  );
});

// ---------------------------------------------------------------------------
// SKIP cases
// ---------------------------------------------------------------------------

test('adp_g14: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json is absent');
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g14: SKIP when window_stats absent', () => {
  const tmp = makeTmpDir();
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
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when window_stats is absent from git artifact'
  );
});

test('adp_g14: SKIP when window_stats.merges is 0 (no denominator)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(0, 0));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when window_stats.merges is 0 (cannot compute rate without a denominator)'
  );
});

// ---------------------------------------------------------------------------
// Score / confidence contracts
// ---------------------------------------------------------------------------

test('adp_g14: score=1.0 and confidence=1.0 when 0% rework rate (good band)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(10, 0));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.score,
    1.0,
    'score must be 1.0 when rework rate = 0 (bandScore at x=0 → y=1)'
  );
  assert.equal(result.confidence, 1.0, 'confidence must be 1.0 on OK result');
});

test('adp_g14: score=0.8 when rework rate = 15% (watch boundary)', () => {
  const tmp = makeTmpDir();
  // 3/20 = 15% → at the good/watch boundary → bandScore interpolates to 0.8
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(20, 3));

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs(result.score - 0.8) < 0.0001,
    `score must be 0.8 at 15% rework rate (bandScore anchor at x=0.15,y=0.8); got ${result.score}`
  );
});

test('adp_g14: score~=0 at 50% rework rate (beyond last anchor)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw(20, 10)); // 10/20 = 50%

  const result = compute(collectedDir, standards, {});
  assert.ok(
    result.score <= 0.001,
    `score must be 0 at 50% rework rate (clamped at last anchor x=0.50,y=0); got ${result.score}`
  );
});

test('adp_g14: score=0 and confidence=0 on SKIP', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});

// ---------------------------------------------------------------------------
// Weight contract
// ---------------------------------------------------------------------------

test('adp_g14: [category.rework_rate].weight === 10', () => {
  const cats = standards as Record<string, unknown>;
  const category = (cats['category'] as Record<string, unknown>)?.[
    'rework_rate'
  ] as Record<string, unknown> | undefined;
  assert.ok(
    category !== undefined,
    'standards.toml must define [category.rework_rate]'
  );
  assert.equal(
    category?.weight,
    10,
    `[category.rework_rate].weight must be 10; got ${category?.weight}`
  );
});
