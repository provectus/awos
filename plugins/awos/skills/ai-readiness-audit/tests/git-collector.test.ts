import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect } from '../collectors/git.ts';

// ---------------------------------------------------------------------------
// window_stats test helpers
// ---------------------------------------------------------------------------

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
 * Build a hermetic multi-author git repo for window_stats tests.
 *
 * History (anchor = newest commit = 2025-03-25):
 *   2024-12-01  Alice  — "chore: old"  adds old.txt (10 lines)  OUTSIDE 90-day window
 *   2025-01-10  Alice  — "feat: a"     adds a.txt  (3 lines)    within window
 *   2025-02-15  Bob    — "feat: b"     adds b.txt  (5 lines)    within window (on feature-bob)
 *   2025-03-25  Alice  — "Merge feature-bob"  first-parent merge into main  (ANCHOR)
 *
 * Since = 2025-03-25 - 90d = 2024-12-25.  The 2024-12-01 old commit is EXCLUDED.
 *
 * Expected window_stats:
 *   commits:       2 (Alice 1 + Bob 1, non-merge)
 *   merges:        1 (Alice merged feature-bob)
 *   authors_total: 2
 *   per_author:
 *     Alice: { commits:1, merges:1, lines:3 }
 *     Bob:   { commits:1, merges:0, lines:5 }
 */
function windowRepo(): string {
  const r = join(mkdtempSync(join(tmpdir(), 'git-window-')), 'repo');
  mkdirSync(r);

  const alice = (args: string[], date: string) =>
    gitAs(r, args, date, 'Alice', 'alice@example.com');
  const bob = (args: string[], date: string) =>
    gitAs(r, args, date, 'Bob', 'bob@example.com');

  alice(['init', '-q', '-b', 'main'], '2024-12-01T00:00:00');

  // OLD commit — outside the 90-day window from anchor 2025-03-25
  writeFileSync(join(r, 'old.txt'), 'x\ny\nz\na\nb\nc\nd\ne\nf\ng\n'); // 10 lines
  alice(['add', '-A'], '2024-12-01T00:00:00');
  alice(['commit', '-qm', 'chore: old'], '2024-12-01T00:00:00');

  // Alice's work commit — within window
  writeFileSync(join(r, 'a.txt'), 'a\nb\nc\n'); // 3 lines
  alice(['add', '-A'], '2025-01-10T00:00:00');
  alice(['commit', '-qm', 'feat: a'], '2025-01-10T00:00:00');

  // Bob's feature branch
  alice(['checkout', '-qb', 'feature-bob'], '2025-02-01T00:00:00');
  writeFileSync(join(r, 'b.txt'), '1\n2\n3\n4\n5\n'); // 5 lines
  bob(['add', '-A'], '2025-02-15T00:00:00');
  bob(['commit', '-qm', 'feat: b'], '2025-02-15T00:00:00');

  // Alice merges feature-bob into main — newest commit (ANCHOR = 2025-03-25)
  alice(['checkout', '-q', 'main'], '2025-03-24T00:00:00');
  alice(
    ['merge', '--no-ff', '-qm', 'Merge feature-bob', 'feature-bob'],
    '2025-03-25T00:00:00'
  );

  return r;
}

const WINDOW_PERIOD = {
  bucket_days: 30,
  lookback_days: 90,
  history_available_days: 0,
};

function git(cwd: string, args: string[], date = '2025-01-01T00:00:00') {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: 'A',
      GIT_AUTHOR_EMAIL: 'a@x',
      GIT_COMMITTER_NAME: 'A',
      GIT_COMMITTER_EMAIL: 'a@x',
    },
  });
}

function repo(): string {
  const r = join(mkdtempSync(join(tmpdir(), 'git-')), 'repo');
  mkdirSync(r);
  git(r, ['init', '-q', '-b', 'main']);
  writeFileSync(join(r, 'CLAUDE.md'), '# ctx\nbuild: make\n');
  git(r, ['add', '-A']);
  git(r, ['commit', '-qm', 'feat: init']);
  writeFileSync(join(r, 'f.txt'), 'x');
  git(r, ['add', '-A']);
  git(
    r,
    [
      'commit',
      '-qm',
      'feat: work\n\nCo-authored-by: Claude <claude@anthropic.com>',
    ],
    '2025-02-01T00:00:00'
  );
  return r;
}

