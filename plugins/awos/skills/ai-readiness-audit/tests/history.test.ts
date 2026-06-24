/**
 * HIST.1 — monthly history series (value_series) tests.
 *
 * Contracts verified:
 * - Rate metrics (g2, g3) emit value_series with one entry per 30-day bucket.
 * - Series length equals the number of monthly_buckets in the git artifact.
 * - Each entry carries a numeric value and the bucket_start from the bucket.
 * - capBucketsByHistory trims to min(history_available_days, buckets) buckets
 *   when history_available_days < buckets × bucket_days (two-source bounding).
 * - When history_available_days is 0 (uncapped), all buckets are preserved.
 * - g3 headline value is current-state (most-recent bucket's merges/week).
 * - g2 headline value is average contributors across all series buckets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect } from '../collectors/git.ts';
import { compute as computeG2 } from '../metrics/adp_g2_contributors.ts';
import { compute as computeG3 } from '../metrics/adp_g3_deploy_frequency.ts';
import { capBucketsByHistory } from '../metrics/_base.ts';
import { loadStandards } from './helpers.ts';

// ---------------------------------------------------------------------------
// Git repo fixture builder
// ---------------------------------------------------------------------------

/** Run a git command in a temp repo with fixed author/date env. */
function git(cwd: string, args: string[], date = '2025-01-15T12:00:00'): void {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: 'Alice',
      GIT_AUTHOR_EMAIL: 'alice@example.com',
      GIT_COMMITTER_NAME: 'Alice',
      GIT_COMMITTER_EMAIL: 'alice@example.com',
    },
  });
}

function gitAs(
  cwd: string,
  args: string[],
  date: string,
  name: string,
  email: string
): void {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: email,
    },
  });
}

/**
 * Build a hermetic git repo spanning ~3 months (90 days).
 *
 * Commit timeline (ISO dates):
 *   Month 1 (Jan):  3 commits by Alice, 2 merge commits
 *   Month 2 (Feb):  2 commits by Alice, 1 commit by Bob, 1 merge commit
 *   Month 3 (Mar):  2 commits by Alice, 2 merge commits
 *
 * All dates are pinned — git collector anchors to latest commit date, so
 * bucket counts are deterministic.
 *
 * Latest commit: 2025-03-25  → anchor date
 * history_available_days ≈ 69 days (Jan 15 → Mar 25)
 */
function buildThreeMonthRepo(): string {
  const r = join(mkdtempSync(join(tmpdir(), 'hist-')), 'repo');
  mkdirSync(r);
  git(r, ['init', '-q', '-b', 'main']);

  // Month 1 — January
  writeFileSync(join(r, 'a.txt'), 'init');
  git(r, ['add', '-A'], '2025-01-15T00:00:00');
  git(r, ['commit', '-qm', 'init'], '2025-01-15T00:00:00');

  writeFileSync(join(r, 'b.txt'), 'work1');
  git(r, ['add', '-A'], '2025-01-20T00:00:00');
  git(r, ['commit', '-qm', 'feat: b'], '2025-01-20T00:00:00');

  // Simulate a merge: create a branch, commit to it, merge it back.
  git(r, ['checkout', '-qb', 'feature-jan'], '2025-01-22T00:00:00');
  writeFileSync(join(r, 'c.txt'), 'feature');
  git(r, ['add', '-A'], '2025-01-22T00:00:00');
  git(r, ['commit', '-qm', 'feat: c'], '2025-01-22T00:00:00');
  git(r, ['checkout', '-q', 'main'], '2025-01-23T00:00:00');
  git(
    r,
    ['merge', '--no-ff', '-qm', 'Merge feature-jan', 'feature-jan'],
    '2025-01-25T00:00:00'
  );

  // Second merge in January
  git(r, ['checkout', '-qb', 'fix-jan'], '2025-01-26T00:00:00');
  writeFileSync(join(r, 'd.txt'), 'fix');
  git(r, ['add', '-A'], '2025-01-26T00:00:00');
  git(r, ['commit', '-qm', 'fix: d'], '2025-01-26T00:00:00');
  git(r, ['checkout', '-q', 'main'], '2025-01-27T00:00:00');
  git(
    r,
    ['merge', '--no-ff', '-qm', 'Merge fix-jan', 'fix-jan'],
    '2025-01-28T00:00:00'
  );

  // Month 2 — February (different author for one commit)
  git(r, ['checkout', '-qb', 'feature-feb'], '2025-02-10T00:00:00');
  writeFileSync(join(r, 'e.txt'), 'e');
  gitAs(r, ['add', '-A'], '2025-02-10T00:00:00', 'Bob', 'bob@example.com');
  gitAs(
    r,
    ['commit', '-qm', 'feat: e'],
    '2025-02-10T00:00:00',
    'Bob',
    'bob@example.com'
  );
  writeFileSync(join(r, 'f.txt'), 'f');
  git(r, ['add', '-A'], '2025-02-12T00:00:00');
  git(r, ['commit', '-qm', 'feat: f'], '2025-02-12T00:00:00');
  git(r, ['checkout', '-q', 'main'], '2025-02-13T00:00:00');
  git(
    r,
    ['merge', '--no-ff', '-qm', 'Merge feature-feb', 'feature-feb'],
    '2025-02-14T00:00:00'
  );

  // Month 3 — March
  git(r, ['checkout', '-qb', 'feature-mar1'], '2025-03-05T00:00:00');
  writeFileSync(join(r, 'g.txt'), 'g');
  git(r, ['add', '-A'], '2025-03-05T00:00:00');
  git(r, ['commit', '-qm', 'feat: g'], '2025-03-05T00:00:00');
  git(r, ['checkout', '-q', 'main'], '2025-03-06T00:00:00');
  git(
    r,
    ['merge', '--no-ff', '-qm', 'Merge feature-mar1', 'feature-mar1'],
    '2025-03-10T00:00:00'
  );

  // Latest commit (anchors the bucket window)
  git(r, ['checkout', '-qb', 'feature-mar2'], '2025-03-20T00:00:00');
  writeFileSync(join(r, 'h.txt'), 'h');
  git(r, ['add', '-A'], '2025-03-20T00:00:00');
  git(r, ['commit', '-qm', 'feat: h'], '2025-03-20T00:00:00');
  git(r, ['checkout', '-q', 'main'], '2025-03-21T00:00:00');
  git(
    r,
    ['merge', '--no-ff', '-qm', 'Merge feature-mar2', 'feature-mar2'],
    '2025-03-25T00:00:00'
  );

  return r;
}

