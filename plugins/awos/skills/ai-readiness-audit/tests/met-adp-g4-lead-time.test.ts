/**
 * Tests for adp_g4_lead_time metric.
 *
 * Contracts verified:
 * - fixture with known merge dates → expected band
 * - median computed correctly from odd/even record counts
 * - kind is "banded", categories_awarded=[401], status=OK
 * - reliability tag is "minimal" (git approximation)
 * - SKIP when git.json absent or merge_records empty
 * - window_start filter: only in-window records counted when window_start present
 * - graceful fallback: all records used when window_stats/window_start absent
 * - weight_max === 10 for lead_time_for_change in standards.toml
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g4_lead_time.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g4-'));
}

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

test('adp_g4: < 24h lead time → elite band', () => {
  const tmp = makeTmpDir();
  // Single merge record with 12-hour lead time → elite
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(12)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 5,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 20, deleted: 5 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.status,
    'OK',
    'status must be OK when merge_records present'
  );
  assert.equal(result.kind, 'banded', 'kind must be "banded"');
  assert.equal(result.band, 'elite', 'lead time < 24h → elite band');
  assert.ok(
    result.categories_awarded.includes(401),
    'code 401 must be awarded'
  );
  assert.equal(result.metric, 'adp_g4_lead_time', 'metric id must match');
});

test('adp_g4: 48h lead time → high band (< 1 week)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(48)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 5,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 20, deleted: 5 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'high',
    `48h lead time must be "high", got ${result.band}`
  );
});

test('adp_g4: 240h lead time → medium band (< 1 month)', () => {
  const tmp = makeTmpDir();
  // 240 hours = 10 days, < 720h (30 days) → medium
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(240)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 5,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 20, deleted: 5 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'medium',
    `240h lead time must be "medium", got ${result.band}`
  );
});

test('adp_g4: >= 720h lead time → low band', () => {
  const tmp = makeTmpDir();
  // 800 hours > 720h (30 days) → low
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(800)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 5,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 20, deleted: 5 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.band,
    'low',
    `800h lead time must be "low", got ${result.band}`
  );
});

test('adp_g4: median from odd count of records', () => {
  const tmp = makeTmpDir();
  // Lead times: 10h, 50h, 300h → median = 50h → high
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(10), mergeRecord(50), mergeRecord(300)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 10,
    ai_marked_commits: 0,
    total_merges: 3,
    revert_merges: 0,
    numstat_totals: { added: 50, deleted: 10 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs((result.value as number) - 50) < 0.001,
    `median of [10,50,300] must be 50, got ${result.value}`
  );
  assert.equal(result.band, 'high', 'median 50h → high band');
});

test('adp_g4: median from even count of records', () => {
  const tmp = makeTmpDir();
  // Lead times: 12h, 36h → median = 24h → high (just at boundary, <168)
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(12), mergeRecord(36)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 5,
    ai_marked_commits: 0,
    total_merges: 2,
    revert_merges: 0,
    numstat_totals: { added: 30, deleted: 5 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs((result.value as number) - 24) < 0.001,
    `median of [12,36] must be 24, got ${result.value}`
  );
  // 24h = exactly 1 day, which is NOT < 24, so → high
  assert.equal(
    result.band,
    'high',
    'median 24h is not elite (requires <24), must be high'
  );
});

test('adp_g4: reliability tag is minimal (git approximation)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [mergeRecord(20)],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 5,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 20, deleted: 5 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.reliability.tag,
    'minimal',
    'reliability must be "minimal" — git-approximated branch-first-commit is a lower bound'
  );
});

test('adp_g4: SKIP when git.json absent', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.status, 'SKIP', 'must SKIP when git.json absent');
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g4: SKIP when merge_records empty', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [],
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 2,
    ai_marked_commits: 0,
    total_merges: 0,
    revert_merges: 0,
    numstat_totals: { added: 5, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when no merge records to compute from'
  );
});

// ---------------------------------------------------------------------------
// Phase 3b: score/confidence contracts
// ---------------------------------------------------------------------------

test('adp_g4: score=0.75 and confidence=1.0 when median lead time is 24h (DORA high anchor)', () => {
  const tmp = makeTmpDir();
  // Single merge record with 24h lead time → median = 24h → score = 0.75 (log anchor)
  const base = new Date('2025-01-01T00:00:00Z');
  const merged = new Date(base.getTime() + 24 * 3_600_000);
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [
      {
        branch_first_commit_at: base.toISOString(),
        merged_at: merged.toISOString(),
      },
    ],
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 2, commits: 10, merges: 1 },
    ],
    tooling_paths: [],
    total_commits: 10,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 50, deleted: 10 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs(result.score - 0.75) < 0.0001,
    `score must be 0.75 at 24h median lead time (log anchor), got ${result.score}`
  );
  assert.equal(
    result.confidence,
    1.0,
    'confidence must be 1.0 when git data available'
  );
});

test('adp_g4: score=1.0 when median lead time is <= 1h (below first anchor)', () => {
  const tmp = makeTmpDir();
  const base = new Date('2025-01-01T00:00:00Z');
  const merged = new Date(base.getTime() + 1 * 3_600_000);
  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [
      {
        branch_first_commit_at: base.toISOString(),
        merged_at: merged.toISOString(),
      },
    ],
    monthly_buckets: [
      { bucket_start: '2025-01-01', authors: 2, commits: 5, merges: 1 },
    ],
    tooling_paths: [],
    total_commits: 5,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 20, deleted: 5 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.score,
    1.0,
    'score must be 1.0 when lead time <= 1h (clamps to first anchor)'
  );
});

test('adp_g4: score=0 and confidence=0 on SKIP', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});

// ---------------------------------------------------------------------------
// window_start filter (Task 2.1)
// ---------------------------------------------------------------------------

test('adp_g4: window_start filter — only in-window records count toward median', () => {
  // Fixture design:
  //   window_start = 2025-01-15T00:00:00Z
  //   Record A (IN-WINDOW):  merged_at = 2025-02-01T12:00:00Z, branch started 2025-02-01T00:00:00Z → 12h lead time
  //   Record B (OUT-OF-WINDOW): merged_at = 2025-01-10T00:00:00Z, branch started 2025-01-01T00:00:00Z → 216h lead time
  //
  // Without filtering: median of [12h, 216h] = (12+216)/2 = 114h → "high" band
  // With filtering (only Record A): median of [12h] = 12h → "elite" band
  // If the result is "elite", the filter worked correctly.
  const tmp = makeTmpDir();
  const windowStart = '2025-01-15T00:00:00.000Z';

  const inWindowRecord = {
    branch_first_commit_at: '2025-02-01T00:00:00.000Z',
    merged_at: '2025-02-01T12:00:00.000Z', // 12h after branch start, merged_at Feb 1 > Jan 15 → IN
  };
  const outOfWindowRecord = {
    branch_first_commit_at: '2025-01-01T00:00:00.000Z',
    merged_at: '2025-01-10T00:00:00.000Z', // 9d=216h lead time, merged_at Jan 10 < Jan 15 → OUT
  };

  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [outOfWindowRecord, inWindowRecord],
    window_stats: {
      window_days: 90,
      window_start: windowStart,
      merges: 1,
      commits: 0,
      authors_total: 0,
      per_author: [],
      merges_per_active: null,
      loc_per_active: null,
    },
    tooling_paths: [],
    total_commits: 2,
    ai_marked_commits: 0,
    total_merges: 2,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.status,
    'OK',
    'status must be OK when at least one in-window record is present'
  );
  assert.equal(
    result.band,
    'elite',
    `only the 12h in-window record must count toward median; ` +
      `if "high" (114h) the out-of-window 216h record was incorrectly included`
  );
  assert.ok(
    Math.abs((result.value as number) - 12) < 0.001,
    `median must be 12h (only the in-window record); got ${result.value}`
  );
});

test('adp_g4: window_start filter is chronological, not lexicographic (non-UTC merged_at offset)', () => {
  // Regression: merged_at comes from git %cI in the committer's LOCAL timezone
  // (e.g. "...-08:00"), while window_start is UTC from toISOString() ("...Z").
  // A naive string compare (merged_at >= window_start) is NOT chronological for
  // mixed-offset ISO-8601 timestamps, so a commit within ~14h of the boundary is
  // mis-included/excluded. This fixture crafts exactly such a boundary case.
  //
  //   window_start = 2025-01-15T00:00:00.000Z
  //   record merged_at = 2025-01-14T20:00:00-08:00  ==  2025-01-15T04:00:00Z
  //     → chronologically 4h AFTER window_start → IN window
  //     → but lexicographically "2025-01-14T..." < "2025-01-15T..." → string compare EXCLUDES it
  //   branch_first_commit_at = 2025-01-14T16:00:00.000Z → 12h lead time → elite band
  //
  // With the (buggy) string compare: the only record is excluded → SKIP.
  // With chronological (epoch) compare: record is included → OK, elite band.
  const tmp = makeTmpDir();
  const windowStart = '2025-01-15T00:00:00.000Z';

  const boundaryRecord = {
    branch_first_commit_at: '2025-01-14T16:00:00.000Z', // 12h before merge
    merged_at: '2025-01-14T20:00:00-08:00', // = 2025-01-15T04:00:00Z, INSIDE window
  };

  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [boundaryRecord],
    window_stats: {
      window_days: 90,
      window_start: windowStart,
      merges: 1,
      commits: 0,
      authors_total: 0,
      per_author: [],
      merges_per_active: null,
      loc_per_active: null,
    },
    tooling_paths: [],
    total_commits: 1,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.status,
    'OK',
    'record at 2025-01-15T04:00:00Z (from -08:00 offset) is chronologically inside the window and must be INCLUDED; ' +
      'a SKIP here means the filter used a lexicographic string compare that wrongly excluded it'
  );
  assert.equal(
    result.band,
    'elite',
    'the included 12h-lead record must yield elite band'
  );
  assert.ok(
    Math.abs((result.value as number) - 12) < 0.001,
    `median must be 12h (the in-window boundary record); got ${result.value}`
  );
});

test('adp_g4: window_start absent → all records used (graceful fallback)', () => {
  // When window_stats is absent from the artifact, the metric falls back to
  // using ALL merge_records. This preserves backward compatibility with artifacts
  // collected before window_start was added to the WindowStats shape.
  //
  // Fixture: two records with 12h and 800h lead times; no window_stats.
  // Without fallback (incorrect): zero records → SKIP.
  // With fallback (correct): median of [12h, 800h] = 406h → "low" band.
  const tmp = makeTmpDir();

  const record12h = {
    branch_first_commit_at: '2025-02-01T00:00:00.000Z',
    merged_at: '2025-02-01T12:00:00.000Z', // 12h lead time
  };
  // 800h = 33 days + 8 hours after 2025-01-10T00:00:00Z = 2025-02-12T08:00:00Z
  const record800h = {
    branch_first_commit_at: '2025-01-10T00:00:00.000Z',
    merged_at: '2025-02-12T08:00:00.000Z', // 800h lead time
  };

  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [record12h, record800h],
    // no window_stats — simulates an older artifact or collector without window_start
    tooling_paths: [],
    total_commits: 2,
    ai_marked_commits: 0,
    total_merges: 2,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.status,
    'OK',
    'status must be OK — both records used when window_start absent (fallback to all records)'
  );
  assert.ok(
    (result.value as number) > 400,
    `median must include both records (> 400h); got ${result.value} — value near 12 means only the in-window record was used despite no window_start`
  );
});

test('adp_g4: SKIP when all records are outside the window', () => {
  // When window_start filters ALL records out, the metric must SKIP (no valid data).
  const tmp = makeTmpDir();
  const windowStart = '2025-06-01T00:00:00.000Z';

  const oldRecord = {
    branch_first_commit_at: '2025-01-01T00:00:00.000Z',
    merged_at: '2025-01-02T00:00:00.000Z', // well before window_start
  };

  const collectedDir = writeCollected(tmp, 'git', {
    merge_records: [oldRecord],
    window_stats: {
      window_days: 90,
      window_start: windowStart,
      merges: 0,
      commits: 0,
      authors_total: 0,
      per_author: [],
      merges_per_active: null,
      loc_per_active: null,
    },
    tooling_paths: [],
    total_commits: 1,
    ai_marked_commits: 0,
    total_merges: 1,
    revert_merges: 0,
    numstat_totals: { added: 0, deleted: 0 },
    default_branch: 'main',
  });

  const result = compute(collectedDir, standards, {});
  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when all merge_records are outside the window (no valid in-window lead times)'
  );
});

// ---------------------------------------------------------------------------
// Weight contract — parse standards.toml directly
// ---------------------------------------------------------------------------

test('adp_g4: lead_time_for_change weight is 10 in standards.toml (Task 2.1)', () => {
  // The lead_time_for_change category was bumped from 5 → 10 in Task 2.1 because
  // lead time is a headline DORA signal.
  const weight = (standards as any).category?.lead_time_for_change?.weight;
  assert.equal(
    weight,
    10,
    `standards.toml [category.lead_time_for_change].weight must be 10 (Task 2.1 bump), got ${weight}`
  );
});
