/**
 * git-collector-trunk.test.ts — trunk-ref resolution (diverged-clone bug).
 *
 * The collector must walk the team's SHARED trunk, not the local checkout.
 * On a developer clone whose local main diverged from origin/main via `git
 * pull` sync-merge commits, a first-parent walk of local main sees only the
 * developer's own pull merges and misses every squash-merged PR on the real
 * trunk (observed in the wild: 6 pull merges masking 220 squashed PRs — a 36×
 * deployment-frequency undercount). resolveTrunk() must prefer the upstream
 * ref, fall back sanely (same-name remote ref, origin/HEAD on detached HEAD,
 * local checkout), and record its choice in the artifact for transparency.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collect, resolveTrunk, describeTrunk } from '../collectors/git.ts';
import type { Period } from '../collectors/_base.ts';
import { gitAs } from './helpers.ts';
import { readCollectedArtifacts, deriveSources } from '../audit_core.ts';
import { renderMarkdown, renderHtml } from '../render.ts';
import type { AuditJson } from '../artifact_types.ts';

const PERIOD: Period = {
  bucket_days: 30,
  lookback_days: 90,
  history_available_days: 0,
};

function git(cwd: string, args: string[], date = '2025-03-01T10:00:00'): void {
  gitAs(cwd, args, date, 'Tester', 'tester@example.com');
}

/** Commit a one-line file change with a pinned author/date. */
function commitFile(
  dir: string,
  file: string,
  subject: string,
  date: string,
  author = 'Alice'
): void {
  writeFileSync(join(dir, file), `${subject}\n`);
  gitAs(dir, ['add', '.'], date, author, `${author}@example.com`);
  gitAs(dir, ['commit', '-m', subject], date, author, `${author}@example.com`);
}

/**
 * "Origin" repo whose main is a pure squash trunk: every PR lands as one
 * ordinary commit with a forge PR ref in the subject. No merge commits.
 */
function buildSquashOrigin(prCount: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'awos-trunk-origin-'));
  execFileSync('git', ['init', '-b', 'main', dir], { stdio: 'ignore' });
  for (let i = 1; i <= prCount; i++) {
    const day = String(i).padStart(2, '0');
    commitFile(
      dir,
      `f${i}.txt`,
      `feat: change ${i} (#${i})`,
      `2025-01-${day}T10:00:00`
    );
  }
  return dir;
}

/** Clone `origin` (file transport — offline) into a fresh temp dir. */
function cloneRepo(origin: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'awos-trunk-clone-'));
  execFileSync('git', ['clone', '--quiet', origin, dir], { stdio: 'ignore' });
  return dir;
}

// ---------------------------------------------------------------------------
// The bug reproduction: diverged developer clone
// ---------------------------------------------------------------------------

test('diverged clone: trunk walks origin/main, not the local pull-merge lineage', () => {
  const origin = buildSquashOrigin(10);
  const clone = cloneRepo(origin);

  // Developer makes 2 local commits (no PR refs — never squash events)...
  commitFile(
    clone,
    'local1.txt',
    'wip: local experiment',
    '2025-02-01T10:00:00',
    'Dev'
  );
  commitFile(
    clone,
    'local2.txt',
    'wip: more local work',
    '2025-02-02T10:00:00',
    'Dev'
  );
  // ...while 2 more PRs land on the real trunk...
  commitFile(origin, 'f11.txt', 'feat: change 11 (#11)', '2025-02-03T10:00:00');
  commitFile(origin, 'f12.txt', 'feat: change 12 (#12)', '2025-02-04T10:00:00');
  // ...and the developer pulls, creating the sync-merge commit that poisons a
  // local first-parent walk (its first parent is the LOCAL lineage).
  git(clone, ['fetch', '--quiet', 'origin'], '2025-02-05T10:00:00');
  git(clone, ['merge', '--no-edit', 'origin/main'], '2025-02-05T10:00:00');

  const art = collect(clone, PERIOD);
  assert.equal(
    art.available,
    true,
    'diverged clone is a healthy repo — artifact must be available'
  );
  const raw = art.raw;
  const trunk = raw.trunk;

  assert.equal(
    trunk.source,
    'upstream',
    'a checked-out branch with configured tracking must resolve its trunk via @{upstream}'
  );
  assert.equal(
    trunk.ref,
    'origin/main',
    'trunk ref must be the remote-tracking ref, not the local branch'
  );
  assert.equal(
    raw.default_branch,
    'main',
    'default_branch keeps NAME semantics (branch name, not ref)'
  );
  assert.equal(
    trunk.local_ahead,
    3,
    'local_ahead must count the 2 local commits + 1 pull-merge commit that are not on the trunk'
  );
  assert.equal(
    trunk.local_behind,
    0,
    'after the pull-merge, origin/main is an ancestor of local main — local_behind must be 0'
  );

  const ws = raw.window_stats;
  assert.equal(
    ws.squash_merges,
    12,
    'all 12 squash-merged PRs on origin/main must be counted as merge events'
  );
  assert.equal(
    ws.merge_commits,
    0,
    "the developer's local pull-merge commit is NOT on the trunk and must not count as a merge event"
  );
  assert.equal(ws.merges, 12, 'window merges = trunk squash events only');
  assert.equal(
    ws.merge_strategy,
    'squash',
    'a pure squash trunk must classify as squash even when the local clone has pull merges'
  );
  assert.match(
    trunk.summary,
    /origin\/main/,
    'summary must name the walked ref for the report'
  );
});

