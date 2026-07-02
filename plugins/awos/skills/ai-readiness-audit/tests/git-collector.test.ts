import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect, run, activeContributors } from '../collectors/git.ts';

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
    ws.per_author.map((row) => [row.author, row])
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

/**
 * Build a repo where ONE author dominates LOC and holds the only merge while
 * several others do real, steady work. Used to exercise the share-based
 * active-contributor rule (an author is excluded only when BOTH merge-share and
 * LOC-share fall below T) and the per-week throughput variants.
 *
 * Non-merge per-author commits / lines (all within the 90-day window):
 *   Dom:   3 commits, 100 lines (dom1=50, dom2=30, dom3=20), + 1 first-parent merge
 *   Carol: 2 commits,   5 lines (3 + 2)
 *   Dave:  2 commits,   5 lines (4 + 1)
 *   Eve:   1 commit,    2 lines
 *
 * total merges = 1, total lines = 112.
 * active @ T=0.05 → {Dom} = 1 (Dom holds 100% of merges and 89% of LOC; Carol,
 * Dave, Eve all fall below the 5% share on both dimensions).
 */
function activeRuleRepo(): string {
  const r = join(mkdtempSync(join(tmpdir(), 'git-active-')), 'repo');
  mkdirSync(r);
  const dom = (args: string[], date: string) =>
    gitAs(r, args, date, 'Dom', 'dom@example.com');
  const carol = (args: string[], date: string) =>
    gitAs(r, args, date, 'Carol', 'carol@example.com');
  const dave = (args: string[], date: string) =>
    gitAs(r, args, date, 'Dave', 'dave@example.com');
  const eve = (args: string[], date: string) =>
    gitAs(r, args, date, 'Eve', 'eve@example.com');
  const lines = (n: number) => 'x\n'.repeat(n);

  dom(['init', '-q', '-b', 'main'], '2025-01-01T00:00:00');

  writeFileSync(join(r, 'dom1.txt'), lines(50));
  dom(['add', '-A'], '2025-01-02T00:00:00');
  dom(['commit', '-qm', 'feat: dom1'], '2025-01-02T00:00:00');
  writeFileSync(join(r, 'dom2.txt'), lines(30));
  dom(['add', '-A'], '2025-01-03T00:00:00');
  dom(['commit', '-qm', 'feat: dom2'], '2025-01-03T00:00:00');

  writeFileSync(join(r, 'carol1.txt'), lines(3));
  carol(['add', '-A'], '2025-01-04T00:00:00');
  carol(['commit', '-qm', 'feat: carol1'], '2025-01-04T00:00:00');
  writeFileSync(join(r, 'carol2.txt'), lines(2));
  carol(['add', '-A'], '2025-01-05T00:00:00');
  carol(['commit', '-qm', 'feat: carol2'], '2025-01-05T00:00:00');

  writeFileSync(join(r, 'dave1.txt'), lines(4));
  dave(['add', '-A'], '2025-01-06T00:00:00');
  dave(['commit', '-qm', 'feat: dave1'], '2025-01-06T00:00:00');
  writeFileSync(join(r, 'dave2.txt'), lines(1));
  dave(['add', '-A'], '2025-01-07T00:00:00');
  dave(['commit', '-qm', 'feat: dave2'], '2025-01-07T00:00:00');

  writeFileSync(join(r, 'eve1.txt'), lines(2));
  eve(['add', '-A'], '2025-01-08T00:00:00');
  eve(['commit', '-qm', 'feat: eve1'], '2025-01-08T00:00:00');

  // Dom's feature branch → 3rd non-merge commit for Dom + the one merge.
  dom(['checkout', '-qb', 'feature-dom'], '2025-01-09T00:00:00');
  writeFileSync(join(r, 'dom3.txt'), lines(20));
  dom(['add', '-A'], '2025-01-10T00:00:00');
  dom(['commit', '-qm', 'feat: dom3'], '2025-01-10T00:00:00');
  dom(['checkout', '-q', 'main'], '2025-01-11T00:00:00');
  dom(
    ['merge', '--no-ff', '-qm', 'Merge feature-dom', 'feature-dom'],
    '2025-01-12T00:00:00'
  );

  return r;
}