const PERIOD = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 0,
};

test('git collector is always available', () => {
  const art = collect(repo(), PERIOD);
  assert.equal(art.source, 'git');
  assert.equal(art.available, true);
});

test('git collector counts AI markers', () => {
  const art = collect(repo(), PERIOD);
  assert.equal(art.raw.total_commits, 2);
  assert.equal(art.raw.ai_marked_commits, 1);
});

test('git collector detects tooling', () => {
  const art = collect(repo(), PERIOD);
  assert.ok(art.raw.tooling_paths.includes('CLAUDE.md'));
});

test('git collector history bound', () => {
  const art = collect(repo(), PERIOD);
  assert.ok(art.period.history_available_days >= 30); // ~Jan→Feb span
});

test('git collector counts non-Claude AI commits and tooling', () => {
  const r = join(mkdtempSync(join(tmpdir(), 'git-')), 'repo2');
  mkdirSync(r);
  git(r, ['init', '-q', '-b', 'main']);
  writeFileSync(join(r, 'GEMINI.md'), '# gemini\n');
  git(r, ['add', '-A']);
  git(r, [
    'commit',
    '-qm',
    'feat: init\n\nCo-authored-by: Cursor <cursor@cursor.com>',
  ]);
  const art = collect(r, PERIOD);
  assert.ok(art.raw.ai_marked_commits >= 1, 'Cursor-attributed commit counted');
  assert.ok(
    art.raw.tooling_paths.includes('GEMINI.md'),
    'GEMINI.md surfaced as tooling'
  );
});

test('git collector reads >1MiB of git output without truncation (maxBuffer regression)', () => {
  // Regression: run() used execFileSync's default 1 MiB maxBuffer. On a
  // large/long-lived repo, `git log --numstat` exceeds that, throws ENOBUFS,
  // and the catch silently returns '' — zeroing churn and the monthly buckets
  // (so DORA contributors/deploy-frequency silently SKIP). Here one commit adds
  // enough files that `git log --numstat` clears 1 MiB; with the old cap
  // numstat_totals.added would be 0, with the fix it is the true total.
  const r = join(mkdtempSync(join(tmpdir(), 'git-big-')), 'repo');
  mkdirSync(r);
  git(r, ['init', '-q', '-b', 'main']);
  const FILES = 5000; // ~250 B/numstat-line → ~1.25 MiB, like the repo that tripped it
  const LINES_PER_FILE = 3;
  // Long, padded filenames so the numstat output (one line per file, dominated
  // by the path) crosses 1 MiB at a modest file count.
  const pad = 'x'.repeat(240);
  for (let i = 0; i < FILES; i++) {
    writeFileSync(join(r, `f_${pad}_${i}.txt`), 'a\nb\nc\n');
  }
  git(r, ['add', '-A']);
  git(r, ['commit', '-qm', 'feat: many files']);

  const art = collect(r, PERIOD);
  assert.equal(
    art.raw.numstat_totals.added,
    FILES * LINES_PER_FILE,
    `churn must reflect every added line across all ${FILES} files; got ${art.raw.numstat_totals.added} (0 means the >1MiB numstat output was truncated by maxBuffer)`
  );
});

// ---------------------------------------------------------------------------
// window_stats tests (task 0.2)
// ---------------------------------------------------------------------------

