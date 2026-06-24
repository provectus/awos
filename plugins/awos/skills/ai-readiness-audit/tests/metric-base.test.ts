import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReliability, makeMetricResult } from '../metrics/_base.ts';

test('reliability HIGH when all present', () => {
  const r = computeReliability('maximal', ['git'], []);
  assert.equal(r.tag, 'maximal');
  assert.equal(r.confidence, 'HIGH');
  assert.ok(r.note === null || r.note === '');
});

test('reliability downgrades on a missing source', () => {
  const r = computeReliability('maximal', ['git'], ['ci']);
  assert.ok(['MED', 'LOW'].includes(r.confidence));
  assert.match(r.note.toLowerCase(), /ci/);
});

test('SKIP when no sources used', () => {
  const res = makeMetricResult(
    'adp_c1',
    null,
    'raw',
    [],
    computeReliability('not-reliable', [], ['ci']),
    [],
    ['ci']
  );
  assert.equal(res.status, 'SKIP');
});

test('OK when at least one source', () => {
  const res = makeMetricResult(
    'adp_g1',
    0.5,
    'coverage',
    [101],
    computeReliability('maximal', ['git'], []),
    ['git'],
    []
  );
  assert.equal(res.status, 'OK');
  assert.deepEqual(res.categories_awarded, [101]);
  assert.equal(res.kind, 'coverage');
});
