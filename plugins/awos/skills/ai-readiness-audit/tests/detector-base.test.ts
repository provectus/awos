import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeResult, iterFiles, grep } from '../detectors/_base.ts';

test('makeResult shape', () => {
  const r = makeResult('PASS', 3, ['src/a.ts:10 found X']);
  assert.deepEqual(r, {
    status: 'PASS',
    value: 3,
    evidence: ['src/a.ts:10 found X'],
    method: 'detected',
  });
});

test('makeResult rejects a bad status', () => {
  assert.throws(
    () => makeResult('GREEN' as any, null, []),
    /status must be one of/
  );
});

test('iterFiles is sorted and skips .git', () => {
  const t = mkdtempSync(join(tmpdir(), 'det-'));
  mkdirSync(join(t, '.git'));
  writeFileSync(join(t, '.git', 'x.ts'), 'x');
  writeFileSync(join(t, 'b.ts'), 'b');
  writeFileSync(join(t, 'a.ts'), 'a');
  const names = iterFiles(t, ['**/*.ts']).map((p) => p.split('/').pop());
  assert.deepEqual(names, ['a.ts', 'b.ts']);
});

test('grep finds pattern with location', () => {
  const t = mkdtempSync(join(tmpdir(), 'det-'));
  writeFileSync(join(t, 'm.py'), 'ok\nexcept A, B:\n');
  const hits = grep(t, /except\s+\w+\s*,\s*\w+\s*:/, ['**/*.py']);
  assert.ok(
    hits.length && hits[0].line === 2 && hits[0].text.includes('except A, B')
  );
});
