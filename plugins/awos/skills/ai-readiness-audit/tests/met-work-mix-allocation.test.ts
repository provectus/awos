/**
 * Tests for work_mix_allocation metric.
 *
 * Contracts verified:
 * - tracker absent (file missing) → SKIP, sources_used=[], sources_missing=['tracker']
 * - tracker available=false → SKIP
 * - tracker with all growth types → elite band (>= 60%)
 * - tracker with 50% growth → high band (>= 45%)
 * - tracker with 33% growth → medium band (>= 30%)
 * - tracker with 10% growth → low band (< 30%)
 * - empty type_counts → OK, value=null (no band), sources_used=['tracker']
 * - kind is "banded"
 * - reliability.tag is "not-reliable"
 * - categories_awarded=[1101] only when topology.has_tracker=true
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/work_mix_allocation.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'i1-'));
}

// ---------------------------------------------------------------------------
// Absence / SKIP tests
// ---------------------------------------------------------------------------

test('adp_i1: SKIP when tracker.json file is missing', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when tracker.json is absent');
  assert.deepEqual(result.sources_used, [], 'sources_used must be empty');
  assert.deepEqual(
    result.sources_missing,
    ['tracker'],
    'sources_missing must include tracker'
  );
});

test('adp_i1: SKIP when tracker artifact has available=false', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'tracker',
    { tickets: [], type_counts: {}, resolved_count: 0, incident_source: null },
    false // available=false
  );
  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when tracker available=false (no connector)'
  );
  assert.deepEqual(result.sources_used, [], 'sources_used must be empty');
});

// ---------------------------------------------------------------------------
// Band tests
// ---------------------------------------------------------------------------

test('adp_i1: all feature tickets → elite band (100% growth)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { feature: 10, story: 5 },
    resolved_count: 8,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, { has_tracker: true });

  assert.equal(result.status, 'OK', 'status must be OK');
  assert.equal(result.kind, 'banded', 'kind must be "banded"');
  assert.equal(result.band, 'elite', 'elite when growth >= 60%');
  assert.ok(
    Math.abs((result.value as number) - 1.0) < 0.001,
    `growth fraction must be 1.0, got ${result.value}`
  );
  assert.ok(
    result.categories_awarded.includes(1101),
    'code 1101 must be awarded when topology.has_tracker=true'
  );
  assert.equal(result.metric, 'work_mix_allocation', 'metric id must match');
});

test('adp_i1: 50% growth → high band (>= 45%)', () => {
  const tmp = makeTmpDir();
  // 5 feature + 5 bug = 50% growth → high (>= 45%)
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { feature: 5, bug: 5 },
    resolved_count: 4,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, { has_tracker: true });

  assert.equal(result.band, 'high', 'high when growth >= 45% and < 60%');
  assert.ok(
    Math.abs((result.value as number) - 0.5) < 0.001,
    `growth fraction must be 0.5, got ${result.value}`
  );
});

test('adp_i1: 33% growth → medium band (>= 30%)', () => {
  const tmp = makeTmpDir();
  // 1 feature + 2 bug = 33% growth → medium (>= 30%)
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { feature: 1, bug: 2 },
    resolved_count: 1,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, { has_tracker: true });

  assert.equal(
    result.band,
    'medium',
    `medium when growth >= 30% and < 45%, got ${result.band} (value=${result.value})`
  );
});

test('adp_i1: 10% growth → low band (< 30%)', () => {
  const tmp = makeTmpDir();
  // 1 feature + 9 bug = 10% growth → low
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { feature: 1, bug: 9 },
    resolved_count: 2,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, { has_tracker: true });

  assert.equal(result.band, 'low', 'low when growth < 30%');
  assert.ok(
    Math.abs((result.value as number) - 0.1) < 0.001,
    `growth fraction must be 0.1, got ${result.value}`
  );
});

// ---------------------------------------------------------------------------
// Empty / null value tests
// ---------------------------------------------------------------------------

test('adp_i1: empty type_counts → OK, value=null, no band', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: {},
    resolved_count: 0,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, { has_tracker: true });

  assert.equal(result.status, 'OK', 'must be OK (tracker is available)');
  assert.equal(result.value, null, 'value must be null when no tickets');
  assert.equal(result.band, null, 'band must be null when no tickets');
  assert.deepEqual(
    result.sources_used,
    ['tracker'],
    'sources_used must include tracker'
  );
});

// ---------------------------------------------------------------------------
// Reliability and category tests
// ---------------------------------------------------------------------------

test('adp_i1: reliability tag is not-reliable', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { feature: 5 },
    resolved_count: 3,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability tag must be "not-reliable"'
  );
});

test('adp_i1: categories_awarded empty when topology.has_tracker=false', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { feature: 5 },
    resolved_count: 3,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, {});
  assert.deepEqual(
    result.categories_awarded,
    [],
    'no category 1101 when topology.has_tracker is false'
  );
});

test('adp_i1: mixed growth type names are case-insensitive', () => {
  const tmp = makeTmpDir();
  // "Feature" and "STORY" should still count as growth
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { Feature: 3, STORY: 2, bug: 5 },
    resolved_count: 4,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, { has_tracker: true });

  // 5 growth / 10 total = 50% → high
  assert.equal(result.band, 'high', 'case-insensitive type matching must work');
  assert.ok(
    Math.abs((result.value as number) - 0.5) < 0.001,
    `expected ~0.5 growth fraction, got ${result.value}`
  );
});

// ---------------------------------------------------------------------------
// Phase 3b: score/confidence contracts
// ---------------------------------------------------------------------------

test('adp_i1: score=1.0 when 100% growth work (60%+ threshold capped)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { story: 10 },
    resolved_count: 5,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, { has_tracker: true });
  assert.equal(
    result.score,
    1.0,
    'score must be 1.0 when growthFrac=1.0 (clamp01(1.0/0.6) = 1.0)'
  );
  assert.equal(result.confidence, 1.0, 'confidence must be 1.0');
});

test('adp_i1: score=0.5 when 30% growth work (half of 60% threshold)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { story: 3, bug: 7 },
    resolved_count: 5,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, { has_tracker: true });
  // growthFrac = 3/10 = 0.3; score = clamp01(0.3/0.6) = 0.5
  assert.ok(
    Math.abs(result.score - 0.5) < 0.0001,
    `score must be 0.5 when growthFrac=0.3 (= 0.3/0.6), got ${result.score}`
  );
});

test('adp_i1: score=0 and confidence=0 on SKIP (tracker absent)', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});