test('activeContributors: excludes an author only when BOTH merge-share and LOC-share fall below T', () => {
  const rows = [
    { author: 'Dom', commits: 40, merges: 12, lines: 5000 }, // dominates LOC + merges
    { author: 'Carol', commits: 3, merges: 0, lines: 20 },
    { author: 'Dave', commits: 2, merges: 0, lines: 10 },
    { author: 'Eve', commits: 1, merges: 0, lines: 3 },
  ];
  // total merges = 12, total lines = 5033. At T=0.05 the bars are merge-share
  // >= 0.05 or LOC-share >= 0.05; only Dom clears either, so active = 1.
  assert.equal(
    activeContributors(rows, 0.05),
    1,
    'at T=0.05 only Dom clears the 5% share on merges or LOC; Carol/Dave/Eve are below both and excluded'
  );
  assert.equal(
    activeContributors(rows, 0),
    4,
    'at T=0 no author is below the threshold on either dimension, so all are kept'
  );
});

test('window_stats: merges_per_active and loc_per_active use the share-based active count', () => {
  // In activeRuleRepo, Dom holds 100% of merges and 89% of LOC; Carol/Dave/Eve
  // all fall below the 5% share on both dimensions, so active = 1 under the
  // share rule.
  const art = collect(activeRuleRepo(), WINDOW_PERIOD);
  const ws = art.raw.window_stats;

  const active = activeContributors(ws.per_author, 0.05);
  assert.equal(
    active,
    1,
    'active must be 1 (Dom) — he dominates both merge-share and LOC-share, pushing the others below the 5% cutoff'
  );

  const totalLines = ws.per_author.reduce(
    (s: number, a: { lines: number }) => s + a.lines,
    0
  );
  assert.equal(
    ws.merges_per_active,
    ws.merges / active,
    'merges_per_active must be total merges / active-contributor count'
  );
  assert.equal(
    ws.loc_per_active,
    totalLines / active,
    'loc_per_active must be total lines / active-contributor count'
  );
});

test('window_stats: merges_per_active_per_week and loc_per_active_per_week equal the per-active value divided by (window_days / 7)', () => {
  // Contract: the per-week variants are exactly the per-active value scaled by
  // the number of weeks in the window (window_days / 7).
  const art = collect(activeRuleRepo(), WINDOW_PERIOD);
  const ws = art.raw.window_stats;

  assert.ok(
    ws.merges_per_active != null && ws.loc_per_active != null,
    'precondition: per-active values must be non-null for this fixture'
  );

  const weeks = ws.window_days / 7;
  assert.equal(
    ws.merges_per_active_per_week,
    ws.merges_per_active / weeks,
    'merges_per_active_per_week must equal merges_per_active / (window_days / 7)'
  );
  assert.equal(
    ws.loc_per_active_per_week,
    ws.loc_per_active / weeks,
    'loc_per_active_per_week must equal loc_per_active / (window_days / 7)'
  );
});

