/**
 * Tests for merge_frequency metric.
 *
 * Contracts verified:
 * - whole-window formula: mergesPerWeek = window_stats.merges / (window_days/7)
 * - DORA band is correctly assigned (elite/high/medium/low)
 * - status is OK when git source present, categories_awarded=[301]
 * - kind is "banded"
 * - SKIP when git.json absent or window_stats absent
 * - weight_max === 10 for merge_frequency in standards.toml
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/merge_frequency.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g3-'));
}

/** Minimal git.json raw with a window_stats payload. */
function gitRawWithWindow(
  merges: number,
  windowDays: number,
  windowStart?: string
) {
  return {
    window_stats: {
      window_days: windowDays,
      merges,
      commits: 0,
      authors_total: 0,
      per_author: [],
      merges_per_active: null,
      loc_per_active: null,
      window_start: windowStart ?? null,
    },
    tooling_paths: [],
    merge_records: [],
    total_commits: merges,
    ai_marked_commits: 0,
    total_merges: merges,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  };
}

// ---------------------------------------------------------------------------
// Whole-window formula — the canonical Task 2.1 fixture
// ---------------------------------------------------------------------------

test('adp_g3: whole-window formula — 14 merges / 98 days = 1.0/week → high band', () => {
  // Hand arithmetic: 98 days / 7 = 14 weeks; 14 merges / 14 weeks = 1.0/week
  // 1.0/week is exactly at the elite/high boundary (>= 1 → high, < 7 → high)
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', gitRawWithWindow(14, 98));

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.status,
    'OK',
    'status must be OK when window_stats present'
  );
  assert.equal(result.kind, 'banded', 'kind must be "banded"');
  assert.equal(
    result.band,
    'high',
    '14 merges / 14 weeks = 1.0/week → high band'
  );
  assert.ok(
    Math.abs((result.value as number) - 1.0) < 0.0001,
    `mergesPerWeek must be 1.0 for 14 merges / 14 weeks, got ${result.value}`
  );
  assert.ok(
    result.categories_awarded.includes(301),
    'code 301 must be awarded when data is available'
  );
  assert.equal(result.metric, 'merge_frequency', 'metric id must match');
});

// ---------------------------------------------------------------------------
// DORA band coverage
// ---------------------------------------------------------------------------

test('adp_g3: high-frequency merges → elite band (>= 7/week)', () => {
  const tmp = makeTmpDir();
  // 70 merges / (60 days / 7) = 70 / 8.571 ≈ 8.17/week → elite
  const collectedDir = writeCollected(tmp, 'git', gitRawWithWindow(70, 60));

  const result = compute(collectedDir, standards, {});

  assert.equal(result.status, 'OK', 'status must be OK');
  assert.equal(result.band, 'elite', 'elite when merges/week >= 7');
  assert.ok(
    result.categories_awarded.includes(301),
    'code 301 must be awarded'
  );
});

test('adp_g3: medium-frequency → medium band (>= 0.25/week, < 1/week)', () => {
  const tmp = makeTmpDir();
  // 3 merges / (60 days / 7) = 3 / 8.571 ≈ 0.35/week → medium
  const collectedDir = writeCollected(tmp, 'git', gitRawWithWindow(3, 60));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'medium',
    `expected medium band, got ${result.band} (value=${result.value})`
  );
});

test('adp_g3: low-frequency → low band (< 0.25/week)', () => {
  const tmp = makeTmpDir();
  // 0 merges → 0/week → low
  const collectedDir = writeCollected(tmp, 'git', gitRawWithWindow(0, 60));

  const result = compute(collectedDir, standards, {});
  assert.equal(result.band, 'low', 'must be low when no merges');
});

test('adp_g3: 5 merges / 30 days → high band (>= 1/week, < 7/week)', () => {
  const tmp = makeTmpDir();
  // 5 merges / (30/7) = 5 / 4.286 ≈ 1.17/week → high
  const collectedDir = writeCollected(tmp, 'git', gitRawWithWindow(5, 30));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'high',
    `expected high band, got ${result.band} (value=${result.value})`
  );
});

// ---------------------------------------------------------------------------
// Reliability and metadata
// ---------------------------------------------------------------------------

test('adp_g3: reliability tag is not-reliable', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', gitRawWithWindow(1, 30));

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability tag must be "not-reliable" (direction depends on team size)'
  );
});

// ---------------------------------------------------------------------------
// SKIP contracts
// ---------------------------------------------------------------------------

test('adp_g3: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json absent');
});

test('adp_g3: SKIP when window_stats absent from raw', () => {
  const tmp = makeTmpDir();
  // git.json present but raw lacks window_stats
  const collectedDir = writeCollected(tmp, 'git', {
    tooling_paths: [],
    merge_records: [],
    total_commits: 0,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
    // deliberately no window_stats
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when window_stats is absent from raw'
  );
});

// ---------------------------------------------------------------------------
// Score / confidence contracts
// ---------------------------------------------------------------------------

test('adp_g3: score=1.0 and confidence=1.0 at exactly 7.0 merges/week (elite anchor)', () => {
  const tmp = makeTmpDir();
  // 30 merges / (30 days / 7) = 30 / 4.286 = 7.0 merges/week exactly
  const collectedDir = writeCollected(tmp, 'git', gitRawWithWindow(30, 30));

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs(result.score - 1.0) < 0.0001,
    `score must be 1.0 at 7 merges/week (elite anchor), got ${result.score}`
  );
  assert.equal(
    result.confidence,
    1.0,
    'confidence must be 1.0 when data available'
  );
});

test('adp_g3: score=0 when 0 merges (below lower anchor)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', gitRawWithWindow(0, 30));

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

// ---------------------------------------------------------------------------
// Weight contract — parse standards.toml directly
// ---------------------------------------------------------------------------

test('adp_g3: merge_frequency weight is 10 in standards.toml (Task 2.1)', () => {
  // The merge_frequency category was bumped from 5 → 10 in Task 2.1 because
  // deploy frequency is a headline DORA signal.
  const weight = (standards as any).category?.merge_frequency?.weight;
  assert.equal(
    weight,
    10,
    `standards.toml [category.merge_frequency].weight must be 10 (Task 2.1 bump), got ${weight}`
  );
});
