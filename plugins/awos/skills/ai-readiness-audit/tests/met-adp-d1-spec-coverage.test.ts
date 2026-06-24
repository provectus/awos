/**
 * Tests for adp_d1_spec_coverage metric.
 *
 * Contracts verified:
 * - docs absent (available=false) → SKIP, sources_used=[], sources_missing=['docs']
 * - docs file missing entirely → SKIP
 * - docs available with pages → OK, freshness coverage = recently_updated / page_count
 * - docs available with no pages (page_count=0) → OK, value=0 (not SKIP)
 * - docs with all pages recent → value=1.0
 * - docs with no recent pages → value=0
 * - categories_awarded=[1201] only when topology.has_docs_connector=true
 * - kind is "coverage"
 * - band is null
 * - reliability.tag is "not-reliable"
 * - reliability.confidence is HIGH when docs available
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_d1_spec_coverage.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'd1-'));
}

// ---------------------------------------------------------------------------
// Absence / SKIP tests
// ---------------------------------------------------------------------------

test('adp_d1: SKIP when docs.json file is missing', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when docs.json is absent');
  assert.deepEqual(result.sources_used, [], 'sources_used must be empty');
  assert.deepEqual(
    result.sources_missing,
    ['docs'],
    'sources_missing must include docs'
  );
});

test('adp_d1: SKIP when docs artifact has available=false', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'docs',
    { pages: [], page_count: 0, recently_updated_count: 0 },
    false // available=false
  );
  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when docs available=false (no connector)'
  );
  assert.deepEqual(result.sources_used, [], 'sources_used must be empty');
});

// ---------------------------------------------------------------------------
// Full-data tests
// ---------------------------------------------------------------------------

test('adp_d1: value=1.0 when all pages recently updated', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'docs',
    { pages: [], page_count: 10, recently_updated_count: 10 },
    true
  );
  const result = compute(collectedDir, standards, { has_docs_connector: true });

  assert.equal(result.status, 'OK', 'status must be OK');
  assert.equal(result.kind, 'coverage', 'kind must be coverage');
  assert.equal(result.band, null, 'band must be null');
  assert.equal(result.value, 1.0, 'coverage must be 1.0 when all pages recent');
  assert.equal(
    result.reliability.confidence,
    'HIGH',
    'reliability must be HIGH when docs connector available'
  );
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability tag must be not-reliable'
  );
  assert.ok(
    result.categories_awarded.includes(1201),
    'code 1201 must be awarded when topology.has_docs_connector=true'
  );
});

test('adp_d1: partial freshness coverage', () => {
  const tmp = makeTmpDir();
  // 6 out of 20 pages recently updated → 0.3
  const collectedDir = writeCollected(
    tmp,
    'docs',
    { pages: [], page_count: 20, recently_updated_count: 6 },
    true
  );
  const result = compute(collectedDir, standards, { has_docs_connector: true });

  assert.ok(
    Math.abs((result.value as number) - 0.3) < 0.001,
    `expected coverage 0.3, got ${result.value}`
  );
});

test('adp_d1: value=0 when no pages recently updated', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'docs',
    { pages: [], page_count: 5, recently_updated_count: 0 },
    true
  );
  const result = compute(collectedDir, standards, { has_docs_connector: true });

  assert.equal(result.value, 0, 'coverage must be 0 when no pages recent');
  assert.equal(result.status, 'OK', 'status must still be OK');
});

test('adp_d1: value=0 when page_count=0 (no docs at all)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'docs',
    { pages: [], page_count: 0, recently_updated_count: 0 },
    true
  );
  const result = compute(collectedDir, standards, { has_docs_connector: true });

  // No docs is a valid finding: value=0, not SKIP.
  assert.equal(result.status, 'OK', 'must be OK even when page_count=0');
  assert.equal(
    result.value,
    0,
    'coverage must be 0 when there are no pages at all'
  );
});

test('adp_d1: categories_awarded empty when topology.has_docs_connector=false', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'docs',
    { pages: [], page_count: 10, recently_updated_count: 5 },
    true
  );
  const result = compute(collectedDir, standards, {});
  assert.deepEqual(
    result.categories_awarded,
    [],
    'no category 1201 when topology.has_docs_connector is false'
  );
});

test('adp_d1: sources_used and sources_missing correct on success', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'docs',
    { pages: [], page_count: 3, recently_updated_count: 2 },
    true
  );
  const result = compute(collectedDir, standards, { has_docs_connector: true });

  assert.deepEqual(
    result.sources_used,
    ['docs'],
    'sources_used must include docs'
  );
  assert.deepEqual(
    result.sources_missing,
    [],
    'sources_missing must be empty on full data'
  );
});
