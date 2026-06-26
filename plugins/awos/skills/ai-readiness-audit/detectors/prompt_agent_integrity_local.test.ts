import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

function git(cwd: string, ...args: string[]) {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' });
}

test('PAI-05 does not penalize an untracked *.local.json settings file', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-pai05-'));
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

    const out = execFileSync(
      NODE,
      ['--import', 'tsx', CLI, 'detect', '2404', repo],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      }
    );
    const res = JSON.parse(out);
    const ev = JSON.stringify(res.evidence ?? []);
    assert.ok(
      !ev.includes('settings.local.json'),
      `settings.local.json must not be flagged as untracked; evidence: ${ev}`
    );
    assert.notEqual(
      res.status,
      'FAIL',
      'PAI-05 must not FAIL solely on a local-only file'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