test('window_stats: per-week throughput fields are null when there are no active contributors (empty repo)', () => {
  // Divide-by-zero guard also covers the per-week variants: when per-active is
  // null (activeCount 0), the per-week fields must be null, not NaN.
  const art = collect(emptyRepo(), WINDOW_PERIOD);
  const ws = art.raw.window_stats;
  assert.equal(
    ws.merges_per_active_per_week,
    null,
    'merges_per_active_per_week must be null when there are no active contributors'
  );
  assert.equal(
    ws.loc_per_active_per_week,
    null,
    'loc_per_active_per_week must be null when there are no active contributors'
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

// ---------------------------------------------------------------------------
// window_stats.fix_merges tests (task 2.4) — deployment rework rate proxy.
//
// fix_merges counts first-parent merges in the 90-day window whose commit
// subject matches fix|bugfix|hotfix|patch|defect|regression (case-insensitive).
// Distinct from revert_merges (which matches ^Revert|hotfix|rollback for g7).
// ---------------------------------------------------------------------------

/**
 * Build a repo with:
 *   - Root commit at 2024-10-01 (outside all windows)
 *   - Out-of-window "fix: old repair" merge at 2024-11-01 (before since=2024-12-25)
 *   - In-window "fix: apply security patch" merge at 2025-01-15
 *   - In-window "bugfix: resolve defect" merge at 2025-02-20
 *   - Normal anchor merge at 2025-03-25 (newest commit → anchor)
 *
 * Window anchor = 2025-03-25; since = 2024-12-25.
 * In-window fix merges: 2025-01-15 and 2025-02-20 → fix_merges = 2.
 * Out-of-window: 2024-11-01 → excluded.
 */
function fixMergeRepo(): string {
  const r = join(mkdtempSync(join(tmpdir(), 'git-fix-')), 'repo');
  mkdirSync(r);

  const alice = (args: string[], date: string) =>
    gitAs(r, args, date, 'Alice', 'alice@example.com');

  alice(['init', '-q', '-b', 'main'], '2024-10-01T00:00:00');

  // Root commit
  writeFileSync(join(r, 'root.txt'), 'root\n');
  alice(['add', '-A'], '2024-10-01T00:00:00');
  alice(['commit', '-qm', 'feat: root'], '2024-10-01T00:00:00');

  // Out-of-window fix merge — 2024-11-01, before since=2024-12-25
  alice(['checkout', '-qb', 'old-fix'], '2024-11-01T00:00:00');
  writeFileSync(join(r, 'old-fix.txt'), 'old fix\n');
  alice(['add', '-A'], '2024-11-01T00:00:00');
  alice(['commit', '-qm', 'chore: old change'], '2024-11-01T00:00:00');
  alice(['checkout', '-q', 'main'], '2024-11-01T00:00:00');
  alice(
    ['merge', '--no-ff', '-qm', 'fix: old repair (out of window)', 'old-fix'],
    '2024-11-01T00:00:00'
  );

  // In-window fix merge — 2025-01-15
  alice(['checkout', '-qb', 'fix-1'], '2025-01-15T00:00:00');
  writeFileSync(join(r, 'fix1.txt'), 'fix 1\n');
  alice(['add', '-A'], '2025-01-15T00:00:00');
  alice(['commit', '-qm', 'feat: new feature'], '2025-01-15T00:00:00');
  alice(['checkout', '-q', 'main'], '2025-01-15T00:00:00');
  alice(
    [
      'merge',
      '--no-ff',
      '-qm',
      'fix: apply security patch (in window)',
      'fix-1',
    ],
    '2025-01-15T00:00:00'
  );

  // In-window bugfix merge — 2025-02-20
  alice(['checkout', '-qb', 'fix-2'], '2025-02-20T00:00:00');
  writeFileSync(join(r, 'fix2.txt'), 'fix 2\n');
  alice(['add', '-A'], '2025-02-20T00:00:00');
  alice(['commit', '-qm', 'feat: another change'], '2025-02-20T00:00:00');
  alice(['checkout', '-q', 'main'], '2025-02-20T00:00:00');
  alice(
    ['merge', '--no-ff', '-qm', 'bugfix: resolve defect (in window)', 'fix-2'],
    '2025-02-20T00:00:00'
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

test('window_stats: fix_merges counts in-window fix/bugfix merges and excludes out-of-window ones', () => {
  // Fixture has 2 in-window fix merges (fix on 2025-01-15, bugfix on 2025-02-20)
  // and 1 out-of-window fix merge (2024-11-01), which must be excluded.
  // window anchor = 2025-03-25, since = 2024-12-25
  const repoPath = fixMergeRepo();
  const art = collect(repoPath, WINDOW_PERIOD);
  const ws = art.raw.window_stats;

  assert.ok(
    'fix_merges' in ws,
    'window_stats must include fix_merges field (required for adp_g14_rework_rate)'
  );
  assert.equal(
    ws.fix_merges,
    2,
    `window_stats.fix_merges must be 2 (fix on 2025-01-15 + bugfix on 2025-02-20 in window); ` +
      `got ${ws.fix_merges} — value 3 would mean the 2024-11-01 out-of-window fix was NOT excluded`
  );
});

test('window_stats: fix_merges is 0 for a clean repo with no fix/bugfix/patch merges', () => {
  // windowRepo() has only one normal merge ("Merge feature-bob") — no fix keywords.
  const art = collect(windowRepo(), WINDOW_PERIOD);
  const ws = art.raw.window_stats;

  assert.equal(
    ws.fix_merges,
    0,
    `window_stats.fix_merges must be 0 for a repo with no fix-labelled merges; got ${ws.fix_merges}`
  );
});

// ---------------------------------------------------------------------------
// run() allowFailure tests (task 7.1) — breadcrumb on unexpected errors, silence on expected ones.
// ---------------------------------------------------------------------------

test('run(): unexpected git failure emits a [git collector] stderr breadcrumb (allowFailure defaults to false)', () => {
  // Contract: when a git subcommand fails unexpectedly (allowFailure not set),
  // run() must write exactly one stderr breadcrumb beginning with "[git collector]"
  // and containing the subcommand name so failures are traceable in logs.
  // The call still returns '' so the collector degrades gracefully.
  // console.error is spied-on and restored to keep test output pristine.
  const cwd = mkdtempSync(join(tmpdir(), 'git-run-'));
  const captured: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    captured.push(args.map(String).join(' '));
  };
  try {
    const result = run(['bogus-subcommand-xyz'], cwd);
    assert.equal(
      result,
      '',
      'run() must return "" even when the subcommand fails'
    );
    assert.equal(
      captured.length,
      1,
      `run() must emit exactly one stderr breadcrumb for an unexpected failure; got ${captured.length}`
    );
    assert.ok(
      captured[0].includes('[git collector]'),
      `stderr breadcrumb must include "[git collector]"; got: ${captured[0]}`
    );
    assert.ok(
      captured[0].includes('bogus-subcommand-xyz'),
      `stderr breadcrumb must include the failing subcommand name; got: ${captured[0]}`
    );
  } finally {
    console.error = originalError;
  }
});

test('run(): allowFailure:true silences stderr for an expected-empty git call (e.g. detached HEAD, root-commit ^2)', () => {
  // Contract: when allowFailure is true (a "legitimately-failing" call site),
  // run() must return "" with NO stderr output — the failure is expected and
  // logging it would be noisy (e.g. symbolic-ref --short HEAD on a detached HEAD,
  // or ${sha}^1..${sha}^2 on a root/octopus merge commit).
  // console.error is spied-on and restored to keep test output pristine.
  const cwd = mkdtempSync(join(tmpdir(), 'git-run-'));
  const captured: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    captured.push(args.map(String).join(' '));
  };
  try {
    const result = run(['bogus-subcommand-xyz'], cwd, { allowFailure: true });
    assert.equal(result, '', 'run() must return "" on allowFailure failure');
    assert.equal(
      captured.length,
      0,
      `run() must NOT emit any stderr when allowFailure:true; got ${captured.length} message(s): ${captured.join(', ')}`
    );
  } finally {
    console.error = originalError;
  }
});

// ---------------------------------------------------------------------------
// Broken-environment vs. empty-repo availability (review item 1).
// A broken git environment must yield available:false (so every git metric
// SKIPs), while a commit-less repo is a VALID state: available:true with zero
// stats and no spurious stderr breadcrumbs.
// ---------------------------------------------------------------------------

test('collect(): a non-git directory yields available:false with the real git error, never confident all-zero stats', () => {
  const notARepo = mkdtempSync(join(tmpdir(), 'git-broken-'));
  const art = collect(notARepo, PERIOD);
  assert.equal(
    art.available,
    false,
    'artifact must be unavailable when the target directory is not a git repository — available:true here would let downstream metrics score all-zero stats confidently'
  );
  assert.match(
    art.reason_if_absent as string,
    /not a git repository/i,
    `reason_if_absent must carry git's actual error so the report explains WHY git metrics skipped; got: ${art.reason_if_absent}`
  );
});

test('collect(): a missing git binary (spawn ENOENT) yields available:false naming the missing binary', () => {
  // Simulate a broken environment: the child git process inherits process.env,
  // so pointing PATH at an empty dir makes execFileSync('git', ...) throw
  // ENOENT. The fixture repo is created BEFORE mangling PATH.
  const repoPath = repo();
  const emptyBinDir = mkdtempSync(join(tmpdir(), 'git-nobin-'));
  const originalPath = process.env.PATH;
  process.env.PATH = emptyBinDir;
  try {
    const art = collect(repoPath, PERIOD);
    assert.equal(
      art.available,
      false,
      'artifact must be unavailable when the git binary cannot be spawned (ENOENT)'
    );
    assert.match(
      art.reason_if_absent as string,
      /git binary not found/i,
      `reason_if_absent must say the git binary is missing; got: ${art.reason_if_absent}`
    );
  } finally {
    process.env.PATH = originalPath;
  }
});

test('collect(): a commit-less repo stays available:true with zero stats and emits NO stderr breadcrumbs', () => {
  // git init with no commits is a valid repo state: every HEAD-based `git log`
  // variant fatals on the unborn branch, and before the fix each of those
  // failures spammed a spurious "[git collector]" breadcrumb (~12 per run).
  // Contract: zero stderr output, artifact still available, all stats zero.
  const captured: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    captured.push(args.map(String).join(' '));
  };
  try {
    const art = collect(emptyRepo(), WINDOW_PERIOD);
    assert.equal(
      captured.length,
      0,
      `a commit-less repo must produce NO stderr breadcrumbs (unborn-HEAD git log failures are expected, not errors); got ${captured.length}: ${captured.join(' | ')}`
    );
    assert.equal(
      art.available,
      true,
      'a commit-less repo is a valid git repo — the artifact must stay available (with zero stats), not be marked broken'
    );
    assert.equal(art.raw.total_commits, 0, 'empty repo → total_commits 0');
    assert.equal(
      art.raw.ai_marked_commits,
      0,
      'empty repo → ai_marked_commits 0'
    );
    assert.equal(art.raw.total_merges, 0, 'empty repo → total_merges 0');
    assert.deepEqual(
      art.raw.merge_records,
      [],
      'empty repo → no merge records'
    );
    assert.equal(
      art.raw.window_stats.commits,
      0,
      'empty repo → window_stats.commits 0'
    );
    assert.deepEqual(
      art.raw.numstat_totals,
      { added: 0, deleted: 0 },
      'empty repo → zero churn'
    );
  } finally {
    console.error = originalError;
  }
});

// ---------------------------------------------------------------------------
// Attribution grep must run as ERE (review item 2). The Windsurf pattern
// `Co-authored-by:.*(Windsurf|Cascade)` uses alternation, which git's default
// BRE treats as literal `(`/`|` — so without --extended-regexp it NEVER
// matched a real trailer.
// ---------------------------------------------------------------------------

test('ai_marked_commits matches ERE alternation patterns (Windsurf/Cascade trailer)', () => {
  const r = join(mkdtempSync(join(tmpdir(), 'git-ere-')), 'repo');
  mkdirSync(r);
  git(r, ['init', '-q', '-b', 'main']);
  writeFileSync(join(r, 'w.txt'), 'w\n');
  git(r, ['add', '-A']);
  git(r, [
    'commit',
    '-qm',
    'feat: windsurf work\n\nCo-authored-by: Cascade <cascade@codeium.com>',
  ]);
  const art = collect(r, PERIOD);
  assert.equal(
    art.raw.ai_marked_commits,
    1,
    'a Cascade trailer must match the ERE pattern Co-authored-by:.*(Windsurf|Cascade) — 0 means the grep ran as BRE where (…|…) is literal'
  );
});

// ---------------------------------------------------------------------------
// Lead time for change: branch_first_commit_at must use AUTHOR date, not
// COMMITTER date. Committer dates get rewritten to ~now on rebase, which would
// collapse lead time to ~0 for a branch rebased just before merging.
// ---------------------------------------------------------------------------

function gitDates(
  cwd: string,
  args: string[],
  authorDate: string,
  committerDate: string
): void {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: authorDate,
      GIT_COMMITTER_DATE: committerDate,
      GIT_AUTHOR_NAME: 'A',
      GIT_AUTHOR_EMAIL: 'a@x',
      GIT_COMMITTER_NAME: 'A',
      GIT_COMMITTER_EMAIL: 'a@x',
    },
  });
}

