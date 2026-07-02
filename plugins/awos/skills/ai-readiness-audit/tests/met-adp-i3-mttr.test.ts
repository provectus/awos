/**
 * Tests for adp_i3_mttr metric.
 *
 * Contracts verified:
 * - git-only fixture → status OK (NEVER SKIP), reliability.tag="not-reliable",
 *   note includes "git-proxy", sources_used=['git']
 * - git-only with merge_records → computes median hours, assigns correct DORA band
 * - git-only with empty merge_records → status OK, value=null, band=null
 * - git.json missing → status OK (not SKIP), reliability.tag="not-reliable",
 *   note includes "git-proxy"
 * - tracker with incident_source present (available=true) → NO reliability upgrade
 *   (the value is still the git proxy), sources_used includes 'tracker'
 * - tracker available=false with incident_source → no upgrade (still git-proxy tier)
 * - categories_awarded=[1103] only when topology.has_incident_source=true
 * - categories_awarded=[] when topology.has_incident_source=false/absent
 * - kind is "banded"
 * - reliability.tag is always "not-reliable"
 * - band: elite < 1h, high < 24h, medium < 168h, low >= 168h
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_i3_mttr.ts';
import { writeCollected, loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'i3-'));
}

/** Build a merge record where merged_at is `hours` after branch_first_commit_at. */
function makeMergeRecord(
  hours: number,
  base = '2024-01-01T00:00:00Z'
): { merged_at: string; branch_first_commit_at: string } {
  const start = new Date(base);
  const end = new Date(start.getTime() + hours * 3_600_000);
  return {
    branch_first_commit_at: start.toISOString(),
    merged_at: end.toISOString(),
  };
}

/** Git raw payload with given merge_records. */
function makeGitRaw(
  mergeRecords: { merged_at: string; branch_first_commit_at: string }[]
) {
  return {
    merge_records: mergeRecords,
    monthly_buckets: [],
    tooling_paths: [],
    total_commits: 10,
    ai_marked_commits: 0,
    total_merges: mergeRecords.length,
    revert_merges: 0,
    numstat_totals: { added: 100, deleted: 20 },
    default_branch: 'main',
  };
}

// ---------------------------------------------------------------------------
// NEVER-SKIP contracts
// ---------------------------------------------------------------------------

test('adp_i3: git-only fixture with merge_records → status OK (never SKIP)', () => {
  const tmp = makeTmpDir();
  // Two merge records: 0.5h and 1.5h → median = 1.0h → band "high" (< 24h)
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([makeMergeRecord(0.5), makeMergeRecord(1.5)])
  );

  const result = compute(collectedDir, standards, {});

  assert.equal(result.status, 'OK', 'must be OK — adp_i3 never skips');
  assert.equal(result.kind, 'banded', 'kind must be "banded"');
  assert.deepEqual(
    result.sources_used,
    ['git'],
    'sources_used must include git'
  );
});

test('adp_i3: git.json missing → status OK (never SKIP), git-proxy note present', () => {
  const tmp = makeTmpDir();
  // No files written — git.json absent.
  const emptyDir = join(tmp, 'empty-collected');
  mkdirSync(emptyDir, { recursive: true });

  const result = compute(emptyDir, standards, {});

  assert.equal(result.status, 'OK', 'must be OK even when git.json is absent');
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability tag must be "not-reliable"'
  );
  assert.ok(
    result.reliability.note?.includes('git-proxy') ?? false,
    `note must mention git-proxy when git.json missing, got: ${result.reliability.note}`
  );
});

// ---------------------------------------------------------------------------
// Git-proxy reliability contracts
// ---------------------------------------------------------------------------

test('adp_i3: git-only (no incident_source) → reliability.tag=not-reliable, note has git-proxy', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([makeMergeRecord(2)])
  );

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability tag must always be "not-reliable"'
  );
  assert.ok(
    result.reliability.note?.includes('git-proxy') ?? false,
    `note must include "git-proxy" when no incident source, got: ${result.reliability.note}`
  );
});

