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

test('makeResult clamps out-of-range score/confidence into [0,1]', () => {
  const over = makeResult('PASS', null, [], 'detected', 1.7, 2.5);
  assert.equal(over.score, 1, 'score above 1 must be clamped to 1');
  assert.equal(over.confidence, 1, 'confidence above 1 must be clamped to 1');
  const under = makeResult('FAIL', null, [], 'detected', -0.3, -1);
  assert.equal(under.score, 0, 'score below 0 must be clamped to 0');
  assert.equal(under.confidence, 0, 'confidence below 0 must be clamped to 0');
  const inRange = makeResult('WARN', null, [], 'detected', 0.42, 0.9);
  assert.equal(inRange.score, 0.42, 'in-range score must pass through');
  assert.equal(
    inRange.confidence,
    0.9,
    'in-range confidence must pass through'
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

test('iterFiles matches path-qualified globs (find -name only sees basenames)', () => {
  const t = mkdtempSync(join(tmpdir(), 'det-'));
  mkdirSync(join(t, 'design'));
  mkdirSync(join(t, 'ci'));
  mkdirSync(join(t, 'other'));
  writeFileSync(join(t, 'design', 'spec.md'), '# spec');
  writeFileSync(join(t, 'ci', 'pipeline.yml'), 'jobs: {}');
  writeFileSync(join(t, 'other', 'notes.md'), '# notes');
  writeFileSync(join(t, 'pipeline.yml'), 'jobs: {}'); // root — not under ci/
  const mdHits = iterFiles(t, ['design/*.md']).map((p) =>
    p.slice(t.length + 1)
  );
  assert.deepEqual(
    mdHits,
    ['design/spec.md'],
    'design/*.md must match only markdown under design/'
  );
  const ymlHits = iterFiles(t, ['ci/pipeline.yml']).map((p) =>
    p.slice(t.length + 1)
  );
  assert.deepEqual(
    ymlHits,
    ['ci/pipeline.yml'],
    'ci/pipeline.yml must match the file at that exact path, not the root copy'
  );
});

test('iterFiles matches **/-prefixed path globs at any depth', () => {
  const t = mkdtempSync(join(tmpdir(), 'det-'));
  mkdirSync(join(t, 'packages', 'a', 'design'), { recursive: true });
  writeFileSync(join(t, 'packages', 'a', 'design', 'doc.md'), '# doc');
  const hits = iterFiles(t, ['**/design/*.md']).map((p) =>
    p.slice(t.length + 1)
  );
  assert.deepEqual(
    hits,
    ['packages/a/design/doc.md'],
    '**/design/*.md must match design/ dirs at any depth'
  );
});

test('grep finds pattern with location', () => {
  const t = mkdtempSync(join(tmpdir(), 'det-'));
  writeFileSync(join(t, 'm.py'), 'ok\nexcept A, B:\n');
  const hits = grep(t, /except\s+\w+\s*,\s*\w+\s*:/, ['**/*.py']);
  assert.ok(
    hits.length && hits[0].line === 2 && hits[0].text.includes('except A, B')
  );
});
