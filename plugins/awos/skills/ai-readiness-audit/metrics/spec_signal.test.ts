// spec_signal.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collect } from '../collectors/git.ts';
import { compute } from './tooling_depth.ts';

function tmpRepoWithSpec(): string {
  const dir = mkdtempSync(join(tmpdir(), 'awos-spec-'));
  mkdirSync(join(dir, 'context', 'spec', '001-feature'), { recursive: true });
  writeFileSync(
    join(dir, 'context', 'spec', '001-feature', 'functional-spec.md'),
    '# spec\n'
  );
  // The git collector marks non-git directories unavailable (raw is empty),
  // so the tooling_paths → 106 contract needs a real (commit-less) repo.
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

test('tooling_depth code 106 fires when context/spec/ exists', () => {
  const repo = tmpRepoWithSpec();
  const collected = mkdtempSync(join(tmpdir(), 'awos-collected-'));
  try {
    const art = collect(repo, {
      bucket_days: 30,
      lookback_days: 730,
      history_available_days: 0,
    });
    writeFileSync(join(collected, 'git.json'), JSON.stringify(art));
    const res = compute(collected, {}, {});
    assert.ok(
      (res.categories_awarded as number[]).includes(106),
      `code 106 (spec signal) must be awarded for a repo with context/spec/; got ${JSON.stringify(res.categories_awarded)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(collected, { recursive: true, force: true });
  }
});
