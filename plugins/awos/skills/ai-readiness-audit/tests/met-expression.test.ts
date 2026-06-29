/**
 * Tests that key computed/banded metrics emit human-readable expressions.
 *
 * Contract verified:
 * - Every computed metric must emit a human-readable expression so the report shows evidence (issue #12)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute as computeI1 } from '../metrics/adp_i1_work_mix.ts';
import { compute as computeI2 } from '../metrics/adp_i2_throughput.ts';
import { compute as computeG2 } from '../metrics/adp_g2_contributors.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'awos-expr-'));
}

test('Every computed metric must emit a human-readable expression so the report shows evidence (issue #12): adp_i1_work_mix', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { feature: 31, bug: 19 },
    resolved_count: 50,
    incident_source: null,
  });
  const result = computeI1(collectedDir, standards, { has_tracker: true });
  assert.equal(result.status, 'OK', 'status must be OK');
  assert.ok(
    typeof result.expression === 'string' && result.expression.length > 0,
    `adp_i1_work_mix must emit a non-empty expression when computing work mix, got ${JSON.stringify(result.expression)}`
  );
});

test('Every computed metric must emit a human-readable expression so the report shows evidence (issue #12): adp_i2_throughput', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'tracker', {
    tickets: [],
    type_counts: { feature: 10 },
    resolved_count: 42,
    incident_source: null,
  });
  const result = computeI2(collectedDir, standards, { has_tracker: true });
  assert.equal(result.status, 'OK', 'status must be OK');
  assert.ok(
    typeof result.expression === 'string' && result.expression.length > 0,
    `adp_i2_throughput must emit a non-empty expression when computing throughput, got ${JSON.stringify(result.expression)}`
  );
});

test('Every computed metric must emit a human-readable expression so the report shows evidence (issue #12): adp_g2_contributors', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    monthly_buckets: [
      { bucket_start: '2026-01-01', authors: 5 },
      { bucket_start: '2026-02-01', authors: 7 },
      { bucket_start: '2026-03-01', authors: 6 },
    ],
    tooling_paths: [],
    numstat_totals: { added: 0, deleted: 0 },
    merge_records: [],
  });
  const result = computeG2(collectedDir, standards, {});
  assert.equal(result.status, 'OK', 'status must be OK');
  assert.ok(
    typeof result.expression === 'string' && result.expression.length > 0,
    `adp_g2_contributors must emit a non-empty expression when computing avg contributors, got ${JSON.stringify(result.expression)}`
  );
});