test('window_stats: merges, authors_total, and per_author rows are correct', () => {
  const repoPath = windowRepo();
  const art = collect(repoPath, WINDOW_PERIOD);

  assert.ok(
    art.raw.window_stats !== undefined,
    'window_stats must exist on raw (monthly_buckets replaced)'
  );

  const ws = art.raw.window_stats;

  assert.equal(
    ws.window_days,
    90,
    'window_days must equal period.lookback_days (90)'
  );
  assert.equal(
    ws.merges,
    1,
    'merges must count exactly the one first-parent merge in the 90-day window (Alice merged feature-bob on 2025-03-25)'
  );
  assert.equal(
    ws.authors_total,
    2,
    'authors_total must be 2 (Alice and Bob both have activity in window)'
  );
  assert.equal(
    ws.commits,
    2,
    'commits must count non-merge commits in window: Alice (2025-01-10) and Bob (2025-02-15)'
  );

  const byName = Object.fromEntries(
    ws.per_author.map((row: { author: string }) => [row.author, row])
  );

  assert.ok(byName['Alice'] !== undefined, 'per_author must include Alice');
  assert.equal(
    byName['Alice'].commits,
    1,
    'Alice must have 1 non-merge commit in the window (feat: a on 2025-01-10)'
  );
  assert.equal(
    byName['Alice'].merges,
    1,
    'Alice must have 1 merge (she ran git merge feature-bob on 2025-03-25)'
  );
  assert.equal(
    byName['Alice'].lines,
    3,
    'Alice must have 3 lines (3 added in a.txt within window; no deletions)'
  );

  assert.ok(byName['Bob'] !== undefined, 'per_author must include Bob');
  assert.equal(
    byName['Bob'].commits,
    1,
    'Bob must have 1 non-merge commit in the window (feat: b on 2025-02-15)'
  );
  assert.equal(
    byName['Bob'].merges,
    0,
    'Bob must have 0 merges (he did not run git merge in this repo)'
  );
  assert.equal(
    byName['Bob'].lines,
    5,
    'Bob must have 5 lines (5 added in b.txt; no deletions)'
  );
});

test('window_stats: old commit outside the 90-day window is excluded (window anchored to newest commit)', () => {
  const repoPath = windowRepo();
  const art = collect(repoPath, WINDOW_PERIOD);

  const ws = art.raw.window_stats;

  // The 2024-12-01 commit by Alice added old.txt (10 lines).
  // Anchor = 2025-03-25; since = 2024-12-25.  2024-12-01 is outside → excluded.
  // If included, Alice.lines would be 13 (3 + 10); correct value is 3.
  const alice = ws.per_author.find(
    (row: { author: string }) => row.author === 'Alice'
  );
  assert.ok(alice !== undefined, 'Alice must appear in per_author');
  assert.equal(
    alice.lines,
    3,
    `Alice.lines must be 3 (only the 2025-01-10 in-window commit counted); ` +
      `got ${alice.lines} — value 13 would mean the 2024-12-01 old commit was NOT excluded`
  );
});

test('window_stats: monthly_buckets is not emitted (field removed in task 0.2)', () => {
  const art = collect(repo(), PERIOD);
  assert.ok(
    !('monthly_buckets' in art.raw),
    'monthly_buckets must NOT appear in raw — it was replaced by window_stats in task 0.2'
  );
  assert.ok(
    'window_stats' in art.raw,
    'window_stats must be present in raw after task 0.2'
  );
});

// ---------------------------------------------------------------------------
// merges_per_active / loc_per_active tests (task 1.2)
// ---------------------------------------------------------------------------

/**
 * Build an empty repo (git init, no commits) for the null-case test.
 * With no commits, window_stats is the zero-value empty struct and
 * per_author is [] → activeCount is 0 → both ratios must be null.
 */
function emptyRepo(): string {
  const r = join(mkdtempSync(join(tmpdir(), 'git-empty-')), 'repo');
  mkdirSync(r);
  execFileSync('git', ['init', '-q', '-b', 'main'], {
    cwd: r,
    stdio: 'ignore',
  });
  return r;
}

test('window_stats: merges_per_active and loc_per_active are null when there are no commits (activeCount = 0)', () => {
  // Contract: divide-by-zero guard — when no authors are active (empty per_author
  // → activeCount 0), both ratio fields must be null, not NaN or Infinity.
  const art = collect(emptyRepo(), WINDOW_PERIOD);
  const ws = art.raw.window_stats;

  assert.equal(
    ws.merges_per_active,
    null,
    'merges_per_active must be null when activeCount is 0 (empty repo has no authors)'
  );
  assert.equal(
    ws.loc_per_active,
    null,
    'loc_per_active must be null when activeCount is 0 (empty repo has no authors)'
  );
});