test('fast-forward-ahead clone: unpushed local work is excluded from trunk counts', () => {
  const origin = buildSquashOrigin(3);
  const clone = cloneRepo(origin);
  // Unpushed local commit whose subject FAKES a PR ref — it must still be
  // invisible to trunk metrics because it is not on origin/main.
  commitFile(
    clone,
    'sneak.txt',
    'feat: not actually merged (#99)',
    '2025-02-01T10:00:00',
    'Dev'
  );

  const art = collect(clone, PERIOD);
  const raw = art.raw;
  assert.equal(
    raw.trunk.source,
    'upstream',
    'fast-forward-ahead local still resolves trunk via upstream — unpushed work is not delivered'
  );
  assert.equal(
    raw.window_stats.squash_merges,
    3,
    'only the 3 PRs on origin/main count; the unpushed (#99) commit must be excluded'
  );
  assert.equal(
    raw.total_commits,
    3,
    'total_commits is trunk-scoped and must exclude the unpushed local commit'
  );
  assert.equal(
    raw.trunk.local_ahead,
    1,
    'the unpushed commit must be reported as local_ahead=1'
  );
  assert.equal(
    raw.trunk.local_behind,
    0,
    'clone is up to date with the trunk — local_behind must be 0'
  );
});

test('divergence counts pin --left-right order: ahead=local-only, behind=trunk-only', () => {
  const origin = buildSquashOrigin(3);
  const clone = cloneRepo(origin);
  // 2 local-only commits...
  commitFile(clone, 'l1.txt', 'wip: one', '2025-02-01T10:00:00', 'Dev');
  commitFile(clone, 'l2.txt', 'wip: two', '2025-02-02T10:00:00', 'Dev');
  // ...and 1 trunk-only commit the clone has fetched but NOT merged.
  commitFile(origin, 'f4.txt', 'feat: change 4 (#4)', '2025-02-03T10:00:00');
  git(clone, ['fetch', '--quiet', 'origin'], '2025-02-04T10:00:00');

  const trunk = resolveTrunk(clone);
  assert.equal(
    trunk.local_ahead,
    2,
    'local_ahead must be the commits only on the local branch (rev-list --left-right RIGHT column)'
  );
  assert.equal(
    trunk.local_behind,
    1,
    'local_behind must be the commits only on the trunk (rev-list --left-right LEFT column)'
  );
});

// ---------------------------------------------------------------------------
// Fallback ladder
// ---------------------------------------------------------------------------

