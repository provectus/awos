/**
 * org-parent-guard.test.ts — the audit-core org-folder guard.
 *
 * Contracts verified:
 * - detectOrgParent: a non-git dir holding ≥2 git-repo children IS an org
 *   parent; a git repo, a plain project dir, and a dir with a single git
 *   child are NOT.
 * - cli.ts `audit-core` against an org parent: exits 0, writes NO artifacts,
 *   and says why on stderr — the stray full audit of the org folder (whose
 *   judgment checks stay PENDING_JUDGMENT forever) must never be produced.
 *
 * The CLI subprocess runs the TypeScript entry point via tsx (not dist/cli.js)
 * so the test exercises the current sources without requiring a rebuilt bundle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectOrgParent } from '../topology.ts';
import { tmpDir } from './helpers.ts';

const NODE = process.env.NODE_BIN || process.execPath;
const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI_TS = join(SKILL, 'cli.ts');
// Repo root — where node_modules/tsx lives, so `--import tsx` resolves.
const REPO_ROOT = join(SKILL, '..', '..', '..', '..');

/** git-init a repo at `dir` (creating it), with an identity so commits work. */
function gitInit(dir: string): void {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '--quiet', dir]);
}

test('detectOrgParent: non-git dir with 2 git-repo children IS an org parent', () => {
  const base = tmpDir('awos-orgparent-');
  try {
    gitInit(join(base, 'repo-a'));
    gitInit(join(base, 'repo-b'));
    mkdirSync(join(base, 'not-a-repo'));
    const det = detectOrgParent(base);
    assert.equal(
      det.isOrgParent,
      true,
      'a non-git folder holding 2 git repos must be detected as an org parent'
    );
    assert.equal(
      det.gitRepoChildren,
      2,
      'only the .git-bearing children count as git repos'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('detectOrgParent: a git repo is never an org parent, even with git-repo children inside', () => {
  const base = tmpDir('awos-orgparent-repo-');
  try {
    gitInit(base);
    // Vendored/nested clones inside a real repo must not flip the verdict.
    gitInit(join(base, 'vendor-a'));
    gitInit(join(base, 'vendor-b'));
    const det = detectOrgParent(base);
    assert.equal(
      det.isOrgParent,
      false,
      'a directory inside a git work tree must never be an org parent'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('detectOrgParent: plain non-git project dirs (0 or 1 git children) are NOT org parents', () => {
  const base = tmpDir('awos-orgparent-plain-');
  try {
    mkdirSync(join(base, 'src'));
    let det = detectOrgParent(base);
    assert.equal(
      det.isOrgParent,
      false,
      'a plain non-git project with no git children must not be an org parent'
    );
    gitInit(join(base, 'single-clone'));
    det = detectOrgParent(base);
    assert.equal(
      det.isOrgParent,
      false,
      'one git child is not enough — org parents need at least two'
    );
    assert.equal(det.gitRepoChildren, 1, 'the single git child is counted');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('audit-core CLI: org-parent target exits 0, writes no artifacts, explains on stderr', () => {
  const base = tmpDir('awos-orgparent-cli-');
  try {
    gitInit(join(base, 'repo-a'));
    gitInit(join(base, 'repo-b'));
    const outDir = join(base, 'out');

    const res = spawnSync(
      NODE,
      ['--import', 'tsx', CLI_TS, 'audit-core', base, outDir],
      { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env } }
    );

    assert.equal(
      res.status,
      0,
      `audit-core on an org folder must exit 0 (a clean skip, not an error); stderr: ${res.stderr}`
    );
    assert.ok(
      res.stderr.includes('is an org folder') &&
        res.stderr.includes('2 git repos inside') &&
        res.stderr.includes('skipping single-repo audit'),
      `stderr must explain the org-folder skip; got: ${res.stderr}`
    );
    assert.ok(
      !existsSync(join(outDir, 'audit.json')),
      'no audit.json may be written for an org folder'
    );
    assert.ok(
      !existsSync(outDir),
      'the out dir must not be created at all — the guard runs before any work'
    );
    // stdout stays machine-readable for orchestrators that parse it.
    const parsed = JSON.parse(res.stdout) as Record<string, unknown>;
    assert.equal(
      parsed['skipped'],
      'org-parent',
      'stdout JSON must flag the skip as org-parent'
    );
    assert.equal(
      parsed['git_repo_children'],
      2,
      'stdout JSON must carry the git-repo child count'
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
