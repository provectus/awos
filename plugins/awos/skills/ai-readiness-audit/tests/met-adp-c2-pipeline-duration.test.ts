/**
 * Tests for adp_c2_pipeline_duration metric.
 *
 * Contracts verified:
 * - CI absent (available=false) → SKIP, sources_used=[], sources_missing=['ci']
 * - CI file missing entirely → SKIP
 * - CI config-only (available=false, runs=[]) → SKIP (collector sets available=false; no longer an OK partial case)
 * - CI with runs carrying duration_seconds → correct avg, status=OK, categories=[1002] when has_ci
 * - Runs without duration_seconds are excluded from avg
 * - All runs missing duration_seconds → SKIP with reason (no free score)
 * - kind is "duration_seconds"
 * - band is null (no band label; the score is banded via DURATION_ANCHORS)
 * - score: 1.0 at ≤10 min avg, 0 at ≥2 h avg, in-between otherwise
 * - reliability.tag is "not-reliable"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_c2_pipeline_duration.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'c2-'));
}

// ---------------------------------------------------------------------------
// Absence / SKIP tests
// ---------------------------------------------------------------------------

test('adp_c2: SKIP when ci.json file is missing', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when ci.json is absent');
  assert.deepEqual(result.sources_used, [], 'sources_used must be empty');
  assert.deepEqual(
    result.sources_missing,
    ['ci'],
    'sources_missing must include ci'
  );
});

test('adp_c2: SKIP when ci artifact has available=false', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'ci',
    { config_detected: false, config_path: null, runs: [] },
    false // available=false
  );
  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when ci available=false (no config, no connector)'
  );
  assert.deepEqual(result.sources_used, [], 'sources_used must be empty');
});

// ---------------------------------------------------------------------------
// Config-only test: config present, runs absent → SKIP (available=false)
// The collector now sets available=false for config-only repos (no run history).
// ---------------------------------------------------------------------------

test('adp_c2: SKIP when config_detected=true but runs=[] and available=false (config-only)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'ci',
    { config_detected: true, config_path: '.github/workflows', runs: [] },
    false // available=false — the new collector output for config-only repos
  );
  const result = compute(collectedDir, standards, { has_ci: true });

  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when ci available=false (config detected but no run history)'
  );
  assert.deepEqual(
    result.sources_used,
    [],
    'sources_used must be empty on SKIP'
  );
  assert.deepEqual(
    result.sources_missing,
    ['ci'],
    'sources_missing must include ci on SKIP'
  );
});

// ---------------------------------------------------------------------------
// Full-data tests
// ---------------------------------------------------------------------------

test('adp_c2: correct average duration from runs', () => {
  const tmp = makeTmpDir();
  const runs = [
    { conclusion: 'success', duration_seconds: 120 },
    { conclusion: 'success', duration_seconds: 180 },
    { conclusion: 'failure', duration_seconds: 60 },
  ];
  const collectedDir = writeCollected(
    tmp,
    'ci',
    { config_detected: true, config_path: '.github/workflows', runs },
    true
  );
  const result = compute(collectedDir, standards, { has_ci: true });

  assert.equal(result.status, 'OK', 'status must be OK');
  assert.equal(
    result.kind,
    'duration_seconds',
    'kind must be duration_seconds'
  );
  assert.equal(result.band, null, 'band must be null (no banding)');
  // avg = (120 + 180 + 60) / 3 = 120
  assert.ok(
    Math.abs((result.value as number) - 120) < 0.001,
    `expected avg 120 got ${result.value}`
  );
  assert.equal(
    result.reliability.confidence,
    'HIGH',
    'reliability must be HIGH when runs present'
  );
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability tag must be not-reliable'
  );
  assert.ok(
    result.categories_awarded.includes(1002),
    'code 1002 must be awarded when topology.has_ci=true'
  );
});

test('adp_c2: runs missing duration_seconds excluded from avg', () => {
  const tmp = makeTmpDir();
  const runs = [
    { conclusion: 'success', duration_seconds: 200 },
    { conclusion: 'success' }, // no duration_seconds
    { conclusion: 'failure', duration_seconds: 100 },
  ];
  const collectedDir = writeCollected(
    tmp,
    'ci',
    { config_detected: true, config_path: '.github/workflows', runs },
    true
  );
  const result = compute(collectedDir, standards, { has_ci: true });

  // Only 2 runs have duration_seconds; avg = (200 + 100) / 2 = 150
  assert.ok(
    Math.abs((result.value as number) - 150) < 0.001,
    `expected avg 150 got ${result.value}`
  );
});

test('adp_c2: SKIP with reason when no run has duration_seconds', () => {
  const tmp = makeTmpDir();
  const runs = [{ conclusion: 'success' }, { conclusion: 'failure' }];
  const collectedDir = writeCollected(
    tmp,
    'ci',
    { config_detected: true, config_path: '.github/workflows', runs },
    true
  );
  const result = compute(collectedDir, standards, { has_ci: true });

  assert.equal(
    result.value,
    null,
    'value must be null when no run has duration_seconds'
  );
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP (not award a score) when duration cannot be computed from any run'
  );
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.match(
    result.reliability.note ?? '',
    /duration_seconds/,
    'SKIP note must say the runs lack duration_seconds'
  );
});

test('adp_c2: categories_awarded empty when topology.has_ci=false', () => {
  const tmp = makeTmpDir();
  const runs = [{ conclusion: 'success', duration_seconds: 60 }];
  const collectedDir = writeCollected(
    tmp,
    'ci',
    { config_detected: true, config_path: '.github/workflows', runs },
    true
  );
  const result = compute(collectedDir, standards, {});
  assert.deepEqual(
    result.categories_awarded,
    [],
    'no category 1002 when topology.has_ci is false'
  );
});

// ---------------------------------------------------------------------------
// Phase 3b: score/confidence contracts
// ---------------------------------------------------------------------------

test('adp_c2: best case — ≤10 min avg pipeline scores 1.0 with confidence 1.0', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'ci', {
    config_detected: true,
    config_path: '.github/workflows/ci.yml',
    runs: [
      { conclusion: 'success', duration_seconds: 120 },
      { conclusion: 'success', duration_seconds: 180 },
    ],
  });

  const result = compute(collectedDir, standards, { has_ci: true });
  assert.equal(
    result.score,
    1.0,
    'score must be 1.0 when the average pipeline duration is ≤10 minutes (best case)'
  );
  assert.equal(result.confidence, 1.0, 'confidence must be 1.0');
});

test('adp_c2: worst case — ≥2 h avg pipeline scores 0 but stays OK', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'ci', {
    config_detected: true,
    config_path: '.github/workflows/ci.yml',
    runs: [{ conclusion: 'success', duration_seconds: 3 * 3600 }],
  });

  const result = compute(collectedDir, standards, { has_ci: true });
  assert.equal(
    result.status,
    'OK',
    'a slow pipeline is still measured (OK), not skipped'
  );
  assert.equal(
    result.score,
    0,
    'score must reach 0 at a ≥2 h average pipeline (worst case)'
  );
});

test('adp_c2: mid-range duration scores strictly between 0 and 1', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'ci', {
    config_detected: true,
    config_path: '.github/workflows/ci.yml',
    runs: [{ conclusion: 'success', duration_seconds: 1800 }],
  });

  const result = compute(collectedDir, standards, { has_ci: true });
  assert.ok(
    result.score > 0 && result.score < 1,
    `a 30-minute pipeline must score strictly between 0 and 1, got ${result.score}`
  );
});

test('adp_c2: score=0 and confidence=0 on SKIP (ci.json absent)', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});