test('window_stats: merges_per_active and loc_per_active equal expected ratios for a crafted multi-author history', () => {
  // Contract: display-only throughput ratios are computed correctly.
  //
  // Fixture (windowRepo):
  //   Alice: commits=1, merges=1, lines=3
  //   Bob:   commits=1, merges=0, lines=5
  //   total merges in window = 1
  //   total lines            = 8
  //
  // Active-contributor filter (T=0.1):
  //   tm=1, tl=8
  //   Alice: merge_share=1.0 (≥0.1) → NOT excluded → active
  //   Bob:   loc_share=5/8=0.625 (≥0.1) → NOT excluded → active
  //   activeCount = 2
  //
  // Expected:
  //   merges_per_active = 1 / 2 = 0.5
  //   loc_per_active    = 8 / 2 = 4.0
  const art = collect(windowRepo(), WINDOW_PERIOD);
  const ws = art.raw.window_stats;

  assert.equal(
    ws.merges_per_active,
    0.5,
    'merges_per_active must be 1 merge / 2 active contributors = 0.5'
  );
  assert.equal(
    ws.loc_per_active,
    4.0,
    'loc_per_active must be 8 total lines / 2 active contributors = 4.0'
  );
});

// ---------------------------------------------------------------------------
// window_stats.revert_merges tests (task 2.2)
// ---------------------------------------------------------------------------

/**
 * Build a repo with:
 *   - Anchor commit at 2025-03-25 (a normal merge)
 *   - Revert merge at 2025-03-20 (subject starts with "Revert") — INSIDE window
 *   - Hotfix merge at 2025-02-15 (subject contains "hotfix") — INSIDE window
 *   - Old revert merge at 2024-10-01 (subject starts with "Revert") — OUTSIDE 90-day window
 *
 * Window anchor = 2025-03-25; since = 2024-12-25.
 * In-window reverts: 2025-03-20 and 2025-02-15 → revert_merges = 2.
 * Out-of-window: 2024-10-01 → excluded.
 */
function revertRepo(): string {
  const r = join(mkdtempSync(join(tmpdir(), 'git-revert-')), 'repo');
  mkdirSync(r);

  const alice = (args: string[], date: string) =>
    gitAs(r, args, date, 'Alice', 'alice@example.com');

  alice(['init', '-q', '-b', 'main'], '2024-10-01T00:00:00');

  // Root commit
  writeFileSync(join(r, 'root.txt'), 'root\n');
  alice(['add', '-A'], '2024-10-01T00:00:00');
  alice(['commit', '-qm', 'feat: root'], '2024-10-01T00:00:00');

  // Out-of-window revert merge — 2024-10-01, well outside the 90-day window from 2025-03-25
  alice(['checkout', '-qb', 'old-revert'], '2024-10-01T00:00:00');
  writeFileSync(join(r, 'old.txt'), 'old\n');
  alice(['add', '-A'], '2024-10-01T00:00:00');
  alice(['commit', '-qm', 'feat: old change'], '2024-10-01T00:00:00');
  alice(['checkout', '-q', 'main'], '2024-10-01T00:00:00');
  alice(
    [
      'merge',
      '--no-ff',
      '-qm',
      'Revert "old change" (out of window)',
      'old-revert',
    ],
    '2024-10-01T00:00:00'
  );

  // In-window hotfix merge — 2025-02-15
  alice(['checkout', '-qb', 'hotfix-1'], '2025-02-15T00:00:00');
  writeFileSync(join(r, 'fix.txt'), 'fix\n');
  alice(['add', '-A'], '2025-02-15T00:00:00');
  alice(['commit', '-qm', 'fix: patch'], '2025-02-15T00:00:00');
  alice(['checkout', '-q', 'main'], '2025-02-15T00:00:00');
  alice(
    ['merge', '--no-ff', '-qm', 'hotfix: apply critical patch', 'hotfix-1'],
    '2025-02-15T00:00:00'
  );

  // In-window revert merge — 2025-03-20
  alice(['checkout', '-qb', 'revert-1'], '2025-03-20T00:00:00');
  writeFileSync(join(r, 'revert.txt'), 'revert\n');
  alice(['add', '-A'], '2025-03-20T00:00:00');
  alice(['commit', '-qm', 'chore: prep revert'], '2025-03-20T00:00:00');
  alice(['checkout', '-q', 'main'], '2025-03-20T00:00:00');
  alice(
    [
      'merge',
      '--no-ff',
      '-qm',
      'Revert "feat: something" in window',
      'revert-1',
    ],
    '2025-03-20T00:00:00'
  );

  // Normal anchor merge — 2025-03-25 (newest commit → window anchor)
  alice(['checkout', '-qb', 'feature-x'], '2025-03-25T00:00:00');
  writeFileSync(join(r, 'x.txt'), 'x\n');
  alice(['add', '-A'], '2025-03-25T00:00:00');
  alice(['commit', '-qm', 'feat: x'], '2025-03-25T00:00:00');
  alice(['checkout', '-q', 'main'], '2025-03-25T00:00:00');
  alice(
    ['merge', '--no-ff', '-qm', 'Merge feature-x', 'feature-x'],
    '2025-03-25T00:00:00'
  );

  return r;
}

