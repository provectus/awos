// detectors/application_security_as02.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(3001, repo);

test('AS-02 graded score = 1/3 when only one security header found (WARN)', () => {
  // Only X-Content-Type-Options → 1 of 3 headers → score ≈ 0.333 → WARN
  const repo = tmpDir('awos-as02-one-');
  try {
    writeFileSync(
      join(repo, 'middleware.py'),
      'response.headers["X-Content-Type-Options"] = "nosniff"\n'
    );
    const res = detect(repo);
    assert.equal(
      res.status,
      'WARN',
      `1/3 headers must be WARN; got ${res.status}`
    );
    assert.ok(
      typeof res.score === 'number',
      `score must be a number; got ${typeof res.score}`
    );
    assert.ok(
      Math.abs(res.score - 1 / 3) < 0.01,
      `score must be ≈ 0.333 (1/3 headers); got ${res.score}`
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

test('AS-02 score = 0 when no security headers found (FAIL)', () => {
  const repo = tmpDir('awos-as02-none-');
  try {
    writeFileSync(join(repo, 'app.py'), 'def handler(): pass\n');
    const res = detect(repo);
    assert.equal(
      res.status,
      'FAIL',
      `no headers must be FAIL; got ${res.status}`
    );
    assert.equal(
      res.score,
      0,
      `score must be 0 when no headers found; got ${res.score}`
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

test('AS-02 score = 2/3 when two security headers found (PASS)', () => {
  // X-Content-Type-Options + X-Frame-Options → 2 of 3 → score ≈ 0.667 → PASS
  const repo = tmpDir('awos-as02-two-');
  try {
    writeFileSync(
      join(repo, 'middleware.py'),
      [
        'response.headers["X-Content-Type-Options"] = "nosniff"',
        'response.headers["X-Frame-Options"] = "DENY"',
      ].join('\n') + '\n'
    );
    const res = detect(repo);
    assert.equal(
      res.status,
      'PASS',
      `2/3 headers must be PASS; got ${res.status}`
    );
    assert.ok(
      Math.abs(res.score - 2 / 3) < 0.01,
      `score must be ≈ 0.667 (2/3 headers); got ${res.score}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('AS-02 score = 1.0 when all three security headers found (PASS)', () => {
  const repo = tmpDir('awos-as02-all-');
  try {
    writeFileSync(
      join(repo, 'middleware.py'),
      [
        'response.headers["X-Content-Type-Options"] = "nosniff"',
        'response.headers["X-Frame-Options"] = "DENY"',
        'response.headers["Strict-Transport-Security"] = "max-age=31536000"',
      ].join('\n') + '\n'
    );
    const res = detect(repo);
    assert.equal(
      res.status,
      'PASS',
      `3/3 headers must be PASS; got ${res.status}`
    );
    assert.ok(
      Math.abs(res.score - 1.0) < 0.01,
      `score must be 1.0 (3/3 headers); got ${res.score}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
