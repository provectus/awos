/**
 * Tests for the mttr metric's real incident-source branch (DF-07).
 * The git-proxy fallback is covered by met-mttr.test.ts and metrics/mttr.test.ts;
 * here we verify that a connected incidents artifact takes precedence and is
 * measured, awarded, and reliability-upgraded.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../metrics/mttr.ts';
import { tmpDir, writeCollected, loadStandards, gitRaw } from './helpers.ts';

const standards = loadStandards();

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** incidents.json raw payload with the given resolved durations (hours). */
function incidentsRaw(durations: number[]) {
  const base = Date.parse('2026-07-01T00:00:00Z');
  return {
    incidents: durations.map((h, i) => ({
      id: `INC-${i}`,
      started_at: new Date(base).toISOString(),
      resolved_at: new Date(base + h * 3_600_000).toISOString(),
    })),
    count: durations.length,
    resolved_count: durations.length,
    median_duration_hours: median(durations),
    source_label: 'PagerDuty',
  };
}

test('mttr: connected incident source is measured (maximal reliability, awarded)', () => {
  const tmp = tmpDir('mttr-inc-');
  const dir = writeCollected(tmp, 'incidents', incidentsRaw([1, 3])); // median 2h
  const res = compute(dir, standards, { has_incident_source: true });

  assert.equal(res.status, 'OK');
  assert.equal(res.value, 2, 'value is the median recovery time in hours');
  assert.equal(res.band, 'high', '2h → high band');
  assert.equal(res.reliability.tag, 'maximal', 'real incident data → maximal');
  assert.deepEqual(res.sources_used, ['incidents']);
  assert.ok(
    res.categories_awarded.includes(1103),
    '1103 awarded when a real incident source is present'
  );
});

test('mttr: incidents artifact with no resolved incidents falls back to the git proxy', () => {
  const tmp = tmpDir('mttr-inc-');
  // Incidents present but nothing resolved → fall through to git proxy.
  writeCollected(tmp, 'incidents', incidentsRaw([]));
  const dir = writeCollected(
    tmp,
    'git',
    gitRaw({
      merge_records: [
        {
          branch_first_commit_at: '2026-07-01T00:00:00Z',
          merged_at: '2026-07-01T02:00:00Z', // 2h branch lifetime
        },
      ],
      total_merges: 1,
    })
  );
  const res = compute(dir, standards, {});
  // Git-proxy tier: not-reliable, and the incidents source is not used.
  assert.equal(
    res.reliability.tag,
    'not-reliable',
    'proxy fallback stays not-reliable'
  );
  assert.deepEqual(res.sources_used, ['git'], 'git proxy used, not incidents');
});

test('mttr: no incidents artifact at all → unchanged git-proxy behavior', () => {
  const tmp = tmpDir('mttr-inc-');
  const dir = writeCollected(
    tmp,
    'git',
    gitRaw({
      merge_records: [
        {
          branch_first_commit_at: '2026-07-01T00:00:00Z',
          merged_at: '2026-07-01T01:00:00Z',
        },
      ],
      total_merges: 1,
    })
  );
  const res = compute(dir, standards, {});
  assert.equal(res.status, 'OK', 'never SKIP');
  assert.deepEqual(res.sources_used, ['git'], 'git proxy path');
});
