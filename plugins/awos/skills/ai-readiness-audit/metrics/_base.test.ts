// _base.test.ts — unit tests for metrics/_base.ts helpers.
// (resolveSource was removed in 6a; per-category url/date fields are now the
// source of truth — see tests/standards-schema.test.ts for coverage assertions.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReliability, makeMetricResult } from './_base.ts';

test('computeReliability: HIGH when all sources present', () => {
  const r = computeReliability('maximal', ['git'], []);
  assert.equal(r.tag, 'maximal', 'tag must pass through unchanged');
  assert.equal(
    r.confidence,
    'HIGH',
    'confidence must be HIGH when no sources are missing'
  );
  assert.ok(
    r.note === null || r.note === '',
    'note must be null when nothing is missing'
  );
});

test('computeReliability: downgrades on a missing source', () => {
  const r = computeReliability('maximal', ['git'], ['ci']);
  assert.ok(
    ['MED', 'LOW'].includes(r.confidence),
    'confidence must degrade when a source is missing'
  );
  assert.match(r.note.toLowerCase(), /ci/, 'note must name the missing source');
});

test('makeMetricResult: status SKIP when no sources used', () => {
  const res = makeMetricResult(
    'adp_c1',
    null,
    'raw',
    [],
    computeReliability('not-reliable', [], ['ci']),
    [],
    ['ci']
  );
  assert.equal(
    res.status,
    'SKIP',
    'status must be SKIP when sourcesUsed is empty'
  );
});

test('makeMetricResult: status OK when at least one source used', () => {
  const res = makeMetricResult(
    'adp_g1',
    0.5,
    'coverage',
    [101],
    computeReliability('maximal', ['git'], []),
    ['git'],
    []
  );
  assert.equal(res.status, 'OK', 'status must be OK when a source is used');
  assert.deepEqual(
    res.categories_awarded,
    [101],
    'categories_awarded must match input'
  );
  assert.equal(res.kind, 'coverage', 'kind must pass through unchanged');
});