test('window_stats: revert_merges counts in-window revert/hotfix merges and excludes out-of-window ones', () => {
  // Fixture has 2 in-window reverts (hotfix merge on 2025-02-15, Revert merge on 2025-03-20)
  // and 1 out-of-window revert (2024-10-01), which must be excluded.
  // window anchor = 2025-03-25, since = 2024-12-25
  const repoPath = revertRepo();
  const art = collect(repoPath, WINDOW_PERIOD);
  const ws = art.raw.window_stats;

  assert.ok(
    'revert_merges' in ws,
    'window_stats must include revert_merges field'
  );
  assert.equal(
    ws.revert_merges,
    2,
    `window_stats.revert_merges must be 2 (hotfix + Revert in window); got ${ws.revert_merges} — value 3 would mean out-of-window revert was NOT excluded`
  );
});

test('window_stats: revert_merges is 0 for a clean repo with no revert/hotfix merges', () => {
  // windowRepo() has only one normal merge ("Merge feature-bob") — no revert keywords.
  const art = collect(windowRepo(), WINDOW_PERIOD);
  const ws = art.raw.window_stats;

  assert.equal(
    ws.revert_merges,
    0,
    `window_stats.revert_merges must be 0 for a clean repo; got ${ws.revert_merges}`
  );
});

// ---------------------------------------------------------------------------
// code_turnover tests (task 2.3) — windowed reworked/added ratio.
//
// Anchor = newest commit (2025-03-25). lookback = 90d → windowStart = 2024-12-25.
// rework horizon = 21d. A line "added" then "deleted" within 21d, with the
// deletion in-window, is reworked; deletions of older lines are not.
// ---------------------------------------------------------------------------

const TEN_LINES = 'l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nl10\n';
const TWO_LINES = 'l1\nl2\n';

/**
 * High-turnover history (linear, single author 'A'):
 *   2025-03-01  add foo.txt (10 lines)            in-window → total_added += 10
 *   2025-03-10  shrink foo.txt to 2 lines (-8)    9d after add, in-horizon + in-window → reworked += 8
 *   2025-03-25  add bar.txt (2 lines)  (ANCHOR)   in-window → total_added += 2
 *
 * Expected: reworked_lines=8, total_added=12, ratio = 8/12.
 */
function highTurnoverRepo(): string {
  const r = join(mkdtempSync(join(tmpdir(), 'git-turnover-')), 'repo');
  mkdirSync(r);
  git(r, ['init', '-q', '-b', 'main'], '2025-03-01T00:00:00');
  writeFileSync(join(r, 'foo.txt'), TEN_LINES);
  git(r, ['add', '-A'], '2025-03-01T00:00:00');
  git(r, ['commit', '-qm', 'feat: foo'], '2025-03-01T00:00:00');

  writeFileSync(join(r, 'foo.txt'), TWO_LINES); // remove last 8 lines → 0 added, 8 deleted
  git(r, ['add', '-A'], '2025-03-10T00:00:00');
  git(r, ['commit', '-qm', 'refactor: shrink foo'], '2025-03-10T00:00:00');

  writeFileSync(join(r, 'bar.txt'), TWO_LINES);
  git(r, ['add', '-A'], '2025-03-25T00:00:00');
  git(r, ['commit', '-qm', 'feat: bar'], '2025-03-25T00:00:00');
  return r;
}

/**
 * Add-only history — never deletes recent lines:
 *   2025-03-01  add a.txt (5 lines)              total_added += 5
 *   2025-03-25  add b.txt (3 lines)  (ANCHOR)    total_added += 3
 * Expected: reworked_lines=0, total_added=8, ratio = 0.
 */
