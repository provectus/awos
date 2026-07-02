/**
 * git-collector-squash.test.ts — squash-merge awareness (dossier
 * 03-squash-merge-blind-spot.md).
 *
 * Squash-and-merge produces NO merge commits, so `git log --merges` reads 0
 * and every merge-derived metric collapses. The collector must count
 * first-parent trunk commits carrying a PR ref ("Title (#123)") as merge
 * events, attribute them to the commit author (= the PR author), and expose
 * the detected merge strategy so merge-record metrics can admit their source
 * is unavailable instead of reporting a confident wrong number.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  collect,
  activeContributors,
  classifyMergeStrategy,
} from '../collectors/git.ts';
import type { Period } from '../collectors/_base.ts';

const PERIOD: Period = {
  bucket_days: 30,
  lookback_days: 90,
  history_available_days: 0,
};

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
 * Squash-merge repo: every "PR" lands as one ordinary trunk commit whose
 * subject carries the forge's PR ref. Three authors, zero merge commits.
 */
function buildSquashRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'awos-squash-'));
  execFileSync('git', ['init', '-b', 'main', dir], { stdio: 'ignore' });
  const commits: Array<[string, string, string, string]> = [
    // [date, author, subject, file]
    ['2025-01-05T10:00:00', 'Alice', 'feat: bootstrap (#1)', 'a.txt'],
    ['2025-01-20T10:00:00', 'Bob', 'feat: search api (#2)', 'b.txt'],
    ['2025-02-10T10:00:00', 'Carol', 'fix: crash on empty query (#3)', 'c.txt'],
    ['2025-02-20T10:00:00', 'Alice', 'chore: direct push, no PR ref', 'd.txt'],
    ['2025-03-01T10:00:00', 'Bob', 'Revert "feat: search api" (#4)', 'e.txt'],
    // Azure DevOps squash format: PR ref is a subject PREFIX.
    [
      '2025-03-05T10:00:00',
      'Carol',
      'Merged PR 55: azure-style change',
      'f.txt',
    ],
  ];
  for (const [date, author, subject, file] of commits) {
    writeFileSync(join(dir, file), `${subject}\n`);
    gitAs(
      dir,
      ['add', '.'],
      date,
      author,
      `${author.toLowerCase()}@example.com`
    );
    gitAs(
      dir,
      ['commit', '-m', subject],
      date,
      author,
      `${author.toLowerCase()}@example.com`
    );
  }
  return dir;
}

test('squash-merged PRs count as merge events attributed to their authors', () => {
  const art = collect(buildSquashRepo(), PERIOD) as {
    raw: {
      window_stats: {
        merges: number;
        merge_commits: number;
        squash_merges: number;
        merge_strategy: string;
        revert_merges: number;
        fix_merges: number;
        per_author: Array<{ author: string; merges: number }>;
      };
      total_merges: number;
    };
  };
  const ws = art.raw.window_stats;
  assert.equal(
    ws.merge_commits,
    0,
    'a pure squash repo has zero 2-parent merge commits'
  );
  assert.equal(
    ws.squash_merges,
    5,
    '5 trunk commits carry a PR ref (4 GitHub-style + 1 Azure-style) → 5 squash merge events'
  );
  assert.equal(
    ws.merges,
    5,
    'window merges must count squash events, not read 0'
  );
  assert.equal(ws.merge_strategy, 'squash', 'strategy must classify as squash');
  const byAuthor = new Map(ws.per_author.map((a) => [a.author, a.merges]));
  assert.equal(
    byAuthor.get('Alice'),
    1,
    'Alice authored 1 squash-merged PR (the direct push has no PR ref)'
  );
  assert.equal(byAuthor.get('Bob'), 2, 'Bob authored 2 squash-merged PRs');
  assert.equal(
    byAuthor.get('Carol'),
    2,
    'Carol authored 2 squash-merged PRs (one GitHub-style, one Azure-style)'
  );
  assert.ok(
    ws.revert_merges >= 1,
    'the squashed Revert PR must count as a revert event'
  );
  assert.ok(
    ws.fix_merges >= 1,
    'the squashed fix PR must count as a fix event'
  );
  assert.equal(
    art.raw.total_merges,
    5,
    'all-history total_merges must include squash events'
  );
});

