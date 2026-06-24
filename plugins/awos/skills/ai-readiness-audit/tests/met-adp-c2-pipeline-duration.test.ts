/**
 * Tests for adp_c2_pipeline_duration metric.
 *
 * Contracts verified:
 * - CI absent (available=false) → SKIP, sources_used=[], sources_missing=['ci']
 * - CI file missing entirely → SKIP
 * - CI config present, runs=[] (partial) → OK + MED reliability + note (NOT SKIP)
 * - CI with runs carrying duration_seconds → correct avg, status=OK, categories=[1002] when has_ci
 * - Runs without duration_seconds are excluded from avg
 * - All runs missing duration_seconds → value=null
 * - kind is "duration_seconds"
 * - band is null (no banding for this metric)
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
// Partial-source test: config present, runs absent → OK + MED reliability
// ---------------------------------------------------------------------------

test('adp_c2: OK + MED reliability when config_detected=true but runs=[]', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'ci',
    { config_detected: true, config_path: '.github/workflows', runs: [] },
    true // available=true
  );
  const result = compute(collectedDir, standards, { has_ci: true });

  assert.equal(
    result.status,
    'OK',
    'must be OK (not SKIP) when config is detected but no runs'
  );
  assert.equal(
    result.reliability.confidence,
    'MED',
    'reliability must be downgraded to MED when no run data'
  );
  assert.ok(
    result.reliability.note !== null && result.reliability.note.length > 0,
    'reliability note must explain the downgrade'
  );
  assert.equal(result.value, null, 'value must be null when no runs');
  assert.equal(result.band, null, 'band must be null (not a banded metric)');
  assert.deepEqual(result.sources_used, ['ci'], 'sources_used must include ci');
  assert.deepEqual(result.sources_missing, [], 'sources_missing must be empty');
  assert.equal(
    result.kind,
    'duration_seconds',
    'kind must be duration_seconds'
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

test('adp_c2: value=null when no run has duration_seconds', () => {
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
  assert.equal(result.status, 'OK', 'status must still be OK');
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
