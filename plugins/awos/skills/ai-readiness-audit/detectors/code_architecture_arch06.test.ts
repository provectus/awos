// detectors/code_architecture_arch06.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { runDetector } from '../tests/helpers.ts';
import { tmpDir, writeRepo } from '../tests/helpers.ts';

const detect = (repo: string) => runDetector(2105, repo);
const smallFile = (n: number) =>
  Array.from({ length: n }, (_, i) => `x${i} = ${i}`).join('\n') + '\n';
const bigFile = (n: number) =>
  Array.from({ length: n }, (_, i) => `x${i} = ${i}`).join('\n') + '\n';

test('ARCH-06 graded score equals 1 - oversized_ratio (WARN at ~80%)', () => {
  // 1 oversized + 4 small = 20% oversized ratio → WARN, score ≈ 0.80
  const repo = tmpDir('awos-arch06-graded-');
  try {
    writeRepo(repo, {
      'app/big.py': bigFile(400), // oversized (>300 lines)
      'app/a.py': smallFile(50),
      'app/b.py': smallFile(50),
      'app/c.py': smallFile(50),
      'app/d.py': smallFile(50),
    });
    const res = detect(repo);
    assert.equal(
      res.status,
      'WARN',
      `1/5 oversized must be WARN; got ${res.status}`
    );
    assert.ok(
      typeof res.score === 'number',
      `score must be a number; got ${typeof res.score}`
    );
    // ratio = 0.2 → score = 1 - 0.2 = 0.8
    assert.ok(
      Math.abs(res.score - 0.8) < 0.01,
      `score must be ≈ 0.80 (1 - 0.20 oversized); got ${res.score}`
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

test('ARCH-06 ignores generated files when judging file size', () => {
  const repo = tmpDir('awos-arch06-');
  try {
    writeRepo(repo, {
      'app/main.py': bigFile(50), // small, hand-written
      'htmlcov/coverage_html.js': bigFile(2000), // generated, huge
      'app/user_pb2.py': bigFile(2000), // generated, huge
    });
    const res = detect(repo);
    const ev = (res.evidence ?? []).join(' ');
    assert.ok(
      !ev.includes('htmlcov'),
      `generated htmlcov must be excluded; got ${ev}`
    );
    assert.ok(
      !ev.includes('_pb2'),
      `generated _pb2 must be excluded; got ${ev}`
    );
    assert.equal(
      res.status,
      'PASS',
      `only a small hand-written file remains; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