test('collect honors the threaded active-contributor threshold (not a hardcoded constant)', () => {
  // activeRuleRepo shares: Dom holds 100% of merges; Carol/Dave each 5/112 ≈ 4.46%
  // of LOC, Eve 2/112 ≈ 1.79%. Total merges = 1.
  // At T=0.05 only Dom clears the bar → active=1 → merges_per_active = 1/1.
  // At T=0.04 Carol+Dave clear it too (4.46% ≥ 4%) → active=3 → merges_per_active = 1/3.
  const repo = activeRuleRepo();
  const strict = collect(repo, WINDOW_PERIOD, {
    activeContributorThreshold: 0.05,
  });
  const loose = collect(repo, WINDOW_PERIOD, {
    activeContributorThreshold: 0.04,
  });
  assert.equal(
    strict.raw.window_stats.merges_per_active,
    1,
    'T=0.05 → 1 active contributor (Dom) → merges_per_active = 1/1'
  );
  assert.equal(
    loose.raw.window_stats.merges_per_active,
    1 / 3,
    'T=0.04 → 3 active contributors (Dom, Carol, Dave) → merges_per_active = 1/3; the threshold must be threaded, not hardcoded'
  );
});

test('merge_records: batched resolution assigns each side branch to its own merge and picks the earliest author date', () => {
  // Structure exercise for the batched getMergeRecords (single graph pass +
  // in-memory sweep replacing the old per-merge `sha^1..sha^2` fork). Two
  // sequential feature branches merge into main; feature-A has two commits so
  // the "earliest author date on the branch" logic is exercised, and the
  // per-merge assignment (anc(p2) \ anc(p1)) must not bleed A's commits into B.
  const r = join(mkdtempSync(join(tmpdir(), 'git-merges-')), 'repo');
  mkdirSync(r);
  const alice = (args: string[], date: string) =>
    gitAs(r, args, date, 'Alice', 'alice@example.com');

  alice(['init', '-q', '-b', 'main'], '2025-01-01T00:00:00');
  writeFileSync(join(r, 'root.txt'), 'root\n');
  alice(['add', '-A'], '2025-01-01T00:00:00');
  alice(['commit', '-qm', 'feat: root'], '2025-01-01T00:00:00');

  // feature-A: two commits (earliest = 2025-01-05), merged 2025-01-10.
  alice(['checkout', '-qb', 'feature-a'], '2025-01-05T00:00:00');
  writeFileSync(join(r, 'a1.txt'), 'a1\n');
  alice(['add', '-A'], '2025-01-05T00:00:00');
  alice(['commit', '-qm', 'feat: a1'], '2025-01-05T00:00:00');
  writeFileSync(join(r, 'a2.txt'), 'a2\n');
  alice(['add', '-A'], '2025-01-07T00:00:00');
  alice(['commit', '-qm', 'feat: a2'], '2025-01-07T00:00:00');
  alice(['checkout', '-q', 'main'], '2025-01-10T00:00:00');
  alice(
    ['merge', '--no-ff', '-qm', 'Merge feature-a', 'feature-a'],
    '2025-01-10T00:00:00'
  );

  // feature-B: branched off post-A main, one commit (2025-01-15), merged 2025-01-20.
  alice(['checkout', '-qb', 'feature-b'], '2025-01-15T00:00:00');
  writeFileSync(join(r, 'b1.txt'), 'b1\n');
  alice(['add', '-A'], '2025-01-15T00:00:00');
  alice(['commit', '-qm', 'feat: b1'], '2025-01-15T00:00:00');
  alice(['checkout', '-q', 'main'], '2025-01-20T00:00:00');
  alice(
    ['merge', '--no-ff', '-qm', 'Merge feature-b', 'feature-b'],
    '2025-01-20T00:00:00'
  );

  const art = collect(r, PERIOD);
  const recs = art.raw.merge_records;

  assert.equal(recs.length, 2, 'exactly two first-parent merges expected');

  // Day-diff (merged_at − branch_first_commit_at) is timezone-invariant: both
  // fields derive from the same local wall-clock dates, so the span is stable
  // even though toISOString() normalizes branch_first_commit_at to UTC.
  const dayDiff = (rec: {
    merged_at: string;
    branch_first_commit_at: string;
  }) =>
    Math.round(
      (new Date(rec.merged_at).getTime() -
        new Date(rec.branch_first_commit_at).getTime()) /
        86_400_000
    );

  // Records are emitted newest-first (git log order): feature-b then feature-a.
  const [recB, recA] = recs;

  assert.equal(
    dayDiff(recA),
    5,
    `feature-a span must be Jan05→Jan10 = 5 days (earliest author date a1, not a2 which would give 3); got ${dayDiff(recA)}`
  );
  assert.equal(
    dayDiff(recB),
    5,
    `feature-b span must be Jan15→Jan20 = 5 days; got ${dayDiff(recB)} — 15 would mean feature-a's commits bled into feature-b's diff`
  );
});