function addOnlyRepo(): string {
  const r = join(mkdtempSync(join(tmpdir(), 'git-addonly-')), 'repo');
  mkdirSync(r);
  git(r, ['init', '-q', '-b', 'main'], '2025-03-01T00:00:00');
  writeFileSync(join(r, 'a.txt'), 'a1\na2\na3\na4\na5\n');
  git(r, ['add', '-A'], '2025-03-01T00:00:00');
  git(r, ['commit', '-qm', 'feat: a'], '2025-03-01T00:00:00');

  writeFileSync(join(r, 'b.txt'), 'b1\nb2\nb3\n');
  git(r, ['add', '-A'], '2025-03-25T00:00:00');
  git(r, ['commit', '-qm', 'feat: b'], '2025-03-25T00:00:00');
  return r;
}

/**
 * Out-of-horizon deletion — a deletion 59d after the add is NOT rework:
 *   2025-01-01  add foo.txt (10 lines)           in-window → total_added += 10
 *   2025-03-01  shrink foo.txt to 2 lines (-8)    59d after add → out of horizon → NOT reworked
 *   2025-03-25  add bar.txt (1 line)  (ANCHOR)    in-window → total_added += 1
 * Expected: reworked_lines=0, total_added=11, ratio = 0.
 */
function outOfHorizonRepo(): string {
  const r = join(mkdtempSync(join(tmpdir(), 'git-far-')), 'repo');
  mkdirSync(r);
  git(r, ['init', '-q', '-b', 'main'], '2025-01-01T00:00:00');
  writeFileSync(join(r, 'foo.txt'), TEN_LINES);
  git(r, ['add', '-A'], '2025-01-01T00:00:00');
  git(r, ['commit', '-qm', 'feat: foo'], '2025-01-01T00:00:00');

  writeFileSync(join(r, 'foo.txt'), TWO_LINES); // -8, but 59 days later
  git(r, ['add', '-A'], '2025-03-01T00:00:00');
  git(
    r,
    ['commit', '-qm', 'refactor: shrink foo (late)'],
    '2025-03-01T00:00:00'
  );

  writeFileSync(join(r, 'bar.txt'), 'x\n');
  git(r, ['add', '-A'], '2025-03-25T00:00:00');
  git(r, ['commit', '-qm', 'feat: bar'], '2025-03-25T00:00:00');
  return r;
}

test('code_turnover: lines rewritten within the horizon count as turnover (high ratio)', () => {
  const art = collect(highTurnoverRepo(), WINDOW_PERIOD);
  const ct = art.raw.code_turnover;
  assert.ok(ct !== null && ct !== undefined, 'code_turnover must be present');
  assert.equal(
    ct.reworked_lines,
    8,
    'reworked_lines must be 8 (foo.txt shrunk by 8 lines 9d after creation, in-window)'
  );
  assert.equal(
    ct.total_added,
    12,
    'total_added must be 12 (10 foo + 2 bar, both in-window)'
  );
  assert.equal(
    ct.ratio,
    8 / 12,
    `ratio must be reworked/added = 8/12; got ${ct.ratio}`
  );
});

test('code_turnover: an add-only history has ratio 0 (no rework)', () => {
  const art = collect(addOnlyRepo(), WINDOW_PERIOD);
  const ct = art.raw.code_turnover;
  assert.ok(ct !== null && ct !== undefined, 'code_turnover must be present');
  assert.equal(ct.reworked_lines, 0, 'reworked_lines must be 0 (no deletions)');
  assert.equal(ct.total_added, 8, 'total_added must be 8 (5 + 3)');
  assert.equal(ct.ratio, 0, 'ratio must be 0 when nothing is reworked');
});

test('code_turnover: deletions beyond the rework horizon are NOT counted as turnover', () => {
  const art = collect(outOfHorizonRepo(), WINDOW_PERIOD);
  const ct = art.raw.code_turnover;
  assert.ok(ct !== null && ct !== undefined, 'code_turnover must be present');
  assert.equal(
    ct.reworked_lines,
    0,
    'reworked_lines must be 0 (the 8-line deletion is 59d after the add → out of horizon)'
  );
  assert.equal(
    ct.total_added,
    11,
    'total_added must be 11 (10 foo + 1 bar, both in-window)'
  );
  assert.equal(
    ct.ratio,
    0,
    'ratio must be 0 — old lines deleted are not rework'
  );
});
