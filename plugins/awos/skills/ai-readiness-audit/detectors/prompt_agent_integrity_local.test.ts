import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(2404, repo);

function git(cwd: string, ...args: string[]) {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' });
}

test('AIS-05 does not penalize an untracked *.local.json settings file', () => {
  const repo = tmpDir('awos-pai05-');
  try {
    git(repo, 'init', '--quiet');
    git(repo, 'config', 'user.email', 't@e.com');
    git(repo, 'config', 'user.name', 'T');
    mkdirSync(join(repo, '.claude'), { recursive: true });
    writeFileSync(join(repo, 'CLAUDE.md'), '# ctx\n- non-obvious rule\n');
    writeFileSync(join(repo, '.claude', 'settings.json'), '{}\n');
    writeFileSync(
      join(repo, '.claude', 'settings.local.json'),
      '{"local":true}\n'
    );
    writeFileSync(join(repo, '.gitignore'), '.claude/settings.local.json\n');
    git(repo, 'add', 'CLAUDE.md', '.claude/settings.json', '.gitignore');
    git(repo, 'commit', '--quiet', '-m', 'init');

    const res = detect(repo);
    const ev = JSON.stringify(res.evidence ?? []);
    assert.ok(
      !ev.includes('settings.local.json'),
      `settings.local.json must not be flagged as untracked; evidence: ${ev}`
    );
    assert.notEqual(
      res.status,
      'FAIL',
      'AIS-05 must not FAIL solely on a local-only file'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