test('local-only repo (no remote): source=local, behavior unchanged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-trunk-local-'));
  execFileSync('git', ['init', '-b', 'main', dir], { stdio: 'ignore' });
  commitFile(dir, 'a.txt', 'feat: direct work (#1)', '2025-01-05T10:00:00');
  commitFile(dir, 'b.txt', 'feat: more work (#2)', '2025-01-06T10:00:00');

  const art = collect(dir, PERIOD);
  const raw = art.raw;
  assert.equal(
    raw.trunk.source,
    'local',
    'a repo without any remote must fall back to the local checkout'
  );
  assert.equal(
    raw.trunk.ref,
    'HEAD',
    "local fallback uses the literal 'HEAD' sentinel so every walk stays implicit"
  );
  assert.equal(
    raw.default_branch,
    'main',
    'default_branch must still report the checked-out branch name'
  );
  assert.equal(
    raw.trunk.local_ahead,
    null,
    'no trunk to diverge from — ahead must be null'
  );
  assert.equal(
    raw.trunk.local_behind,
    null,
    'no trunk to diverge from — behind must be null'
  );
  assert.equal(
    raw.window_stats.squash_merges,
    2,
    'squash detection on the local branch must keep working exactly as before'
  );
});

test('detached HEAD: origin/HEAD supplies the trunk (CI checkout shape)', () => {
  const origin = buildSquashOrigin(3);
  const clone = cloneRepo(origin);
  git(clone, ['checkout', '--quiet', '--detach', 'HEAD']);

  const trunk = resolveTrunk(clone);
  assert.equal(
    trunk.source,
    'origin-head',
    'detached HEAD must resolve the trunk via the remote default branch (origin/HEAD)'
  );
  assert.equal(
    trunk.ref,
    'origin/main',
    'origin/HEAD points at origin/main after a clone'
  );
  assert.equal(
    trunk.branch,
    'main',
    'branch name must be derived from the origin/HEAD target'
  );
  assert.equal(trunk.local_branch, null, 'detached HEAD has no local branch');
});

test('stale origin/HEAD is outranked by the checked-out branch upstream', () => {
  // The real-world trap: origin/HEAD points at a dead pre-migration branch
  // (observed: origin/HEAD → develop, dead for months, while PRs land on main).
  const origin = buildSquashOrigin(3);
  const clone = cloneRepo(origin);
  git(clone, [
    'symbolic-ref',
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/develop', // dangling — no such fetched ref
  ]);

  const trunk = resolveTrunk(clone);
  assert.equal(
    trunk.source,
    'upstream',
    'the checked-out branch upstream must win over origin/HEAD (which can be stale/dangling)'
  );
  assert.equal(
    trunk.ref,
    'origin/main',
    'trunk must be origin/main regardless of the dangling origin/HEAD'
  );
});

test('dangling upstream config falls through to the same-name remote ref', () => {
  const origin = buildSquashOrigin(3);
  const clone = cloneRepo(origin);
  // Point tracking at a branch that has no remote-tracking ref.
  git(clone, ['config', 'branch.main.merge', 'refs/heads/gone']);

  const trunk = resolveTrunk(clone);
  assert.equal(
    trunk.source,
    'same-name-remote',
    'an upstream config pointing at a missing ref must not be trusted — fall through to origin/<branch>'
  );
  assert.equal(
    trunk.ref,
    'origin/main',
    'the same-name remote-tracking ref is the next-best trunk candidate'
  );
});

test('tracking unset: same-name remote ref is used', () => {
  const origin = buildSquashOrigin(3);
  const clone = cloneRepo(origin);
  git(clone, ['config', '--unset', 'branch.main.merge']);
  git(clone, ['config', '--unset', 'branch.main.remote']);

  const trunk = resolveTrunk(clone);
  assert.equal(
    trunk.source,
    'same-name-remote',
    'without tracking config the collector must still find refs/remotes/origin/main by name'
  );
  assert.equal(
    trunk.ref,
    'origin/main',
    'same-name resolution must produce origin/<branch>'
  );
});

test('sole non-origin remote: same-name resolution uses it', () => {
  const origin = buildSquashOrigin(3);
  const clone = cloneRepo(origin);
  git(clone, ['remote', 'rename', 'origin', 'upstream']);
  git(clone, ['config', '--unset', 'branch.main.merge']);
  git(clone, ['config', '--unset', 'branch.main.remote']);

  const trunk = resolveTrunk(clone);
  assert.equal(
    trunk.source,
    'same-name-remote',
    'a repo whose only remote is not named origin must still resolve the same-name ref'
  );
  assert.equal(
    trunk.ref,
    'upstream/main',
    'the sole remote (whatever its name) supplies the trunk ref'
  );
});

