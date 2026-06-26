/**
 * Tests for adp_c1_ci_pass_rate metric.
 *
 * Contracts verified:
 * - CI absent (available=false) → SKIP, sources_used=[], sources_missing=['ci']
 * - CI file missing entirely → SKIP
 * - CI config-only (available=false, runs=[]) → SKIP (collector sets available=false; no longer an OK partial case)
 * - CI with runs, all success → elite band, rate=1.0, status=OK, categories=[1001] when has_ci
 * - CI with mixed runs → correct rate and band
 * - CI with no success runs → low band, rate=0
 * - kind is "banded"
 * - reliability.tag is "not-reliable"
 * - categories_awarded=[1001] only when topology.has_ci=true
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_c1_ci_pass_rate.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'c1-'));
}

// ---------------------------------------------------------------------------
// Absence / SKIP tests
// ---------------------------------------------------------------------------

test('adp_c1: SKIP when ci.json file is missing', () => {
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

test('adp_c1: SKIP when ci artifact has available=false', () => {
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

test('adp_c1: SKIP when config_detected=true but runs=[] and available=false (config-only)', () => {
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

test('adp_c1: elite band when all runs succeed', () => {
  const tmp = makeTmpDir();
  const runs = [
    { conclusion: 'success' },
    { conclusion: 'success' },
    { conclusion: 'success' },
  ];
  const collectedDir = writeCollected(
    tmp,
    'ci',
    { config_detected: true, config_path: '.github/workflows', runs },
    true
  );
  const result = compute(collectedDir, standards, { has_ci: true });

  assert.equal(result.status, 'OK', 'status must be OK');
  assert.equal(result.kind, 'banded', 'kind must be banded');
  assert.equal(result.value, 1.0, 'pass rate must be 1.0');
  assert.equal(result.band, 'elite', 'elite when rate >= 0.99');
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
    result.categories_awarded.includes(1001),
    'code 1001 must be awarded when topology.has_ci=true'
  );
});

test('adp_c1: high band at 96% pass rate', () => {
  const tmp = makeTmpDir();
  // 24 success, 1 failure → 24/25 = 0.96
  const runs = [
    ...Array(24).fill({ conclusion: 'success' }),
    { conclusion: 'failure' },
  ];
  const collectedDir = writeCollected(
    tmp,
    'ci',
    { config_detected: true, config_path: '.github/workflows', runs },
    true
  );
  const result = compute(collectedDir, standards, { has_ci: true });

  assert.equal(result.band, 'high', 'high when rate >= 0.95 and < 0.99');
  assert.ok(
    Math.abs((result.value as number) - 0.96) < 0.001,
    `expected rate ~0.96 got ${result.value}`
  );
});

test('adp_c1: medium band at 92% pass rate', () => {
  const tmp = makeTmpDir();
  // 23 success, 2 failure → 23/25 = 0.92
  const runs = [
    ...Array(23).fill({ conclusion: 'success' }),
    { conclusion: 'failure' },
    { conclusion: 'failure' },
  ];
  const collectedDir = writeCollected(
    tmp,
    'ci',
    { config_detected: true, config_path: '.github/workflows', runs },
    true
  );
  const result = compute(collectedDir, standards, { has_ci: true });

  assert.equal(result.band, 'medium', 'medium when rate >= 0.90 and < 0.95');
});

test('adp_c1: low band when all runs fail', () => {
  const tmp = makeTmpDir();
  const runs = [
    { conclusion: 'failure' },
    { conclusion: 'failure' },
    { conclusion: 'failure' },
  ];
  const collectedDir = writeCollected(
    tmp,
    'ci',
    { config_detected: true, config_path: '.github/workflows', runs },
    true
  );
  const result = compute(collectedDir, standards, { has_ci: true });

  assert.equal(result.band, 'low', 'low when rate < 0.90');
  assert.equal(result.value, 0, 'pass rate must be 0.0');
});

test('adp_c1: categories_awarded empty when topology.has_ci=false', () => {
  const tmp = makeTmpDir();
  const runs = [{ conclusion: 'success' }];
  const collectedDir = writeCollected(
    tmp,
    'ci',
    { config_detected: true, config_path: '.github/workflows', runs },
    true
  );
  // has_ci not set → category 1001 has applies_when=topology.has_ci
  const result = compute(collectedDir, standards, {});
  assert.deepEqual(
    result.categories_awarded,
    [],
    'no category 1001 when topology.has_ci is false'
  );
});
