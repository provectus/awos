import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

test('SDD-05 gives partial credit (WARN, not FAIL) for a mostly-complete spec set', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-sdd05-'));
  try {
    const d = join(repo, 'context', 'spec', '001-x');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'functional-spec.md'), '# f\n');
    writeFileSync(join(d, 'technical-considerations.md'), '# t\n');
    // tasks.md intentionally missing → 2 of 3
    const res = JSON.parse(
      execFileSync(NODE, ['--import', 'tsx', CLI, 'detect', '2804', repo], {
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      })
    );
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
