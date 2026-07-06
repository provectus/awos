// detectors/code_architecture_arch05.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;

function detect(repo: string) {
  return JSON.parse(
    execFileSync(NODE, ['--import', 'tsx', CLI, 'detect', '2104', repo], {
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    })
  );
}

test('ARCH-05 is all-or-nothing: one deviating file FAILs with score 0 (AWOS own standard)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-arch05-graded-'));
  try {
    mkdirSync(join(repo, 'app'), { recursive: true });
    // 3 snake_case + 1 camelCase: any departure from the dominant convention
    // fails — no source publishes an acceptable inconsistency rate, so there
    // is no graded WARN band to hide in.
    writeFileSync(join(repo, 'app', 'user_service.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'auth_handler.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'data_model.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'myController.py'), 'x = 1\n');
    const res = detect(repo);
    assert.equal(
      res.status,
      'FAIL',
      `3/4 dominance must FAIL under all-or-nothing; got ${res.status}`
    );
    assert.equal(
      res.score,
      0,
      `all-or-nothing FAIL must award score 0; got ${res.score}`
    );
    assert.ok(
      (res.evidence ?? []).join(' ').includes('all-or-nothing'),
      'evidence must state the all-or-nothing standard'
    );
    assert.equal(
      res.confidence,
      1,
      `confidence must be 1.0; got ${res.confidence}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('ARCH-05 score equals 1.0 on full PASS (dominant 100%)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-arch05-pass-'));
  try {
    mkdirSync(join(repo, 'app'), { recursive: true });
    // All snake_case → ratio = 1.0 → PASS, score = 1.0
    writeFileSync(join(repo, 'app', 'user_service.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'auth_handler.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'data_model.py'), 'x = 1\n');
    const res = detect(repo);
    assert.equal(
      res.status,
      'PASS',
      `all snake_case must be PASS; got ${res.status}`
    );
    assert.ok(
      Math.abs(res.score - 1.0) < 0.01,
      `score must be 1.0 on full dominance; got ${res.score}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('ARCH-05 FAILs mixed naming with score 0', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-arch05-fail-'));
  try {
    mkdirSync(join(repo, 'app'), { recursive: true });
    // 2 snake_case + 2 camelCase + 2 PascalCase = 2/6 ≈ 0.33 → FAIL
    writeFileSync(join(repo, 'app', 'user_service.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'data_model.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'myController.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'authHandler.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'MyService.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'UserModel.py'), 'x = 1\n');
    const res = detect(repo);
    assert.equal(
      res.status,
      'FAIL',
      `mixed naming must be FAIL; got ${res.status}`
    );
    assert.equal(
      res.score,
      0,
      `all-or-nothing FAIL must award score 0; got ${res.score}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('ARCH-05 excludes test files from the naming check (B2) — well-tested repo can PASS', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-arch05-tests-'));
  try {
    mkdirSync(join(repo, 'src'), { recursive: true });
    // 3 snake_case sources + 3 standard *.test.ts files. Before the fix the
    // dotted test basenames counted as "other" → 50% dominance → FAIL.
    for (const name of ['user_service', 'auth_handler', 'data_model']) {
      writeFileSync(join(repo, 'src', `${name}.ts`), 'export const x = 1;\n');
      writeFileSync(
        join(repo, 'src', `${name}.test.ts`),
        'export const t = 1;\n'
      );
    }
    const res = detect(repo);
    assert.equal(
      res.status,
      'PASS',
      `test files must not count as naming violations; got ${res.status}: ${JSON.stringify(res.evidence)}`
    );
    assert.ok(
      Math.abs(res.score - 1.0) < 0.01,
      `score must be 1.0 when all non-test files share a convention; got ${res.score}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('ARCH-05 classifies dotted role qualifiers (.d.ts, .stories.tsx) by their stem', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-arch05-dotted-'));
  try {
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(
      join(repo, 'src', 'user_service.ts'),
      'export const x = 1;\n'
    );
    writeFileSync(
      join(repo, 'src', 'auth_handler.ts'),
      'export const x = 1;\n'
    );
    writeFileSync(join(repo, 'src', 'api_types.d.ts'), 'export type T = 1;\n');
    const res = detect(repo);
    assert.equal(
      res.status,
      'PASS',
      `.d.ts declaration files must classify by stem, not as violations; got ${res.status}: ${JSON.stringify(res.evidence)}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('ARCH-05 emits SKIP, not PASS, when there are no source files to evaluate', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-arch05-empty-'));
  try {
    mkdirSync(join(repo, 'docs'), { recursive: true });
    writeFileSync(join(repo, 'docs', 'readme.txt'), 'hello\n');
    const res = detect(repo);
    assert.equal(
      res.status,
      'SKIP',
      `an empty repo must not PASS the naming check (vacuous pass, A4); got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
