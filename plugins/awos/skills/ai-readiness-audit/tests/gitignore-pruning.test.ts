/**
 * gitignore-pruning.test.ts — file walkers honor the repo's .gitignore.
 *
 * Regression pin: a Claude Code session worktree under .claude/worktrees/ (a
 * full stale checkout of the same repo, gitignored by the team) was scanned
 * by every filesystem walker — QA counted its old test files, the AST
 * metrics parsed its duplicate sources, AIS flagged its CLAUDE.mds as
 * untracked. Walkers must treat "project files" as tracked +
 * untracked-but-not-ignored, and must prune .claude/worktrees/ even when a
 * repo's .gitignore lacks the entry.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { iterFiles } from '../detectors/_base.ts';
import { listRepoFiles } from '../metrics/_ast.ts';
import { gitIgnoredSets, dropIgnored } from '../git_ignore.ts';
import { gitAs } from './helpers.ts';

function write(repo: string, rel: string, content = 'x\n'): void {
  const p = join(repo, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

/** A git repo with a .gitignore, tracked sources, a gitignored nested
 * checkout, gitignored junk, and an untracked-but-not-ignored new file. */
function buildRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'awos-gitignore-'));
  execFileSync('git', ['init', '-b', 'main', repo], { stdio: 'ignore' });
  write(repo, '.gitignore', 'scratch/\n*.log\n');
  write(repo, 'src/app.ts', 'export const a = 1;\n');
  write(repo, 'src/app.test.ts', 'test\n');
  gitAs(repo, ['add', '.'], '2025-01-01T10:00:00', 'A', 'a@example.com');
  gitAs(
    repo,
    ['commit', '-m', 'init'],
    '2025-01-01T10:00:00',
    'A',
    'a@example.com'
  );
  // Gitignored: a stale duplicate checkout and a junk file.
  write(repo, 'scratch/old-copy/src/app.ts', 'stale\n');
  write(repo, 'scratch/old-copy/src/app.test.ts', 'stale test\n');
  write(repo, 'debug.log', 'noise\n');
  // NOT gitignored in this repo — must be pruned by the built-in rule anyway.
  write(repo, '.claude/worktrees/some-session/src/app.test.ts', 'worktree\n');
  // Untracked but NOT ignored — a real project file the audit must still see.
  write(repo, 'src/new-feature.ts', 'export const b = 2;\n');
  return repo;
}

test('iterFiles prunes gitignored paths but keeps untracked-not-ignored files', () => {
  const repo = buildRepo();
  const rels = iterFiles(repo, ['*.ts']).map((p) => p.slice(repo.length + 1));

  assert.ok(
    rels.includes('src/app.ts') && rels.includes('src/app.test.ts'),
    `tracked sources must be listed; got ${JSON.stringify(rels)}`
  );
  assert.ok(
    rels.includes('src/new-feature.ts'),
    'an untracked-but-not-ignored file is project source (and what AIS-05 flags) — it must stay visible'
  );
  assert.ok(
    !rels.some((r) => r.startsWith('scratch/')),
    `a gitignored directory is not project source — the team already declared it excluded; got ${JSON.stringify(rels)}`
  );
  assert.ok(
    !rels.some((r) => r.startsWith('.claude/worktrees/')),
    'a Claude Code session worktree is tool infrastructure and must be pruned even without a .gitignore entry'
  );
});

test('iterFiles prunes individually gitignored files (*.log)', () => {
  const repo = buildRepo();
  const rels = iterFiles(repo, ['*.log']).map((p) => p.slice(repo.length + 1));
  assert.deepEqual(
    rels,
    [],
    'a file matching a .gitignore pattern must not be listed'
  );
});

test('listRepoFiles (AST metrics walker) applies the same pruning', () => {
  const repo = buildRepo();
  const rels = listRepoFiles(repo).map((p) => p.slice(repo.length + 1));
  assert.ok(
    rels.includes('src/app.ts'),
    'tracked sources must be listed by the AST walker'
  );
  assert.ok(
    !rels.some(
      (r) => r.startsWith('scratch/') || r.startsWith('.claude/worktrees/')
    ),
    `scale/complexity must never parse a gitignored nested checkout; got ${JSON.stringify(rels)}`
  );
});

test('non-git directory: walkers behave exactly as before (empty ignore set)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-nogit-'));
  write(dir, 'src/app.ts', 'x\n');
  write(dir, 'scratch/copy.ts', 'y\n');

  const sets = gitIgnoredSets(dir);
  assert.equal(
    sets.files.size,
    0,
    'a non-git directory has no gitignored files'
  );
  assert.deepEqual(
    sets.dirPrefixes,
    ['.claude/worktrees/'],
    'only the built-in prune applies outside a git repo'
  );

  const rels = iterFiles(dir, ['*.ts']).map((p) => p.slice(dir.length + 1));
  assert.ok(
    rels.includes('src/app.ts') && rels.includes('scratch/copy.ts'),
    'hermetic non-git fixtures must keep listing every file (test-suite compatibility)'
  );
});

test('dropIgnored is a no-op shape check on paths outside the repo prefix', () => {
  const repo = buildRepo();
  const kept = dropIgnored(repo, ['/somewhere/else/file.ts']);
  assert.deepEqual(
    kept,
    ['/somewhere/else/file.ts'],
    'paths outside the repo root must pass through untouched'
  );
});
