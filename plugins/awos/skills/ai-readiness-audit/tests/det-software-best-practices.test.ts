import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectExceptClauseDefect,
  detectLockfiles,
  detectErrorHandling,
  DETECTORS,
} from '../detectors/software_best_practices.ts';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'sbp-'));
}

// ---------------------------------------------------------------------------
// detectExceptClauseDefect
// ---------------------------------------------------------------------------

test('detects Python-2 except-comma syntax', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'piccolo_extensions.py'),
    'try:\n    f()\nexcept json.JSONDecodeError, TypeError:\n    pass\n'
  );
  const r = detectExceptClauseDefect(t);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.evidence.some((e) => e.includes('piccolo_extensions.py:3')));
  assert.equal(r.method, 'detected');
});

test('modern except tuple is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'ok.py'),
    'try:\n    f()\nexcept (ValueError, TypeError) as e:\n    raise\n'
  );
  assert.equal(detectExceptClauseDefect(t).status, 'PASS');
});

test('except E as name is PASS (not a comma clause)', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'ok2.py'),
    'try:\n    f()\nexcept ValueError as e:\n    log(e)\n'
  );
  assert.equal(detectExceptClauseDefect(t).status, 'PASS');
});

test('no python files is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'readme.md'), '# project\n');
  assert.equal(detectExceptClauseDefect(t).status, 'PASS');
});

// ---------------------------------------------------------------------------
// detectLockfiles
// ---------------------------------------------------------------------------

test('lockfile present is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  assert.equal(detectLockfiles(t).status, 'PASS');
});

test('no lockfile is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  assert.equal(detectLockfiles(t).status, 'FAIL');
});

test('poetry.lock is recognised', () => {
  const t = tmp();
  writeFileSync(join(t, 'poetry.lock'), '[[package]]\nname = "requests"\n');
  const r = detectLockfiles(t);
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.some((e) => e.includes('poetry.lock')));
});

test('Cargo.lock is recognised', () => {
  const t = tmp();
  writeFileSync(join(t, 'Cargo.lock'), '[[package]]\nname = "serde"\n');
  assert.equal(detectLockfiles(t).status, 'PASS');
});

// ---------------------------------------------------------------------------
// detectErrorHandling
// ---------------------------------------------------------------------------

test('all-empty catch blocks is FAIL', () => {
  const t = tmp();
  // Three Python files with empty except blocks, zero logged
  for (let i = 0; i < 3; i++) {
    writeFileSync(
      join(t, `mod${i}.py`),
      `try:\n    f()\nexcept Exception:\n    pass\ntry:\n    g()\nexcept:\n    pass\n`
    );
  }
  const r = detectErrorHandling(t);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.evidence.length > 0);
  assert.equal(r.method, 'detected');
});

test('all-logged catch blocks is PASS', () => {
  const t = tmp();
  // Python files with logged except blocks
  for (let i = 0; i < 3; i++) {
    writeFileSync(
      join(t, `good${i}.py`),
      `try:\n    f()\nexcept Exception as e:\n    logger.error(e)\n    raise\n`
    );
  }
  const r = detectErrorHandling(t);
  assert.equal(r.status, 'PASS');
});

test('mixed catch blocks is WARN (1 bad out of 4 → ~25% → WARN)', () => {
  const t = tmp();
  // 3 properly handled blocks + 1 empty = 25% bad → between 0.1 and 0.5 → WARN
  for (let i = 0; i < 3; i++) {
    writeFileSync(
      join(t, `good${i}.py`),
      `try:\n    f()\nexcept Exception as e:\n    logger.error(e)\n`
    );
  }
  writeFileSync(
    join(t, 'bad.py'),
    `try:\n    f()\nexcept Exception:\n    pass\n`
  );
  const r = detectErrorHandling(t);
  // 1/4 = 25% bad → WARN
  assert.equal(
    r.status,
    'WARN',
    'expected WARN when bad ratio is between 10% and 50%'
  );
});

test('no code files returns PASS (nothing to check)', () => {
  const t = tmp();
  writeFileSync(join(t, 'readme.md'), '# hi\n');
  const r = detectErrorHandling(t);
  assert.equal(r.status, 'PASS');
});

test('detects 3+-name Python-2 except clause (e.g. except A, B, C:)', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'multi.py'),
    'try:\n    f()\nexcept ValueError, TypeError, IOError:\n    pass\n'
  );
  const r = detectExceptClauseDefect(t);
  assert.equal(r.status, 'FAIL', 'three-name except clause should be FAIL');
  assert.ok(r.evidence.some((e) => e.includes('multi.py')));
});

test('comment-only match is PASS (# except A, B: is a comment)', () => {
  const t = tmp();
  writeFileSync(join(t, 'commented.py'), '# except A, B:\nprint("ok")\n');
  const r = detectExceptClauseDefect(t);
  assert.equal(
    r.status,
    'PASS',
    'line starting with # should not trigger FAIL'
  );
});

// ---------------------------------------------------------------------------
// DETECTORS map
// ---------------------------------------------------------------------------

test('DETECTORS map contains codes 2704, 2705, 2706', () => {
  assert.ok(
    2704 in DETECTORS,
    'DETECTORS must include 2704 (detectErrorHandling)'
  );
  assert.ok(2705 in DETECTORS, 'DETECTORS must include 2705 (detectLockfiles)');
  assert.ok(
    2706 in DETECTORS,
    'DETECTORS must include 2706 (detectExceptClauseDefect)'
  );
});

test('DETECTORS[2706] returns same result as detectExceptClauseDefect', () => {
  const t = tmp();
  writeFileSync(join(t, 'bad.py'), 'except E, F:\n    pass\n');
  const direct = detectExceptClauseDefect(t);
  const viaMap = DETECTORS[2706](t);
  assert.equal(viaMap.status, direct.status);
  assert.equal(viaMap.method, 'detected');
});
