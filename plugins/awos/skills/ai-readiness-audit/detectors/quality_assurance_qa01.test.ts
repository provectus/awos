// detectors/quality_assurance_qa01.test.ts
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
    execFileSync(NODE, ['--import', 'tsx', CLI, 'detect', '2500', repo], {
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    })
  );
}

test('QA-01 graded score equals test/source ratio (WARN at 40%)', () => {
  // 2 test files + 5 pure source files → ratio = 2/5 = 0.40 → WARN, score = 0.40
  const repo = mkdtempSync(join(tmpdir(), 'awos-qa01-graded-'));
  try {
    mkdirSync(join(repo, 'app'), { recursive: true });
    // Pure source files (not test files)
    writeFileSync(join(repo, 'app', 'user.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'auth.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'data.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'routes.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'models.py'), 'x = 1\n');
    // Test files (test_*.py pattern)
    writeFileSync(join(repo, 'app', 'test_user.py'), 'def test_user(): pass\n');
    writeFileSync(join(repo, 'app', 'test_auth.py'), 'def test_auth(): pass\n');
    const res = detect(repo);
    assert.equal(
      res.status,
      'WARN',
      `2/5 test ratio must be WARN; got ${res.status}`
    );
    assert.ok(
      typeof res.score === 'number',
      `score must be a number; got ${typeof res.score}`
    );
    assert.ok(
      Math.abs(res.score - 0.4) < 0.01,
      `score must be ≈ 0.40 (2 tests / 5 source); got ${res.score}`
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

test('QA-01 SKIP when no source files found — score=0 confidence=0', () => {
  // Empty repo → no source files → SKIP
  const repo = mkdtempSync(join(tmpdir(), 'awos-qa01-skip-'));
  try {
    writeFileSync(join(repo, 'README.md'), '# empty\n');
    const res = detect(repo);
    assert.equal(
      res.status,
      'SKIP',
      `no source files must be SKIP; got ${res.status}`
    );
    assert.equal(res.score, 0, `SKIP score must be 0; got ${res.score}`);
    assert.equal(
      res.confidence,
      0,
      `SKIP confidence must be 0; got ${res.confidence}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('QA-01 PASS score ≥ 0.6 when test coverage proxy meets threshold', () => {
  // 4 test files + 4 source files → ratio = 1.0 → PASS, score = 1.0
  const repo = mkdtempSync(join(tmpdir(), 'awos-qa01-pass-'));
  try {
    mkdirSync(join(repo, 'app'), { recursive: true });
    writeFileSync(join(repo, 'app', 'user.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'auth.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'data.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'routes.py'), 'x = 1\n');
    writeFileSync(join(repo, 'app', 'test_user.py'), 'def test_user(): pass\n');
    writeFileSync(join(repo, 'app', 'test_auth.py'), 'def test_auth(): pass\n');
    writeFileSync(join(repo, 'app', 'test_data.py'), 'def test_data(): pass\n');
    writeFileSync(
      join(repo, 'app', 'test_routes.py'),
      'def test_routes(): pass\n'
    );
    const res = detect(repo);
    assert.equal(
      res.status,
      'PASS',
      `4/4 test ratio must be PASS; got ${res.status}`
    );
    assert.ok(res.score >= 0.6, `PASS score must be ≥ 0.60; got ${res.score}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
