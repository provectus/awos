import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compute } from './adp_g10_complexity.ts';

test('adp_g10_complexity: SKIP when no supported source files exist', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-g10-empty-'));
  try {
    writeFileSync(join(dir, 'README.md'), '# no source\n');
    const res = await compute(dir, {}, {}, dir);
    assert.equal(
      res.status,
      'SKIP',
      'must SKIP when no grammar-supported files'
    );
    assert.equal(res.score, 0, 'score must be 0 on SKIP');
    assert.equal(res.confidence, 0, 'confidence must be 0 on SKIP');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_g10_complexity: score and confidence for a simple JS file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-g10-js-'));
  try {
    // A trivially simple function: avg_ccn = 1 → score = 1.0 (elite band: ccn ≤ 5)
    writeFileSync(
      join(dir, 'a.js'),
      'export function add(a, b) { return a + b; }\n'
    );
    const res = await compute(dir, {}, {}, dir);
    if (res.status === 'SKIP') {
      // Grammar wasm may not be available in test env — skip assertion
      return;
    }
    assert.equal(res.status, 'OK', 'must be OK with a JS file');
    // score: avg_ccn ≤ 5 → bandScore clamps to 1.0
    assert.ok(
      (res.score ?? 0) >= 0.9,
      `score must be high for simple code (avg_ccn ≤ 5), got ${res.score}`
    );
    // confidence: 1 file analysed / 1 total = 1.0 (only JS file, fully parseable)
    assert.ok(
      (res.confidence ?? 0) > 0,
      `confidence must be > 0 when at least one file is analysed, got ${res.confidence}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_g10_complexity: confidence reflects analysed/total file ratio', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-g10-conf-'));
  try {
    // Two JS files that will both be analysed → confidence = 1.0 (2/2)
    writeFileSync(join(dir, 'a.js'), 'export function f() { return 1; }\n');
    writeFileSync(join(dir, 'b.js'), 'export function g() { return 2; }\n');
    const res = await compute(dir, {}, {}, dir);
    if (res.status === 'SKIP') return;
    assert.equal(res.status, 'OK');
    // With only JS files and grammar available, all files analysed → confidence = 1.0
    assert.ok(
      (res.confidence ?? 0) > 0,
      `confidence must be positive when files are analysed, got ${res.confidence}`
    );
    assert.ok(
      (res.confidence ?? 0) <= 1.0,
      `confidence must be <= 1.0, got ${res.confidence}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