test('adp_i3: git-only, empty merge_records → OK, value=null, band=null', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(tmp, 'git', makeGitRaw([]));

  const result = compute(collectedDir, standards, {});

  assert.equal(result.status, 'OK', 'status must be OK (git.json present)');
  assert.equal(result.value, null, 'value must be null when no merge records');
  assert.equal(result.band, null, 'band must be null when value is null');
  assert.deepEqual(result.sources_used, ['git'], 'git listed as used source');
});

// ---------------------------------------------------------------------------
// DORA band contracts (git-proxy)
// ---------------------------------------------------------------------------

test('adp_i3: median < 1h → elite band', () => {
  const tmp = makeTmpDir();
  // Two records: 0.3h and 0.5h → median = 0.4h → elite (< 1h)
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([makeMergeRecord(0.3), makeMergeRecord(0.5)])
  );

  const result = compute(collectedDir, standards, {});

  assert.equal(result.band, 'elite', 'median < 1h must be "elite"');
  assert.ok(
    typeof result.value === 'number' && result.value < 1,
    `value must be < 1 for elite, got ${result.value}`
  );
});

test('adp_i3: median 1h–24h → high band', () => {
  const tmp = makeTmpDir();
  // Two records: 1h and 3h → median = 2h → high (>= 1h and < 24h)
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([makeMergeRecord(1), makeMergeRecord(3)])
  );

  const result = compute(collectedDir, standards, {});

  assert.equal(result.band, 'high', 'median 2h must be "high"');
});

test('adp_i3: median 24h–168h → medium band', () => {
  const tmp = makeTmpDir();
  // Two records: 24h and 72h → median = 48h → medium (>= 24h and < 168h)
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([makeMergeRecord(24), makeMergeRecord(72)])
  );

  const result = compute(collectedDir, standards, {});

  assert.equal(result.band, 'medium', 'median 48h must be "medium"');
});

test('adp_i3: median >= 168h → low band', () => {
  const tmp = makeTmpDir();
  // Two records: 168h and 200h → median = 184h → low (>= 168h)
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([makeMergeRecord(168), makeMergeRecord(200)])
  );

  const result = compute(collectedDir, standards, {});

  assert.equal(result.band, 'low', 'median >= 168h must be "low"');
});

// ---------------------------------------------------------------------------
// Incident source upgrade contracts
// ---------------------------------------------------------------------------

test('adp_i3: tracker with incident_source → reliability stays at the git-proxy tier (no upgrade)', () => {
  const tmp = makeTmpDir();
  // Write git artifact
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([makeMergeRecord(2)])
  );
  // Write tracker artifact with incident_source present
  const trackerArt = {
    source: 'tracker',
    available: true,
    reason_if_absent: null,
    period: { bucket_days: 30, lookback_days: 730, history_available_days: 0 },
    raw: {
      tickets: [],
      type_counts: {},
      resolved_count: 0,
      incident_source: 'pagerduty',
    },
  };
  writeFileSync(join(collectedDir, 'tracker.json'), JSON.stringify(trackerArt));

  const result = compute(collectedDir, standards, {});

  assert.equal(result.status, 'OK', 'must be OK');
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability tag is always "not-reliable"'
  );
  // The value is still the git branch-lifetime proxy — declaring an incident
  // source does NOT make it more trustworthy, so no HIGH/1.0 upgrade.
  assert.notEqual(
    result.reliability.confidence,
    'HIGH',
    'confidence must NOT upgrade to HIGH while the value is still the git proxy'
  );
  assert.match(
    result.reliability.note ?? '',
    /git-proxy/,
    'note must keep the git-proxy disclaimer even when incident_source is present'
  );
  assert.ok(
    result.confidence < 1,
    `numeric confidence must stay below 1 for a proxy value, got ${result.confidence}`
  );
  assert.ok(
    result.sources_used.includes('tracker'),
    'sources_used must include tracker when incident_source declared'
  );
  assert.ok(
    result.sources_used.includes('git'),
    'sources_used must still include git'
  );
});

