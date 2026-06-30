/**
 * Tests for adp_g6_churn metric (windowed code-turnover, banded + directional).
 *
 * Contracts verified:
 * - value = code_turnover.ratio (reworked-within-horizon ÷ in-window added)
 * - band: <0.12 "good" / <0.18 "watch" / else "concerning"
 * - lower ratio → higher score (directional: less rework is healthier)
 * - kind "computed", categories_awarded=[601], status OK
 * - reliability tag is "minimal"
 * - SKIP when git.json absent, code_turnover absent, or code_turnover.ratio is null
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g6_churn.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g6-'));
}

function gitRawWith(ratio: number | null) {
  // total_added/reworked_lines are illustrative; only ratio drives the band.
  const reworked = ratio === null ? 0 : Math.round(ratio * 100);
  return {
    merge_records: [],
    tooling_paths: [],
    total_commits: 10,
    ai_marked_commits: 0,
    total_merges: 2,
    revert_merges: 0,
    numstat_totals: { added: 300, deleted: 100 },
    code_turnover: {
      reworked_lines: reworked,
      total_added: ratio === null ? 0 : 100,
      ratio,
    },
    default_branch: 'main',
  };
}

test('adp_g6: ratio < 0.12 bands "good" and awards 601', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', gitRawWith(0.05));

  const result = compute(collectedDir, standards, {});

  assert.equal(result.status, 'OK', 'status must be OK when ratio present');
  assert.equal(result.kind, 'computed', 'kind must be "computed"');
  assert.equal(result.value, 0.05, 'value must equal code_turnover.ratio');
  assert.equal(result.band, 'good', 'ratio 0.05 (<0.12) must band "good"');
  assert.ok(
    result.categories_awarded.includes(601),
    'code 601 must be awarded'
  );
  assert.equal(result.metric, 'adp_g6_churn', 'metric id must match');
});

test('adp_g6: 0.12 <= ratio < 0.18 bands "watch"', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', gitRawWith(0.15));
  const result = compute(collectedDir, standards, {});
  assert.equal(result.band, 'watch', 'ratio 0.15 must band "watch"');
  assert.equal(result.value, 0.15, 'value must equal the ratio');
});

test('adp_g6: ratio >= 0.18 bands "concerning"', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', gitRawWith(0.25));
  const result = compute(collectedDir, standards, {});
  assert.equal(result.band, 'concerning', 'ratio 0.25 must band "concerning"');
});

test('adp_g6: lower turnover ratio yields a higher score (directional)', () => {
  const good = compute(
    writeCollected(makeTmpDir(), 'git', gitRawWith(0.05)),
    standards,
    {}
  );
  const bad = compute(
    writeCollected(makeTmpDir(), 'git', gitRawWith(0.25)),
    standards,
    {}
  );
  assert.ok(
    good.score > bad.score,
    `lower turnover must score higher: good(${good.score}) must exceed concerning(${bad.score})`
  );
  assert.ok(good.score <= 1 && bad.score >= 0, 'scores must be within [0,1]');
});

test('adp_g6: reliability tag is "minimal"', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', gitRawWith(0.1));
  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'minimal',
    'reliability must be "minimal" (approximate line attribution)'
  );
});

test('adp_g6: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json absent');
  assert.equal(result.value, null, 'value must be null on SKIP');
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});

test('adp_g6: SKIP when code_turnover is missing from raw', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    tooling_paths: [],
    total_commits: 5,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 50, deleted: 20 },
    default_branch: 'main',
    // code_turnover omitted intentionally
  });
  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when code_turnover is absent from raw'
  );
});

test('adp_g6: SKIP when code_turnover.ratio is null (no in-window additions)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', gitRawWith(null));
  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when ratio is null (total_added was 0)'
  );
  assert.equal(result.value, null, 'value must be null on SKIP');
});
