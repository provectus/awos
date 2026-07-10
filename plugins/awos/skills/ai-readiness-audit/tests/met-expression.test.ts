/**
 * Tests that key computed/banded metrics emit human-readable expressions.
 *
 * Contract verified:
 * - Every computed metric must emit a human-readable expression so the report shows evidence (issue #12)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {} from 'node:fs';
import { join } from 'node:path';
import { compute as computeI1 } from '../metrics/work_mix_allocation.ts';
import { compute as computeI2 } from '../metrics/issue_throughput.ts';
import { compute as computeG2 } from '../metrics/active_contributors.ts';
import { writeCollected, loadStandards } from './helpers.ts';
import { tmpDir } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return tmpDir('awos-expr-');
}

test('Every computed metric must emit a human-readable expression so the report shows evidence (issue #12): work_mix_allocation', () => {
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
    `work_mix_allocation must emit a non-empty expression when computing work mix, got ${JSON.stringify(result.expression)}`
  );
});

test('Every computed metric must emit a human-readable expression so the report shows evidence (issue #12): issue_throughput', () => {
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
    `issue_throughput must emit a non-empty expression when computing throughput, got ${JSON.stringify(result.expression)}`
  );
});

test('Every computed metric must emit a human-readable expression so the report shows evidence (issue #12): active_contributors', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    window_stats: {
      window_days: 90,
      commits: 60,
      merges: 18,
      authors_total: 3,
      per_author: [
        { author: 'Alice', commits: 30, merges: 9, lines: 900 },
        { author: 'Bob', commits: 20, merges: 6, lines: 600 },
        { author: 'Carol', commits: 10, merges: 3, lines: 300 },
      ],
    },
    tooling_paths: [],
    numstat_totals: { added: 0, deleted: 0 },
    merge_records: [],
  });
  const result = computeG2(collectedDir, standards, {});
  assert.equal(result.status, 'OK', 'status must be OK');
  assert.ok(
    typeof result.expression === 'string' && result.expression.length > 0,
    `active_contributors must emit a non-empty expression when computing active contributor count, got ${JSON.stringify(result.expression)}`
  );
});
