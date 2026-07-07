import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(2804, repo);

test('SDD-05 gives partial credit (WARN, not FAIL) for a mostly-complete spec set', () => {
  const repo = tmpDir('awos-sdd05-');
  try {
    const d = join(repo, 'context', 'spec', '001-x');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'functional-spec.md'), '# f\n');
    writeFileSync(join(d, 'technical-considerations.md'), '# t\n');
    // tasks.md intentionally missing → 2 of 3
    const res = detect(repo);
    assert.notEqual(
      res.status,
      'FAIL',
      `2-of-3 must not be a hard FAIL; got ${res.status}`
    );
    const evidenceText = (res.evidence as string[]).join('\n');
    assert.match(
      evidenceText,
      /2\/3/,
      `evidence must report the present/total ratio "2/3"; got: ${evidenceText}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
