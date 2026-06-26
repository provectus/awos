import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect } from '../collectors/git.ts';

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
