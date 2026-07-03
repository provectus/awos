/**
 * Tests for adp_g5_pr_cycle_time metric.
 *
 * Contracts verified:
 * - fixture with known merge dates → expected band
 * - median computed correctly from odd/even record counts
 * - kind is "banded", categories_awarded=[501], status=OK
 * - reliability tag is "not-reliable" (git approximation, not real PR open time)
 * - SKIP when git.json absent or merge_records empty
 * - tracker tickets carrying in_progress_at + resolved_at → real workflow
 *   cycle time is used instead of the git proxy (fallback preserved otherwise)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g5_pr_cycle_time.ts';
import { gitRaw, tmpDir, writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

/** Create a merge record where merged_at is N hours after branch_first_commit_at. */
function mergeRecord(hoursApart: number): {
  merged_at: string;
  branch_first_commit_at: string;
} {
  const base = new Date('2025-03-01T12:00:00Z');
  const merged = new Date(base.getTime() + hoursApart * 3_600_000);
  return {
    branch_first_commit_at: base.toISOString(),
    merged_at: merged.toISOString(),
  };
}

test('adp_g5: < 24h cycle time → elite band', () => {
  const tmp = tmpDir('g5-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [mergeRecord(10)] })
  );

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.status,
    'OK',
    'status must be OK when merge_records present'
  );
  assert.equal(result.kind, 'banded', 'kind must be "banded"');
  assert.equal(result.band, 'elite', 'cycle time < 24h → elite band');
  assert.ok(
    result.categories_awarded.includes(501),
    'code 501 must be awarded'
  );
  assert.equal(result.metric, 'adp_g5_pr_cycle_time', 'metric id must match');
});

test('adp_g5: 48h cycle time → high band', () => {
  const tmp = tmpDir('g5-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [mergeRecord(48)] })
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'high',
    `48h cycle time must be "high", got ${result.band}`
  );
});

test('adp_g5: 240h cycle time → medium band', () => {
  const tmp = tmpDir('g5-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [mergeRecord(240)] })
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'medium',
    `240h cycle time must be "medium", got ${result.band}`
  );
});

test('adp_g5: >= 720h cycle time → low band', () => {
  const tmp = tmpDir('g5-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [mergeRecord(800)] })
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'low',
    `800h cycle time must be "low", got ${result.band}`
  );
});

test('adp_g5: median from odd count of records', () => {
  const tmp = tmpDir('g5-');
  // Cycle times: 10h, 50h, 300h → median = 50h → high
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({
      merge_records: [mergeRecord(10), mergeRecord(50), mergeRecord(300)],
    })
  );

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs((result.value as number) - 50) < 0.001,
    `median of [10,50,300] must be 50, got ${result.value}`
  );
  assert.equal(result.band, 'high', 'median 50h → high band');
});

test('adp_g5: median from even count of records', () => {
  const tmp = tmpDir('g5-');
  // Cycle times: 12h, 36h → median = 24h → high (>=24 so not elite)
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [mergeRecord(12), mergeRecord(36)] })
  );

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs((result.value as number) - 24) < 0.001,
    `median of [12,36] must be 24, got ${result.value}`
  );
  assert.equal(
    result.band,
    'high',
    'median 24h is not elite (requires <24), must be high'
  );
});

test('adp_g5: reliability tag is not-reliable (git approximation)', () => {
  const tmp = tmpDir('g5-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [mergeRecord(20)] })
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability must be "not-reliable" — branch_first_commit is not PR open time'
  );
});

test('adp_g5: SKIP when git.json absent', () => {
  const tmp = tmpDir('g5-');
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json absent');
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g5: SKIP when merge_records empty', () => {
  const tmp = tmpDir('g5-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [] })
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when no merge records to compute from'
  );
});

// ---------------------------------------------------------------------------
// Phase 3b: score/confidence contracts (identical formula to adp_g4_lead_time)
// ---------------------------------------------------------------------------

test('adp_g5: score=0.75 and confidence=1.0 when median cycle time is 24h (DORA high anchor)', () => {
  const tmp = tmpDir('g5-');
  const base = new Date('2025-01-01T00:00:00Z');
  const merged = new Date(base.getTime() + 24 * 3_600_000);
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({
      merge_records: [
        {
          branch_first_commit_at: base.toISOString(),
          merged_at: merged.toISOString(),
        },
      ],
    })
  );

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs(result.score - 0.75) < 0.0001,
    `score must be 0.75 at 24h median cycle time, got ${result.score}`
  );
  assert.equal(result.confidence, 1.0, 'confidence must be 1.0');
});

test('adp_g5: score=0 and confidence=0 on SKIP', () => {
  const tmp = tmpDir('g5-');
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});

test('adp_g5: squash-merge strategy → SKIP (merge-record proxy unavailable)', () => {
  const tmp = tmpDir('g5-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({
      merge_records: [mergeRecord(12)],
      window_stats: { merge_strategy: 'squash' },
    })
  );
  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'squash-merge repos must SKIP the PR-cycle merge-record proxy'
  );
});

// ---------------------------------------------------------------------------
// Tracker workflow history (in_progress_at → resolved_at)
// ---------------------------------------------------------------------------

/** Write a tracker.json with the given tickets next to the collected dir. */
function writeTracker(
  collectedDir: string,
  tickets: Array<Record<string, unknown>>,
  available = true
): void {
  writeFileSync(
    join(collectedDir, 'tracker.json'),
    JSON.stringify({ source: 'tracker', available, raw: { tickets } })
  );
}