test('classifyMergeStrategy: merge-commit / squash / mixed / unknown', () => {
  assert.equal(classifyMergeStrategy(10, 0), 'merge-commit');
  assert.equal(classifyMergeStrategy(0, 10), 'squash');
  assert.equal(classifyMergeStrategy(0, 0), 'unknown');
  assert.equal(classifyMergeStrategy(5, 6), 'mixed');
  assert.equal(
    classifyMergeStrategy(2, 20),
    'squash',
    'a few stray merge commits amid many squashed PRs is still a squash workflow'
  );
});

test('activeContributors falls back to commit-share (not LOC-only) when no merge events exist', () => {
  // Direct-push repo: no merges at all. One author dominates LOC via a huge
  // import; the others have real commit activity. The old LOC-only fallback
  // collapsed this to 1 active contributor.
  const perAuthor = [
    { author: 'Importer', commits: 5, merges: 0, lines: 100_000 },
    { author: 'Dev A', commits: 10, merges: 0, lines: 900 },
    { author: 'Dev B', commits: 8, merges: 0, lines: 700 },
  ];
  const active = activeContributors(perAuthor, 0.05);
  assert.equal(
    active,
    3,
    'authors with a meaningful commit share must stay active even when one author dominates LOC'
  );
});

test('Bitbucket squash format "Title (pull request #N)" is recognised and attributed to the PR author', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-squash-bb-'));
  execFileSync('git', ['init', '-b', 'main', dir], { stdio: 'ignore' });
  writeFileSync(join(dir, 'a.txt'), 'x\n');
  gitAs(dir, ['add', '.'], '2025-02-01T10:00:00', 'Erin', 'erin@example.com');
  gitAs(
    dir,
    ['commit', '-m', 'Add rate limiter (pull request #12)'],
    '2025-02-01T10:00:00',
    'Erin',
    'erin@example.com'
  );
  const art = collect(dir, PERIOD) as {
    raw: {
      window_stats: {
        squash_merges: number;
        merge_strategy: string;
        per_author: Array<{ author: string; merges: number }>;
      };
    };
  };
  const ws = art.raw.window_stats;
  assert.equal(
    ws.squash_merges,
    1,
    'a Bitbucket squashed PR ("Title (pull request #12)" subject) must count as a merge event'
  );
  assert.equal(
    ws.merge_strategy,
    'squash',
    'a repo whose only merge events are Bitbucket squash commits must classify as squash'
  );
  const erin = ws.per_author.find((a) => a.author === 'Erin');
  assert.equal(
    erin?.merges,
    1,
    'the Bitbucket squash-merge event must be attributed to the commit author (= PR author)'
  );
});

test('GitLab squash format is recognised via the merge-request ref in the body', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-squash-gl-'));
  execFileSync('git', ['init', '-b', 'main', dir], { stdio: 'ignore' });
  writeFileSync(join(dir, 'a.txt'), 'x\n');
  gitAs(dir, ['add', '.'], '2025-02-01T10:00:00', 'Dana', 'dana@example.com');
  gitAs(
    dir,
    [
      'commit',
      '-m',
      'Add ingestion pipeline',
      '-m',
      'See merge request acme/platform!482',
    ],
    '2025-02-01T10:00:00',
    'Dana',
    'dana@example.com'
  );
  const art = collect(dir, PERIOD) as {
    raw: { window_stats: { squash_merges: number; merge_strategy: string } };
  };
  assert.equal(
    art.raw.window_stats.squash_merges,
    1,
    'a GitLab squashed MR (body ref) must count as a merge event'
  );
  assert.equal(art.raw.window_stats.merge_strategy, 'squash');
});