test('merge_records: branch_first_commit_at uses author date, so a rebased branch keeps a non-zero lead time', () => {
  const r = join(mkdtempSync(join(tmpdir(), 'git-leadtime-')), 'repo');
  mkdirSync(r);

  gitDates(
    r,
    ['init', '-q', '-b', 'main'],
    '2025-01-01T00:00:00',
    '2025-01-01T00:00:00'
  );
  writeFileSync(join(r, 'base.txt'), 'base\n');
  gitDates(r, ['add', '-A'], '2025-01-01T00:00:00', '2025-01-01T00:00:00');
  gitDates(
    r,
    ['commit', '-qm', 'base'],
    '2025-01-01T00:00:00',
    '2025-01-01T00:00:00'
  );

  // Feature commit authored 2025-02-01 but committed 2025-03-25 (as if rebased
  // onto main immediately before merging). Committer date == merge time.
  gitDates(
    r,
    ['checkout', '-qb', 'feature'],
    '2025-02-01T00:00:00',
    '2025-03-25T00:00:00'
  );
  writeFileSync(join(r, 'f.txt'), 'feat\n');
  gitDates(r, ['add', '-A'], '2025-02-01T00:00:00', '2025-03-25T00:00:00');
  gitDates(
    r,
    ['commit', '-qm', 'feat'],
    '2025-02-01T00:00:00',
    '2025-03-25T00:00:00'
  );

  gitDates(
    r,
    ['checkout', '-q', 'main'],
    '2025-03-25T00:00:00',
    '2025-03-25T00:00:00'
  );
  gitDates(
    r,
    ['merge', '--no-ff', '-qm', 'Merge feature', 'feature'],
    '2025-03-25T00:00:00',
    '2025-03-25T00:00:00'
  );

  const art = collect(r, WINDOW_PERIOD);
  const recs = art.raw.merge_records;
  assert.equal(
    recs.length,
    1,
    'exactly one first-parent merge record expected'
  );

  const first = new Date(recs[0].branch_first_commit_at).getTime();
  const merged = new Date(recs[0].merged_at).getTime();
  const days = (merged - first) / 86_400_000;
  assert.ok(
    days > 40,
    `lead time must reflect the author-date span (~52 days here), not ~0: branch_first_commit_at=${recs[0].branch_first_commit_at}, merged_at=${recs[0].merged_at}, diff=${days.toFixed(1)}d — a ~0 diff means committer date (rewritten by rebase) leaked in`
  );
});