test('adp_g5: tracker in_progress_at→resolved_at replaces the git proxy when present', () => {
  const tmp = tmpDir('g5-');
  // Git proxy would say 700h; tracker workflow history says 12h median.
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [mergeRecord(700)] })
  );
  writeTracker(collectedDir, [
    {
      id: 'PROJ-1',
      in_progress_at: '2025-03-01T00:00:00Z',
      resolved_at: '2025-03-01T12:00:00Z',
    },
    {
      id: 'PROJ-2',
      in_progress_at: '2025-03-02T00:00:00Z',
      resolved_at: '2025-03-02T12:00:00Z',
    },
  ]);

  const result = compute(collectedDir, standards, {});
  assert.equal(result.status, 'OK', 'status must be OK with tracker history');
  assert.ok(
    Math.abs((result.value as number) - 12) < 1e-6,
    `value must be the tracker in-progress→done median (12h), not the git proxy (700h), got ${result.value}`
  );
  assert.equal(
    result.band,
    'elite',
    '12h workflow cycle time must band elite (< 24h)'
  );
  assert.deepEqual(
    result.sources_used,
    ['tracker'],
    'sources_used must name tracker when workflow history supplied the value'
  );
  assert.equal(
    result.reliability.confidence,
    'HIGH',
    'confidence is HIGH when the value comes from real workflow history'
  );
});

test('adp_g5: tickets without in_progress_at fall back to the git proxy', () => {
  const tmp = tmpDir('g5-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [mergeRecord(10)] })
  );
  // Tracker connected, but no ticket carries workflow history.
  writeTracker(collectedDir, [
    { id: 'PROJ-1', resolved_at: '2025-03-01T12:00:00Z' },
    { id: 'PROJ-2', status: 'In Progress' },
  ]);

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs((result.value as number) - 10) < 1e-6,
    `without in_progress_at the git proxy (10h) must be used, got ${result.value}`
  );
  assert.deepEqual(
    result.sources_used,
    ['git'],
    'sources_used must stay git-only when tracker lacks workflow history'
  );
});

test('adp_g5: tracker workflow history rescues a squash-merge repo from the null proxy', () => {
  const tmp = tmpDir('g5-');
  // Squash workflow: the git proxy is unrepresentative and normally yields null.
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({
      merge_records: [mergeRecord(5)],
      window_stats: { merge_strategy: 'squash' },
    })
  );
  writeTracker(collectedDir, [
    {
      id: 'PROJ-1',
      in_progress_at: '2025-03-01T00:00:00Z',
      resolved_at: '2025-03-03T00:00:00Z',
    },
  ]);

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'OK',
    'a squash repo with tracker workflow history must be scored, not nulled'
  );
  assert.ok(
    Math.abs((result.value as number) - 48) < 1e-6,
    `value must come from the tracker (48h), got ${result.value}`
  );
});

// ---------------------------------------------------------------------------
// SKIP-reason precision: a connected tracker whose tickets lack workflow
// history must be named as such — not folded into "needs a connector".
// ---------------------------------------------------------------------------

test('adp_g5: squash repo + tracker without status-transition history → reason says changelog not fetched', () => {
  const tmp = tmpDir('g5-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({
      merge_records: [mergeRecord(12)],
      window_stats: { merge_strategy: 'squash' },
    })
  );
  // Tracker IS connected, but tickets carry only created/resolved dates —
  // no in_progress_at (per-ticket changelog never fetched).
  writeTracker(collectedDir, [
    { id: 'PROJ-1', resolved_at: '2025-03-01T12:00:00Z' },
    { id: 'PROJ-2', resolved_at: '2025-03-02T12:00:00Z' },
  ]);

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'squash repo without tracker workflow history must still SKIP'
  );
  assert.ok(
    (result.reliability.note ?? '').includes(
      'tracker connected but tickets lack per-ticket status-transition history (changelog not fetched)'
    ),
    `SKIP reason must say the tracker is connected but its changelog was not fetched; got: ${result.reliability.note}`
  );
});

test('adp_g5: squash repo with NO tracker keeps the generic needs-connector reason', () => {
  const tmp = tmpDir('g5-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({
      merge_records: [mergeRecord(12)],
      window_stats: { merge_strategy: 'squash' },
    })
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(result.status, 'SKIP', 'squash repo without tracker must SKIP');
  assert.ok(
    (result.reliability.note ?? '').includes(
      'connect a code-host connector (PR API) to measure this'
    ),
    `without any tracker the generic connector guidance must remain; got: ${result.reliability.note}`
  );
  assert.ok(
    !(result.reliability.note ?? '').includes('tracker connected'),
    'without a tracker the reason must not claim one is connected'
  );
});

test('adp_g5: tracker path appends the partial-fetch note from fetch_meta', () => {
  const tmp = tmpDir('g5-');
  const collectedDir = writeCollected(
    tmp,
    'git',
    gitRaw({ merge_records: [mergeRecord(700)] })
  );
  writeFileSync(
    join(collectedDir, 'tracker.json'),
    JSON.stringify({
      source: 'tracker',
      available: true,
      raw: {
        tickets: [
          {
            id: 'PROJ-1',
            in_progress_at: '2025-03-01T00:00:00Z',
            resolved_at: '2025-03-01T12:00:00Z',
          },
        ],
        fetch_meta: { tickets_fetched: 100, tickets_total: 432 },
      },
    })
  );

  const result = compute(collectedDir, standards, {});
  assert.equal(result.status, 'OK', 'tracker workflow history must score');
  assert.ok(
    (result.reliability.note ?? '').includes(
      'partial tracker fetch: 100 of 432 tickets'
    ),
    `tracker-path reliability note must disclose the partial fetch; got: ${result.reliability.note}`
  );
});
