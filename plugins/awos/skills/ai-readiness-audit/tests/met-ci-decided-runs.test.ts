/**
 * met-ci-decided-runs.test.ts — CI metrics compute over DECIDED runs only.
 *
 * Regression pin: a chatty trigger workflow filled 456 of 500 fetched runs
 * with conclusion "skipped" (1-second no-op runs). adp_c1 divided successes
 * by ALL runs → "38/500 = 7.6% pass rate (low)" for a repo whose decided
 * runs pass at 86%; adp_c2 averaged the 1 s no-ops into pipeline duration.
 * Runs without a pass/fail verdict belong in neither numerator nor
 * denominator, and the exclusion must be disclosed, never silent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compute as computeC1 } from '../metrics/adp_c1_ci_pass_rate.ts';
import { compute as computeC2 } from '../metrics/adp_c2_pipeline_duration.ts';
import { classifyConclusion, partitionRuns } from '../metrics/_ci_runs.ts';
import { tmpDir, loadStandards } from './helpers.ts';

const standards = loadStandards();

function writeCi(runs: unknown[]): string {
  const dir = tmpDir('ci-decided-');
  writeFileSync(
    join(dir, 'ci.json'),
    JSON.stringify({
      available: true,
      raw: { config_detected: true, config_path: '.github/workflows', runs },
    })
  );
  return dir;
}

/** The real-world shape: 456 skipped no-ops, 38 passes, 6 failures. */
function hopsShapeRuns(): unknown[] {
  return [
    ...Array(456).fill({ conclusion: 'skipped', duration_seconds: 1 }),
    ...Array(38).fill({ conclusion: 'success', duration_seconds: 600 }),
    ...Array(6).fill({ conclusion: 'failure', duration_seconds: 400 }),
  ];
}

test('adp_c1: skipped runs are excluded from the pass rate (7.6% bug shape → 86.4%)', () => {
  const res = computeC1(writeCi(hopsShapeRuns()), standards, { has_ci: true });
  assert.equal(res.status, 'OK', 'decided runs present → must compute');
  assert.ok(
    Math.abs((res.value as number) - 38 / 44) < 1e-9,
    `pass rate must be 38/44 decided runs = 86.4%, not 38/500 = 7.6%; got ${res.value}`
  );
  assert.ok(
    String(res.expression).includes('38/44 decided CI runs'),
    `expression must show the decided denominator, got "${res.expression}"`
  );
  assert.ok(
    String(res.expression).includes('456 skipped'),
    `excluded runs must be disclosed, not silently dropped; got "${res.expression}"`
  );
});

test('adp_c2: 1-second skipped no-ops do not drag down the average pipeline duration', () => {
  const res = computeC2(writeCi(hopsShapeRuns()), standards, { has_ci: true });
  const expected = (38 * 600 + 6 * 400) / 44;
  assert.ok(
    Math.abs((res.value as number) - expected) < 1e-6,
    `avg duration must cover only the 44 decided runs (${expected.toFixed(0)}s), not be diluted by 456 one-second skips; got ${res.value}`
  );
  assert.ok(
    String(res.expression).includes('44 decided runs') &&
      String(res.expression).includes('456 without a verdict excluded'),
    `expression must name the decided sample and the exclusion, got "${res.expression}"`
  );
});

test('adp_c1: all runs skipped/cancelled → SKIP with an actionable note, not a 0% FAIL', () => {
  const res = computeC1(
    writeCi([
      ...Array(9).fill({ conclusion: 'skipped' }),
      { conclusion: 'cancelled' },
    ]),
    standards,
    { has_ci: true }
  );
  assert.equal(
    res.status,
    'SKIP',
    'no decided run means CI health is unmeasurable — 0% would misreport it'
  );
  const note = res.reliability?.note ?? '';
  assert.ok(
    note.includes('none reached a pass/fail verdict') &&
      note.includes('9 skipped'),
    `SKIP note must explain the verdict gap with the breakdown, got "${note}"`
  );
});

test('classifyConclusion covers the major providers without overfitting to GitHub', () => {
  // GitHub Actions / GitLab / Jenkins / CircleCI / Travis / Buildkite / Azure.
  for (const pass of ['success', 'SUCCESS', 'succeeded', 'passed']) {
    assert.equal(
      classifyConclusion(pass),
      'passed',
      `"${pass}" is a pass verdict across providers`
    );
  }
  for (const fail of [
    'failure',
    'failed',
    'FAILURE',
    'errored',
    'unstable',
    'timed_out',
    'startup_failure',
    'partiallySucceeded',
  ]) {
    assert.equal(
      classifyConclusion(fail),
      'failed',
      `"${fail}" ran and did not succeed — a fail verdict`
    );
  }
  for (const noVerdict of [
    'skipped',
    'cancelled',
    'canceled',
    'ABORTED',
    'neutral',
    'manual',
    'blocked',
    'NOT_BUILT',
    'action_required',
    'stale',
    null,
    '',
  ]) {
    assert.equal(
      classifyConclusion(noVerdict),
      'indecisive',
      `"${noVerdict}" never judged the code — excluded from the rate`
    );
  }
});

test('partitionRuns tracks unknown conclusion vocabulary for disclosure instead of silently dropping it', () => {
  const p = partitionRuns([
    { conclusion: 'success' },
    { conclusion: 'weird_new_state' },
    { conclusion: 'weird_new_state' },
  ]);
  assert.equal(p.passed, 1, 'known pass still counts');
  assert.equal(
    p.decided.length,
    1,
    'unknown conclusions must not be guessed into a verdict'
  );
  assert.deepEqual(
    p.unknown,
    ['weird_new_state'],
    'unknown vocabulary must surface so a new provider is noticed, not hidden'
  );
  assert.equal(
    p.excluded.get('weird_new_state'),
    2,
    'excluded breakdown must count unknown conclusions'
  );
});
