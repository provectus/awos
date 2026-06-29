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
    score: 1,
    confidence: 1,
  });
});

test('makeResult default score mapping: PASS=1, WARN=0.5, FAIL=0, SKIP=0/0', () => {
  assert.equal(makeResult('PASS', null, []).score, 1, 'PASS score must be 1');
  assert.equal(
    makeResult('PASS', null, []).confidence,
    1,
    'PASS confidence must be 1'
  );
  assert.equal(
    makeResult('WARN', null, []).score,
    0.5,
    'WARN score must be 0.5'
  );
  assert.equal(
    makeResult('WARN', null, []).confidence,
    1,
    'WARN confidence must be 1'
  );
  assert.equal(makeResult('FAIL', null, []).score, 0, 'FAIL score must be 0');
  assert.equal(
    makeResult('FAIL', null, []).confidence,
    1,
    'FAIL confidence must be 1'
  );
  assert.equal(makeResult('SKIP', null, []).score, 0, 'SKIP score must be 0');
  assert.equal(
    makeResult('SKIP', null, []).confidence,
    0,
    'SKIP confidence must be 0'
  );
});

test('makeResult accepts explicit score override', () => {
  const r = makeResult('WARN', 0.75, [], 'detected', 0.75, 1.0);
  assert.equal(r.score, 0.75, 'explicit score must override default');
  assert.equal(r.confidence, 1.0, 'explicit confidence must be stored');
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
