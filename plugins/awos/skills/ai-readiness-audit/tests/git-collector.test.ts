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