// ---------------------------------------------------------------------------
// Shared setup: collect git artifact into a tmp dir
// ---------------------------------------------------------------------------

const PERIOD = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 0,
};

const standards = loadStandards();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('history: g2_contributors emits value_series with one entry per effective bucket', () => {
  const repoPath = buildThreeMonthRepo();
  const artifact = collect(repoPath, PERIOD);

  // Write artifact to a tmp collected dir
  const collectedDir = join(mkdtempSync(join(tmpdir(), 'hist-col-')), 'col');
  mkdirSync(collectedDir, { recursive: true });
  writeFileSync(join(collectedDir, 'git.json'), JSON.stringify(artifact));

  const result = computeG2(collectedDir, standards, {});

  assert.equal(result.status, 'OK', 'status must be OK');
  assert.ok(
    Array.isArray(result.value_series),
    'value_series must be present and an array'
  );
  assert.ok(
    result.value_series!.length > 0,
    'value_series must have at least one entry'
  );

  // The effective bucket count is bounded by history_available_days.
  const historyDays: number = artifact.period.history_available_days;
  const bucketDays: number = artifact.period.bucket_days;
  const rawBucketCount: number = artifact.raw.monthly_buckets.length;
  const expectedCount =
    historyDays > 0
      ? Math.min(rawBucketCount, Math.floor(historyDays / bucketDays))
      : rawBucketCount;

  assert.equal(
    result.value_series!.length,
    expectedCount,
    `value_series length (${result.value_series!.length}) must equal effective bucket count (${expectedCount}) bounded by history_available_days=${historyDays}`
  );

  // Each entry must have bucket_start (string) and a numeric or null value.
  for (const entry of result.value_series!) {
    assert.equal(
      typeof entry.bucket_start,
      'string',
      'each entry must have bucket_start string'
    );
    assert.ok(
      typeof entry.value === 'number' || entry.value === null,
      `entry value must be number or null, got ${typeof entry.value}`
    );
  }
});

