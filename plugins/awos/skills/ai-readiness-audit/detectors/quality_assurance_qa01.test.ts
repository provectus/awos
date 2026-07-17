// detectors/quality_assurance_qa01.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { detectTestInfrastructure } from './quality_assurance.ts';
import { tmpDir, writeRepo } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(2500, repo);

test('QA-01 graded score equals test/source ratio (WARN at 40%)', () => {
  // 2 test files + 5 pure source files → ratio = 2/5 = 0.40 → WARN, score = 0.40
  const repo = tmpDir('awos-qa01-graded-');
  try {
    writeRepo(repo, {
      // Pure source files (not test files)
      'app/user.py': 'x = 1\n',
      'app/auth.py': 'x = 1\n',
      'app/data.py': 'x = 1\n',
      'app/routes.py': 'x = 1\n',
      'app/models.py': 'x = 1\n',
      // Test files (test_*.py pattern)
      'app/test_user.py': 'def test_user(): pass\n',
      'app/test_auth.py': 'def test_auth(): pass\n',
    });
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
  const repo = tmpDir('awos-qa01-skip-');
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
  const repo = tmpDir('awos-qa01-pass-');
  try {
    writeRepo(repo, {
      'app/user.py': 'x = 1\n',
      'app/auth.py': 'x = 1\n',
      'app/data.py': 'x = 1\n',
      'app/routes.py': 'x = 1\n',
      'app/test_user.py': 'def test_user(): pass\n',
      'app/test_auth.py': 'def test_auth(): pass\n',
      'app/test_data.py': 'def test_data(): pass\n',
      'app/test_routes.py': 'def test_routes(): pass\n',
    });
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

test('QA-01 (issue #149): Maven failsafe FooIT.java counts once as a test, not also as a source module', () => {
  // Before the fix, *IT.java matched no testFileGlobs, so FooIT.java was
  // counted as a pure source module (double penalty: excluded from the test
  // count AND inflating the source count). 2 source + 1 IT test → ratio 1/2.
  const repo = tmpDir('awos-qa01-it-');
  try {
    writeRepo(repo, {
      'src/main/java/com/example/Foo.java': 'public class Foo {}\n',
      'src/main/java/com/example/Bar.java': 'public class Bar {}\n',
      'src/test/java/com/example/it/FooIT.java': 'public class FooIT {}\n',
    });
    const res = detect(repo);
    assert.equal(
      res.status,
      'WARN',
      `1 IT test / 2 source modules must be WARN (50% ratio); got ${res.status}`
    );
    assert.ok(
      Math.abs(res.score - 0.5) < 0.01,
      `score must be ≈0.50 — FooIT.java counted once as a test, not double-counted as source; got ${res.score}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 6b.2 — detector reads threshold from params (not hardcoded)
// ---------------------------------------------------------------------------

test('QA-01: detector uses threshold from params — custom threshold=0.4 makes a 40% ratio PASS', () => {
  // 2 test files + 5 source files → ratio = 0.40
  // Default threshold is 0.6 → this would be WARN.
  // With threshold=0.40 passed via params → must be PASS.
  const repo = tmpDir('awos-qa01-thresh-');
  try {
    writeRepo(repo, {
      'app/user.py': 'x = 1\n',
      'app/auth.py': 'x = 1\n',
      'app/data.py': 'x = 1\n',
      'app/routes.py': 'x = 1\n',
      'app/models.py': 'x = 1\n',
      'app/test_user.py': 'def test_user(): pass\n',
      'app/test_auth.py': 'def test_auth(): pass\n',
    });

    // Without params (default 0.6) → WARN
    const resDefault = detectTestInfrastructure(repo);
    assert.equal(
      resDefault.status,
      'WARN',
      `40% ratio must be WARN with default threshold 0.6; got ${resDefault.status}`
    );

    // With threshold=0.4 → PASS (40% ≥ 40%)
    const resCustom = detectTestInfrastructure(repo, { threshold: 0.4 });
    assert.equal(
      resCustom.status,
      'PASS',
      `40% ratio must be PASS with threshold=0.40; got ${resCustom.status}`
    );

    // Evidence must interpolate the threshold percentage
    const passEvidence = resCustom.evidence[0];
    assert.ok(
      passEvidence.includes('40%'),
      `evidence must mention the custom threshold 40%; got "${passEvidence}"`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
