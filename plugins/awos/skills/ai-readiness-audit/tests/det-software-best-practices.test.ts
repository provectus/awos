import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectExceptClauseDefect,
  detectLockfiles,
  detectErrorHandling,
  detectLinting,
  detectFormatting,
  detectTypeSafety,
  detectCiCd,
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

// ---------------------------------------------------------------------------
// detectLinting (2700)
// ---------------------------------------------------------------------------

test('detectLinting: .eslintrc.json is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.eslintrc.json'), '{"rules":{}}\n');
  const r = detectLinting(t);
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.some((e) => e.includes('.eslintrc.json')));
  assert.equal(r.method, 'detected');
});

test('detectLinting: eslint.config.js is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'eslint.config.js'), 'export default [];\n');
  assert.equal(detectLinting(t).status, 'PASS');
});

test('detectLinting: pyproject.toml with [tool.ruff] is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'pyproject.toml'), '[tool.ruff]\nline-length = 88\n');
  assert.equal(detectLinting(t).status, 'PASS');
});

test('detectLinting: .pylintrc is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.pylintrc'), '[MASTER]\n');
  assert.equal(detectLinting(t).status, 'PASS');
});

test('detectLinting: no config is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print(1)\n');
  assert.equal(detectLinting(t).status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectFormatting (2701)
// ---------------------------------------------------------------------------

test('detectFormatting: .prettierrc is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.prettierrc'), '{"singleQuote":true}\n');
  const r = detectFormatting(t);
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.some((e) => e.includes('.prettierrc')));
  assert.equal(r.method, 'detected');
});

test('detectFormatting: prettier.config.js is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'prettier.config.js'), 'module.exports = {};\n');
  assert.equal(detectFormatting(t).status, 'PASS');
});

test('detectFormatting: pyproject.toml with [tool.black] is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'pyproject.toml'), '[tool.black]\nline-length = 88\n');
  assert.equal(detectFormatting(t).status, 'PASS');
});

test('detectFormatting: pre-commit hook with prettier is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, '.pre-commit-config.yaml'),
    'repos:\n  - repo: https://github.com/prettier/prettier\n    hooks:\n      - id: prettier\n'
  );
  assert.equal(detectFormatting(t).status, 'PASS');
});

test('detectFormatting: no config is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'index.ts'), 'export const x = 1;\n');
  assert.equal(detectFormatting(t).status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectTypeSafety (2702)
// ---------------------------------------------------------------------------

test('detectTypeSafety: tsconfig with strict:true is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'tsconfig.json'),
    '{"compilerOptions":{"strict":true}}\n'
  );
  const r = detectTypeSafety(t);
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.some((e) => e.includes('tsconfig.json')));
  assert.equal(r.method, 'detected');
});

test('detectTypeSafety: tsconfig with noImplicitAny:true is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'tsconfig.json'),
    '{"compilerOptions":{"noImplicitAny":true}}\n'
  );
  assert.equal(detectTypeSafety(t).status, 'PASS');
});

test('detectTypeSafety: tsconfig without strict is WARN', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'tsconfig.json'),
    '{"compilerOptions":{"target":"es2020"}}\n'
  );
  assert.equal(detectTypeSafety(t).status, 'WARN');
});

test('detectTypeSafety: mypy.ini is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'mypy.ini'), '[mypy]\nstrict = true\n');
  assert.equal(detectTypeSafety(t).status, 'PASS');
});

test('detectTypeSafety: pyproject.toml with [tool.mypy] is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'pyproject.toml'), '[tool.mypy]\nstrict = true\n');
  assert.equal(detectTypeSafety(t).status, 'PASS');
});

test('detectTypeSafety: no config is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'readme.md'), '# project\n');
  assert.equal(detectTypeSafety(t).status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectCiCd (2703)
// ---------------------------------------------------------------------------

test('detectCiCd: .github/workflows/*.yml is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(t, '.github', 'workflows', 'ci.yml'), 'on: push\n');
  const r = detectCiCd(t);
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.some((e) => e.includes('ci.yml')));
  assert.equal(r.method, 'detected');
});

test('detectCiCd: .gitlab-ci.yml is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, '.gitlab-ci.yml'), 'stages:\n  - test\n');
  assert.equal(detectCiCd(t).status, 'PASS');
});

test('detectCiCd: Jenkinsfile is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'Jenkinsfile'), 'pipeline {}\n');
  assert.equal(detectCiCd(t).status, 'PASS');
});

test('detectCiCd: .circleci/config.yml is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.circleci'), { recursive: true });
  writeFileSync(join(t, '.circleci', 'config.yml'), 'version: 2.1\n');
  assert.equal(detectCiCd(t).status, 'PASS');
});

test('detectCiCd: azure-pipelines.yml is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'azure-pipelines.yml'), 'trigger: [main]\n');
  assert.equal(detectCiCd(t).status, 'PASS');
});

test('detectCiCd: no CI config is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'index.ts'), 'export const x = 1;\n');
  assert.equal(detectCiCd(t).status, 'FAIL');
});

// ---------------------------------------------------------------------------
// DETECTORS map
// ---------------------------------------------------------------------------

test('DETECTORS map contains codes 2700, 2701, 2702, 2703, 2704, 2705, 2706', () => {
  assert.ok(2700 in DETECTORS, 'DETECTORS must include 2700 (detectLinting)');
  assert.ok(
    2701 in DETECTORS,
    'DETECTORS must include 2701 (detectFormatting)'
  );
  assert.ok(
    2702 in DETECTORS,
    'DETECTORS must include 2702 (detectTypeSafety)'
  );
  assert.ok(2703 in DETECTORS, 'DETECTORS must include 2703 (detectCiCd)');
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
