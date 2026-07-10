// _base.test.ts — unit tests for metrics/_base.ts helpers.
// (resolveSource was removed in 6a; per-category url/date fields are now the
// source of truth — see tests/standards-schema.test.ts for coverage assertions.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendReliabilityNote,
  computeReliability,
  makeMetricResult,
  trackerFetchNote,
} from './_base.ts';

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

// ---------------------------------------------------------------------------
// trackerFetchNote / appendReliabilityNote — tracker fetch-completeness signal
// ---------------------------------------------------------------------------

test('trackerFetchNote: null when fetch_meta is absent', () => {
  assert.equal(
    trackerFetchNote({ tickets: [] }),
    null,
    'raw without fetch_meta must yield no partial-fetch note'
  );
  assert.equal(
    trackerFetchNote(undefined),
    null,
    'undefined raw must yield no partial-fetch note'
  );
});

test('trackerFetchNote: null when the fetch is complete', () => {
  assert.equal(
    trackerFetchNote({
      fetch_meta: { tickets_fetched: 42, tickets_total: 42, complete: true },
    }),
    null,
    'a complete fetch (total == fetched, complete=true) must yield no note'
  );
});

test('trackerFetchNote: "partial tracker fetch: N of M tickets" when total exceeds fetched', () => {
  assert.equal(
    trackerFetchNote({
      fetch_meta: { tickets_fetched: 100, tickets_total: 432 },
    }),
    'partial tracker fetch: 100 of 432 tickets',
    'total > fetched must produce the N-of-M partial-fetch note'
  );
});

test('trackerFetchNote: complete=false alone marks the fetch partial and appends fetch_meta.note', () => {
  assert.equal(
    trackerFetchNote({
      fetch_meta: {
        tickets_fetched: 100,
        complete: false,
        note: 'single Jira page, pagination not followed',
      },
    }),
    'partial tracker fetch: 100 tickets fetched; single Jira page, pagination not followed',
    'complete=false must produce the note even without tickets_total, carrying fetch_meta.note'
  );
});

test('appendReliabilityNote: appends with a semicolon, leaves null extra untouched, never mutates', () => {
  const base = { tag: 'minimal', confidence: 'HIGH' as const, note: 'base' };
  const appended = appendReliabilityNote(base, 'extra detail');
  assert.equal(
    appended.note,
    'base; extra detail',
    'extra note must be semicolon-appended to the existing note'
  );
  assert.equal(base.note, 'base', 'input reliability must not be mutated');
  assert.equal(
    appendReliabilityNote(base, null),
    base,
    'null extra must return the input unchanged'
  );
  const fromNull = appendReliabilityNote(
    { tag: 'minimal', confidence: 'HIGH', note: null },
    'only note'
  );
  assert.equal(
    fromNull.note,
    'only note',
    'a null base note must be replaced by the extra note'
  );
});