// ---------------------------------------------------------------------------
// Summary formatting + pipeline transparency
// ---------------------------------------------------------------------------

test('describeTrunk: one summary shape per source', () => {
  assert.equal(
    describeTrunk({
      ref: 'origin/main',
      branch: 'main',
      local_branch: 'main',
      source: 'upstream',
      local_ahead: 6,
      local_behind: 0,
    }),
    'trunk: origin/main (upstream of checked-out main, local +6/-0)',
    'upstream summary must name the ref, the local branch, and the divergence'
  );
  assert.equal(
    describeTrunk({
      ref: 'origin/main',
      branch: 'main',
      local_branch: null,
      source: 'origin-head',
      local_ahead: null,
      local_behind: null,
    }),
    'trunk: origin/main (remote default branch; detached HEAD)',
    'origin-head summary must say the trunk came from the remote default branch'
  );
  assert.equal(
    describeTrunk({
      ref: 'HEAD',
      branch: 'main',
      local_branch: 'main',
      source: 'local',
      local_ahead: null,
      local_behind: null,
    }),
    'trunk: local main (no remote tracking ref)',
    'local summary must disclose that no remote ref was available'
  );
});

test('deriveSources: git row carries the trunk note; local fallback stays silent', () => {
  const origin = buildSquashOrigin(3);
  const clone = cloneRepo(origin);
  const outDir = mkdtempSync(join(tmpdir(), 'awos-trunk-derive-'));
  const collectedDir = join(outDir, 'collected');
  mkdirSync(collectedDir, { recursive: true });
  const art = collect(clone, PERIOD);
  writeFileSync(join(collectedDir, 'git.json'), JSON.stringify(art));

  const sources = deriveSources(readCollectedArtifacts(collectedDir), true);
  const gitRow = sources.find((s) => s.source === 'git');
  assert.ok(
    gitRow,
    'deriveSources must emit a git row for a collected artifact'
  );
  assert.match(
    String(gitRow!.note ?? ''),
    /trunk: origin\/main/,
    'the git source row must carry the trunk summary so the report can disclose which lineage was measured'
  );

  // Local-only repo: no note — nothing remote to disclose.
  const localDir = mkdtempSync(join(tmpdir(), 'awos-trunk-derive-local-'));
  execFileSync('git', ['init', '-b', 'main', localDir], { stdio: 'ignore' });
  commitFile(localDir, 'a.txt', 'feat: work', '2025-01-05T10:00:00');
  const localArt = collect(localDir, PERIOD);
  const localOut = mkdtempSync(join(tmpdir(), 'awos-trunk-derive-local-out-'));
  mkdirSync(join(localOut, 'collected'), { recursive: true });
  writeFileSync(
    join(localOut, 'collected', 'git.json'),
    JSON.stringify(localArt)
  );
  const localSources = deriveSources(
    readCollectedArtifacts(join(localOut, 'collected')),
    true
  );
  const localGitRow = localSources.find((s) => s.source === 'git');
  assert.equal(
    localGitRow!.note,
    undefined,
    'a plain local checkout has no remote trunk to disclose — the note must be omitted'
  );
});

test('renderers surface the source note in Connections & Sources (md + html)', () => {
  const audit = {
    date: '2026-01-01',
    project: 'p',
    audit_total: 0,
    coverage: 0,
    dimensions: [],
    sources: [
      {
        source: 'git',
        available: true,
        reason_if_absent: null,
        history_available_days: 400,
        note: 'trunk: origin/main (upstream of checked-out main, local +6/-0)',
      },
    ],
  } as unknown as AuditJson;

  const md = renderMarkdown(audit);
  assert.match(
    md,
    /— trunk: origin\/main \(upstream of checked-out main, local \+6\/-0\)/,
    'markdown Connections & Sources must show the trunk note on the git line'
  );
  const html = renderHtml(audit);
  assert.match(
    html,
    /trunk: origin\/main \(upstream of checked-out main, local \+6\/-0\)/,
    'HTML Connections & Sources must show the trunk note on the git line'
  );
});