test('adp_i3: tracker available=false with incident_source → no reliability upgrade', () => {
  const tmp = makeTmpDir();
  // Write git artifact
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([makeMergeRecord(5)])
  );
  // Tracker available=false — incident_source must be ignored
  const trackerArt = {
    source: 'tracker',
    available: false,
    reason_if_absent: 'no connector',
    period: { bucket_days: 30, lookback_days: 730, history_available_days: 0 },
    raw: {
      tickets: [],
      type_counts: {},
      resolved_count: 0,
      incident_source: 'pagerduty',
    },
  };
  writeFileSync(join(collectedDir, 'tracker.json'), JSON.stringify(trackerArt));

  const result = compute(collectedDir, standards, {});

  assert.equal(
    result.reliability.note?.includes('git-proxy') ?? false,
    true,
    'note must include "git-proxy" when tracker.available=false (no incident upgrade)'
  );
  assert.notEqual(
    result.reliability.confidence,
    'HIGH',
    'confidence must NOT be HIGH when tracker.available=false'
  );
});

// ---------------------------------------------------------------------------
// Category award contracts
// ---------------------------------------------------------------------------

test('adp_i3: categories_awarded includes 1103 when topology.has_incident_source=true', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([makeMergeRecord(2)])
  );

  const result = compute(collectedDir, standards, {
    has_incident_source: true,
  });

  assert.ok(
    result.categories_awarded.includes(1103),
    'code 1103 must be awarded when topology.has_incident_source=true'
  );
});

test('adp_i3: categories_awarded empty when topology.has_incident_source=false', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([makeMergeRecord(2)])
  );

  const result = compute(collectedDir, standards, {});

  assert.deepEqual(
    result.categories_awarded,
    [],
    'no code 1103 when topology.has_incident_source is false/absent'
  );
});

// ---------------------------------------------------------------------------
// Metadata contracts
// ---------------------------------------------------------------------------

test('adp_i3: metric id is correct', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([makeMergeRecord(2)])
  );

  const result = compute(collectedDir, standards, {});

  assert.equal(result.metric, 'adp_i3_mttr', 'metric id must be "adp_i3_mttr"');
});

// ---------------------------------------------------------------------------
// Phase 3b: score/confidence contracts
// ---------------------------------------------------------------------------

test('adp_i3: score=0.75 when median MTTR is 1h (DORA high anchor)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([makeMergeRecord(1)])
  );

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs(result.score - 0.75) < 0.0001,
    `score must be 0.75 at 1h MTTR (log anchor), got ${result.score}`
  );
  // Git-proxy only → confidence=0.3 (intervals present but no incident_source)
  assert.ok(
    result.confidence > 0 && result.confidence <= 1,
    `confidence must be in (0,1] when git proxy data present, got ${result.confidence}`
  );
});

test('adp_i3: score=0.5 when median MTTR is 24h (DORA medium anchor)', () => {
  const tmp = makeTmpDir();
  const collectedDir = writeCollected(
    tmp,
    'git',
    makeGitRaw([makeMergeRecord(24)])
  );

  const result = compute(collectedDir, standards, {});
  assert.ok(
    Math.abs(result.score - 0.5) < 0.0001,
    `score must be 0.5 at 24h MTTR (log anchor), got ${result.score}`
  );
});

test('adp_i3: score=0 and confidence=0 when no git and no incident source', () => {
  const tmp = makeTmpDir();
  const result = compute(join(tmp, 'no-collected'), standards, {});
  assert.equal(result.score, 0, 'score must be 0 when no data sources');
  assert.equal(
    result.confidence,
    0,
    'confidence must be 0 when no data available'
  );
});
