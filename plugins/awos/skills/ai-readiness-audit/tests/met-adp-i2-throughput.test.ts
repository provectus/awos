/**
 * Tests for adp_i2_throughput metric.
 *
 * Contracts verified:
 * - tracker absent (file missing) → SKIP, sources_used=[], sources_missing=['tracker']
 * - tracker available=false → SKIP
 * - tracker with resolved_count=0 → OK, value=0, kind="rate", score=0 (worst case)
 * - tracker with resolved_count=42 → OK, value=42
 * - kind is "rate"
 * - reliability.tag is "not-reliable"
 * - categories_awarded=[1102] only when topology.has_tracker=true
 * - band is always null (no band label; the score is banded by resolved/week)
 * - score: 0 at zero throughput, 1.0 at ≥10 resolved/week, in-between otherwise
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_i2_throughput.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'i2-'));
}

// ---------------------------------------------------------------------------
// Absence / SKIP tests
// ---------------------------------------------------------------------------

test('adp_i2: SKIP when tracker.json file is missing', () => {
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

test('adp_i2: SKIP when tracker artifact has available=false', () => {
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
// Value / status tests
// ---------------------------------------------------------------------------

test('adp_i2: resolved_count=0 → OK, value=0', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { bug: 2 },
    resolved_count: 0,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, { has_tracker: true });

  assert.equal(result.status, 'OK', 'status must be OK when tracker available');
  assert.equal(result.kind, 'rate', 'kind must be "rate"');
  assert.equal(result.value, 0, 'value must be 0 when no resolved tickets');
  assert.equal(result.band, null, 'band must be null (no band label for rate)');
  assert.equal(result.metric, 'adp_i2_throughput', 'metric id must match');
  assert.equal(
    result.score,
    0,
    'score must be 0 when nothing was resolved in the window (worst case)'
  );
});

test('adp_i2: resolved_count=42 → OK, value=42', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { feature: 25, bug: 17 },
    resolved_count: 42,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, { has_tracker: true });

  assert.equal(result.status, 'OK', 'status must be OK');
  assert.equal(result.value, 42, 'value must equal resolved_count');
  assert.ok(
    result.categories_awarded.includes(1102),
    'code 1102 must be awarded when topology.has_tracker=true'
  );
});

test('adp_i2: resolved_count=7 → OK, value=7, sources include tracker', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { story: 7 },
    resolved_count: 7,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, { has_tracker: true });

  assert.equal(result.value, 7, 'value must be 7');
  assert.deepEqual(
    result.sources_used,
    ['tracker'],
    'sources_used must include tracker'
  );
  assert.deepEqual(result.sources_missing, [], 'sources_missing must be empty');
});

// ---------------------------------------------------------------------------
// Reliability and category tests
// ---------------------------------------------------------------------------

test('adp_i2: reliability tag is not-reliable', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { feature: 5 },
    resolved_count: 5,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability tag must be "not-reliable"'
  );
  assert.equal(
    result.reliability.confidence,
    'HIGH',
    'confidence must be HIGH when tracker is fully available'
  );
});

test('adp_i2: categories_awarded empty when topology.has_tracker=false', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { feature: 5 },
    resolved_count: 5,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, {});
  assert.deepEqual(
    result.categories_awarded,
    [],
    'no category 1102 when topology.has_tracker is false'
  );
});

// ---------------------------------------------------------------------------
// Phase 3b: score/confidence contracts
// ---------------------------------------------------------------------------

test('adp_i2: best case — ≥10 resolved/week scores 1.0 with confidence 1.0', () => {
  const tmp = makeTmpDir();
  // writeCollected pins lookback_days=730 (≈104 weeks); 1100 resolved ≈ 10.5/wk.
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { story: 5, bug: 3 },
    resolved_count: 1100,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, { has_tracker: true });
  assert.equal(
    result.score,
    1.0,
    'score must be 1.0 at ≥10 resolved tickets/week (best-case throughput)'
  );
  assert.equal(
    result.confidence,
    1.0,
    'confidence must be 1.0 when tracker connected'
  );
});

test('adp_i2: mid throughput scores strictly between 0 and 1', () => {
  const tmp = makeTmpDir();
  // 42 resolved over 730 days ≈ 0.4/wk — real but low flow.
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { story: 5, bug: 3 },
    resolved_count: 42,
    incident_source: null,
  });

  const result = compute(collectedDir, standards, { has_tracker: true });
  assert.ok(
    result.score > 0 && result.score < 1,
    `a low-but-nonzero resolved/week rate must score strictly between 0 and 1, got ${result.score}`
  );
  assert.match(
    result.expression ?? '',
    /\/week/,
    'expression must state the per-week rate the score is banded on'
  );
});

test('adp_i2: score=0 and confidence=0 on SKIP (tracker absent)', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});
