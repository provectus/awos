// detectors/security_as14.test.ts — AS-14's PASS must be reachable in a real
// git repo.
//
// Regression: once the file walkers started honoring .gitignore, AS-14's
// precondition scan could no longer see a correctly-covered sensitive file —
// covered file → invisible → SKIP; visible file → by definition uncovered →
// FAIL — so no repo state could PASS. The precondition scan now walks
// ignore-insensitively, because examining ignored-ness is the check's entire
// purpose. (The older security_sec05.test.ts suite exercises 2604 in plain
// temp dirs, which are not git repos and never hit the gitignore filter —
// this file pins the git-repo path.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;
const detect = (repo: string) =>
  JSON.parse(
    execFileSync(NODE, ['--import', 'tsx', CLI, 'detect', '2604', repo], {
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    })
  );

function initGitRepo(prefix: string): string {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  execFileSync('git', ['init', '--quiet', repo]);
  return repo;
}

test('AS-14 PASSes a git repo whose sensitive file is correctly gitignored (PASS is reachable)', () => {
  const repo = initGitRepo('awos-as14-pass-');
  try {
    writeFileSync(join(repo, 'server.pem'), 'KEY\n'); // untracked AND ignored
    writeFileSync(join(repo, '.gitignore'), '*.pem\n');
    // no Dockerfile → git coverage alone earns PASS
    const res = detect(repo);
    assert.equal(
      res.status,
      'PASS',
      `a gitignore-covered *.pem must PASS, not ${res.status} — the precondition scan must see ignored files`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('AS-14 still FAILs a git repo whose sensitive file is not ignored', () => {
  const repo = initGitRepo('awos-as14-fail-');
  try {
    writeFileSync(join(repo, 'server.pem'), 'KEY\n');
    writeFileSync(join(repo, '.gitignore'), 'node_modules/\n'); // no *.pem cover
    const res = detect(repo);
    assert.equal(
      res.status,
      'FAIL',
      'an uncovered *.pem in a git repo must FAIL'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('AS-14 still SKIPs a git repo with no sensitive file types at all', () => {
  const repo = initGitRepo('awos-as14-skip-');
  try {
    writeFileSync(join(repo, 'README.md'), '# hi\n');
    const res = detect(repo);
    assert.equal(
      res.status,
      'SKIP',
      'no sensitive files present → not applicable'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('AS-14 ignores sensitive files inside .claude/worktrees even when scanning ignore-insensitively', () => {
  const repo = initGitRepo('awos-as14-wt-');
  try {
    writeFileSync(join(repo, 'README.md'), '# hi\n');
    const wt = join(repo, '.claude', 'worktrees', 'stale', 'certs');
    execFileSync('mkdir', ['-p', wt]);
    writeFileSync(join(wt, 'old.pem'), 'KEY\n');
    const res = detect(repo);
    assert.equal(
      res.status,
      'SKIP',
      'tool-infrastructure worktrees must not make a sensitive type "relevant"'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