test('history: g3_deploy_frequency emits value_series with one entry per effective bucket', () => {
  const repoPath = buildThreeMonthRepo();
  const artifact = collect(repoPath, PERIOD);

  const collectedDir = join(mkdtempSync(join(tmpdir(), 'hist-col-')), 'col');
  mkdirSync(collectedDir, { recursive: true });
  writeFileSync(join(collectedDir, 'git.json'), JSON.stringify(artifact));

  const result = computeG3(collectedDir, standards, {});

  assert.equal(result.status, 'OK', 'status must be OK');
  assert.ok(
    Array.isArray(result.value_series),
    'value_series must be present and an array'
  );

  const historyDays: number = artifact.period.history_available_days;
  const bucketDays: number = artifact.period.bucket_days;
  const rawBucketCount: number = artifact.raw.monthly_buckets.length;
  const expectedCount =
    historyDays > 0
      ? Math.min(rawBucketCount, Math.floor(historyDays / bucketDays))
      : rawBucketCount;

  assert.equal(
    result.value_series!.length,
    expectedCount,
    `value_series length (${result.value_series!.length}) must equal effective bucket count (${expectedCount})`
  );

  // Every series value must be a non-negative number (merges/week >= 0).
  for (const entry of result.value_series!) {
    assert.ok(
      typeof entry.value === 'number' && entry.value >= 0,
      `entry.value must be non-negative number, got ${entry.value}`
    );
  }
});

test('history: g3 headline value is computed from effective (capped) buckets', () => {
  const repoPath = buildThreeMonthRepo();
  const artifact = collect(repoPath, PERIOD);

  const collectedDir = join(mkdtempSync(join(tmpdir(), 'hist-col-')), 'col');
  mkdirSync(collectedDir, { recursive: true });
  writeFileSync(join(collectedDir, 'git.json'), JSON.stringify(artifact));

  const result = computeG3(collectedDir, standards, {});

  assert.ok(
    typeof result.value === 'number',
    'headline value must be a number'
  );

  // Headline = totalMerges of capped buckets / (cappedBuckets * bucketDays / 7).
  const historyDays: number = artifact.period.history_available_days;
  const bucketDays: number = artifact.period.bucket_days;
  const allBuckets: Array<{ merges: number }> = artifact.raw.monthly_buckets;
  const maxBuckets =
    historyDays > 0 ? Math.floor(historyDays / bucketDays) : allBuckets.length;
  const cappedBuckets = allBuckets.slice(
    Math.max(0, allBuckets.length - maxBuckets)
  );

  const totalMerges = cappedBuckets.reduce(
    (s: number, b: { merges: number }) => s + b.merges,
    0
  );
  const totalWeeks = (cappedBuckets.length * bucketDays) / 7;
  const expected = totalWeeks > 0 ? totalMerges / totalWeeks : 0;

  assert.ok(
    Math.abs((result.value as number) - expected) < 0.001,
    `headline value mismatch: got ${result.value}, expected ~${expected} (from ${cappedBuckets.length} capped buckets)`
  );
});

test('history: capBucketsByHistory caps to floor(maxDays / bucketDays) buckets', () => {
  // 5 buckets × 30 days = 150 days total.
  const buckets = [
    { bucket_start: '2025-01-01' },
    { bucket_start: '2025-02-01' },
    { bucket_start: '2025-03-01' },
    { bucket_start: '2025-04-01' },
    { bucket_start: '2025-05-01' },
  ];

  // Cap to 60 days → floor(60/30) = 2 buckets (most recent two).
  const capped = capBucketsByHistory(buckets, 60, 30);
  assert.equal(
    capped.length,
    2,
    `expected 2 buckets after 60-day cap, got ${capped.length}`
  );
  assert.equal(
    capped[0].bucket_start,
    '2025-04-01',
    'first bucket after cap should be the 4th bucket'
  );
  assert.equal(
    capped[1].bucket_start,
    '2025-05-01',
    'second bucket after cap should be the 5th bucket'
  );
});

test('history: capBucketsByHistory with 0 maxDays returns all buckets unchanged', () => {
  const buckets = [
    { bucket_start: '2025-01-01' },
    { bucket_start: '2025-02-01' },
    { bucket_start: '2025-03-01' },
  ];

  const result = capBucketsByHistory(buckets, 0, 30);
  assert.equal(
    result.length,
    3,
    'maxDays=0 means no cap; all 3 buckets returned'
  );
});

