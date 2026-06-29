// detectors/code_architecture_arch06.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.ts');
const NODE = process.env.NODE_BIN || process.execPath;
const smallFile = (n: number) =>
  Array.from({ length: n }, (_, i) => `x${i} = ${i}`).join('\n') + '\n';
const bigFile = (n: number) =>
  Array.from({ length: n }, (_, i) => `x${i} = ${i}`).join('\n') + '\n';

test('ARCH-06 graded score equals 1 - oversized_ratio (WARN at ~80%)', () => {
  // 1 oversized + 4 small = 20% oversized ratio → WARN, score ≈ 0.80
  const repo = mkdtempSync(join(tmpdir(), 'awos-arch06-graded-'));
  try {
    mkdirSync(join(repo, 'app'), { recursive: true });
    writeFileSync(join(repo, 'app', 'big.py'), bigFile(400)); // oversized (>300 lines)
    writeFileSync(join(repo, 'app', 'a.py'), smallFile(50));
    writeFileSync(join(repo, 'app', 'b.py'), smallFile(50));
    writeFileSync(join(repo, 'app', 'c.py'), smallFile(50));
    writeFileSync(join(repo, 'app', 'd.py'), smallFile(50));
    const out = execFileSync(
      NODE,
      ['--import', 'tsx', CLI, 'detect', '2105', repo],
      { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } }
    );
    const res = JSON.parse(out);
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
  const repo = mkdtempSync(join(tmpdir(), 'awos-arch06-'));
  try {
    mkdirSync(join(repo, 'app'), { recursive: true });
    mkdirSync(join(repo, 'htmlcov'), { recursive: true });
    writeFileSync(join(repo, 'app', 'main.py'), bigFile(50)); // small, hand-written
    writeFileSync(join(repo, 'htmlcov', 'coverage_html.js'), bigFile(2000)); // generated, huge
    writeFileSync(join(repo, 'app', 'user_pb2.py'), bigFile(2000)); // generated, huge
    const out = execFileSync(
      NODE,
      ['--import', 'tsx', CLI, 'detect', '2105', repo],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      }
    );
    const res = JSON.parse(out);
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