test('history: two-source bounding — series length bounded by smaller source history', () => {
  // Simulate the bounding rule: a metric fed by two sources caps its series
  // to min(source1.history_available_days, source2.history_available_days).
  //
  // Setup:
  //   git artifact:     5 monthly_buckets, history_available_days = 150
  //   tracker artifact: history_available_days = 60 (shorter history)
  //   min = 60 → floor(60/30) = 2 effective buckets
  const gitBuckets = [
    { bucket_start: '2025-01-01', authors: 2, commits: 5, merges: 1 },
    { bucket_start: '2025-02-01', authors: 2, commits: 5, merges: 1 },
    { bucket_start: '2025-03-01', authors: 3, commits: 8, merges: 2 },
    { bucket_start: '2025-04-01', authors: 3, commits: 7, merges: 2 },
    { bucket_start: '2025-05-01', authors: 4, commits: 10, merges: 3 },
  ];

  const gitHistoryDays = 150; // covers 5 buckets
  const trackerHistoryDays = 60; // covers only 2 buckets

  // The bounding rule: effective history = min of all source histories.
  const minHistory = Math.min(gitHistoryDays, trackerHistoryDays);
  const bucketDays = 30;

  const cappedBuckets = capBucketsByHistory(gitBuckets, minHistory, bucketDays);

  assert.equal(
    cappedBuckets.length,
    2,
    `bounded series must have 2 entries (min history ${minHistory}d / ${bucketDays}d per bucket), got ${cappedBuckets.length}`
  );
  assert.equal(
    cappedBuckets[0].bucket_start,
    '2025-04-01',
    'bounded series starts at the correct bucket'
  );
  assert.equal(
    cappedBuckets[1].bucket_start,
    '2025-05-01',
    'bounded series ends at the most recent bucket'
  );
});

test('history: g2 value_series bucket_starts match effective (capped) monthly_buckets', () => {
  const repoPath = buildThreeMonthRepo();
  const artifact = collect(repoPath, PERIOD);

  const collectedDir = join(mkdtempSync(join(tmpdir(), 'hist-col-')), 'col');
  mkdirSync(collectedDir, { recursive: true });
  writeFileSync(join(collectedDir, 'git.json'), JSON.stringify(artifact));

  const result = computeG2(collectedDir, standards, {});

  assert.ok(Array.isArray(result.value_series), 'value_series must be present');

  // The series is bounded by history_available_days — compare against capped buckets.
  const historyDays: number = artifact.period.history_available_days;
  const bucketDays: number = artifact.period.bucket_days;
  const allBuckets: Array<{ bucket_start: string }> =
    artifact.raw.monthly_buckets;
  const maxBuckets =
    historyDays > 0 ? Math.floor(historyDays / bucketDays) : allBuckets.length;
  const cappedBuckets = allBuckets.slice(
    Math.max(0, allBuckets.length - maxBuckets)
  );

  const seriesStarts = result.value_series!.map((e) => e.bucket_start);
  const expectedStarts = cappedBuckets.map((b) => b.bucket_start);
  assert.deepEqual(
    seriesStarts,
    expectedStarts,
    'series bucket_starts must match the history-bounded monthly_buckets'
  );
});

test('history: g3 value_series capped when max_lookback_days constrains history', () => {
  // Write a git artifact with more buckets than history_available_days supports.
  // 4 buckets in the artifact, but history_available_days = 60 → only 2 kept.
  const tmp = mkdtempSync(join(tmpdir(), 'hist-cap-'));
  const collectedDir = join(tmp, 'col');
  mkdirSync(collectedDir, { recursive: true });

  const artifact = {
    source: 'git',
    available: true,
    reason_if_absent: null,
    period: {
      bucket_days: 30,
      lookback_days: 730,
      history_available_days: 60,
    },
    raw: {
      default_branch: 'main',
      total_commits: 40,
      ai_marked_commits: 0,
      total_merges: 8,
      revert_merges: 0,
      tooling_paths: [],
      merge_records: [],
      numstat_totals: { added: 200, deleted: 50 },
      monthly_buckets: [
        { bucket_start: '2025-01-01', authors: 2, commits: 8, merges: 2 },
        { bucket_start: '2025-02-01', authors: 2, commits: 10, merges: 2 },
        { bucket_start: '2025-03-01', authors: 3, commits: 11, merges: 2 },
        { bucket_start: '2025-04-01', authors: 3, commits: 11, merges: 2 },
      ],
    },
  };
  writeFileSync(join(collectedDir, 'git.json'), JSON.stringify(artifact));

  const result = computeG3(collectedDir, standards, {});

  assert.equal(result.status, 'OK', 'status must be OK');
  assert.ok(Array.isArray(result.value_series), 'value_series must be present');

  // history_available_days=60, bucket_days=30 → floor(60/30) = 2 buckets max.
  assert.equal(
    result.value_series!.length,
    2,
    `expected 2 capped buckets, got ${result.value_series!.length}`
  );
  assert.equal(
    result.value_series![0].bucket_start,
    '2025-03-01',
    'first capped bucket should be the 3rd bucket'
  );
  assert.equal(
    result.value_series![1].bucket_start,
    '2025-04-01',
    'second capped bucket should be the 4th (most recent)'
  );
});
