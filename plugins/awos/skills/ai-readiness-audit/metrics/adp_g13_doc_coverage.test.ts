import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compute } from './adp_g13_doc_coverage.ts';

test('doc-coverage rewards documented definitions over undocumented ones', async () => {
  const documented = mkdtempSync(join(tmpdir(), 'awos-doc-yes-'));
  const bare = mkdtempSync(join(tmpdir(), 'awos-doc-no-'));
  try {
    writeFileSync(
      join(documented, 'a.py'),
      'def f():\n    """Does f."""\n    return 1\n\nclass C:\n    """A class."""\n    pass\n'
    );
    writeFileSync(
      join(bare, 'a.py'),
      'def f():\n    return 1\n\nclass C:\n    pass\n'
    );
    const hi = await compute(documented, {}, { has_python: true }, documented);
    const lo = await compute(bare, {}, { has_python: true }, bare);
    assert.ok(
      Number(hi.value) > Number(lo.value),
      `documented repo must score higher: ${hi.value} vs ${lo.value}`
    );
  } finally {
    rmSync(documented, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test('doc-coverage awards 2204 (public) when public defs are well documented', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-doc-pub-'));
  try {
    // Two public defs, both documented; one private undocumented (ignored by 2204).
    writeFileSync(
      join(dir, 'a.py'),
      'def f():\n    """Does f."""\n    return 1\n\nclass C:\n    """A class."""\n    pass\n\ndef _helper():\n    return 2\n'
    );
    const res = await compute(dir, {}, {}, dir);
    assert.equal(res.status, 'OK', 'metric must run when python files exist');
    assert.ok(
      (res.categories_awarded as number[]).includes(2204),
      `expected 2204 awarded, got ${JSON.stringify(res.categories_awarded)}`
    );
    assert.equal(
      typeof (res as { expression?: string }).expression,
      'string',
      'result must carry an expression string'
    );
    // score: public coverage = 2/2 = 1.0 → score (score2204) = 1.0
    assert.ok(
      (res.score ?? 0) >= 0.9,
      `score must be near 1.0 for fully-documented public defs, got ${res.score}`
    );
    // confidence: 1 file tried, 1 file analysed → confidence = 1.0
    assert.ok(
      Math.abs((res.confidence ?? 0) - 1.0) < 1e-6,
      `confidence must be 1.0 when all files parsed, got ${res.confidence}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doc-coverage score and confidence reflect partial documentation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-doc-partial-'));
  try {
    // One public def documented, one not → publicCoverage = 0.5 → score2204 = 0.5
    writeFileSync(
      join(dir, 'a.py'),
      'def f():\n    """Does f."""\n    return 1\n\ndef g():\n    return 2\n'
    );
    const res = await compute(dir, {}, {}, dir);
    assert.equal(res.status, 'OK', 'metric must run');
    // score2204 = publicCoverage = 0.5
    assert.ok(
      Math.abs((res.score ?? 0) - 0.5) < 0.01,
      `score must be ~0.5 for 50% documented public defs, got ${res.score}`
    );
    // confidence: 1 file tried, 1 analysed → 1.0
    assert.ok(
      Math.abs((res.confidence ?? 0) - 1.0) < 1e-6,
      `confidence must be 1.0 when all files parsed, got ${res.confidence}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doc-coverage SKIPs when no documentable-language files are present', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-doc-skip-'));
  try {
    writeFileSync(join(dir, 'README.txt'), 'no source here\n');
    const res = await compute(dir, {}, {}, dir);
    assert.equal(res.status, 'SKIP', 'metric must SKIP with no source files');
    assert.deepEqual(res.categories_awarded, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doc-coverage detects JSDoc on exported TypeScript functions', async () => {
  const documented = mkdtempSync(join(tmpdir(), 'awos-doc-ts-yes-'));
  const bare = mkdtempSync(join(tmpdir(), 'awos-doc-ts-no-'));
  try {
    writeFileSync(
      join(documented, 'a.ts'),
      '/** Adds. */\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n'
    );
    writeFileSync(
      join(bare, 'a.ts'),
      'export function add(a: number, b: number): number {\n  return a + b;\n}\n'
    );
    const hi = await compute(documented, {}, {}, documented);
    const lo = await compute(bare, {}, {}, bare);
    assert.ok(
      Number(hi.value) > Number(lo.value),
      `documented TS must score higher: ${hi.value} vs ${lo.value}`
    );
  } finally {
    rmSync(documented, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test('doc-coverage detects JSDoc on exported JavaScript functions', async () => {
  const documented = mkdtempSync(join(tmpdir(), 'awos-doc-js-yes-'));
  const bare = mkdtempSync(join(tmpdir(), 'awos-doc-js-no-'));
  try {
    writeFileSync(
      join(documented, 'a.js'),
      '/** Adds two numbers. */\nexport function add(a, b) {\n  return a + b;\n}\n'
    );
    writeFileSync(
      join(bare, 'a.js'),
      'export function add(a, b) {\n  return a + b;\n}\n'
    );
    const hi = await compute(documented, {}, {}, documented);
    const lo = await compute(bare, {}, {}, bare);
    assert.ok(
      Number(hi.value) > Number(lo.value),
      `documented JS must score higher: ${hi.value} vs ${lo.value}`
    );
  } finally {
    rmSync(documented, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test('doc-coverage detects doc-comments on exported Go functions', async () => {
  const documented = mkdtempSync(join(tmpdir(), 'awos-doc-go-yes-'));
  const bare = mkdtempSync(join(tmpdir(), 'awos-doc-go-no-'));
  try {
    writeFileSync(
      join(documented, 'a.go'),
      'package main\n\n// Add adds two numbers.\nfunc Add(a int, b int) int {\n\treturn a + b\n}\n'
    );
    writeFileSync(
      join(bare, 'a.go'),
      'package main\n\nfunc Add(a int, b int) int {\n\treturn a + b\n}\n'
    );
    const hi = await compute(documented, {}, {}, documented);
    const lo = await compute(bare, {}, {}, bare);
    assert.ok(
      Number(hi.value) > Number(lo.value),
      `documented Go must score higher: ${hi.value} vs ${lo.value}`
    );
  } finally {
    rmSync(documented, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test('doc-coverage detects Javadoc on public Java methods and classes', async () => {
  const documented = mkdtempSync(join(tmpdir(), 'awos-doc-java-yes-'));
  const bare = mkdtempSync(join(tmpdir(), 'awos-doc-java-no-'));
  try {
    writeFileSync(
      join(documented, 'Calculator.java'),
      '/** A calculator. */\npublic class Calculator {\n    /** Adds two numbers. */\n    public int add(int a, int b) {\n        return a + b;\n    }\n}\n'
    );
    writeFileSync(
      join(bare, 'Calculator.java'),
      'public class Calculator {\n    public int add(int a, int b) {\n        return a + b;\n    }\n}\n'
    );
    const hi = await compute(documented, {}, {}, documented);
    const lo = await compute(bare, {}, {}, bare);
    assert.ok(
      Number(hi.value) > Number(lo.value),
      `documented Java must score higher: ${hi.value} vs ${lo.value}`
    );
  } finally {
    rmSync(documented, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test('doc-coverage does not penalize 2204 when repo has no public/exported definitions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-doc-no-public-'));
  try {
    // Only private helpers (prefixed with _) — all documented, none public.
    writeFileSync(
      join(dir, 'helpers.py'),
      'def _internal():\n    """Internal helper."""\n    return 1\n\ndef _another():\n    """Another helper."""\n    return 2\n'
    );
    const res = await compute(dir, {}, { has_python: true }, dir);
    assert.notEqual(
      res.status,
      'SKIP',
      'metric must not SKIP when Python files with documentable defs are present'
    );
    assert.ok(
      !(res.categories_awarded as number[]).includes(2204),
      `2204 (DOC-05) must not be awarded when there are no public defs, got ${JSON.stringify(res.categories_awarded)}`
    );
    // Both private helpers are documented — overall coverage = 1.0 ≥ 0.6 → 2205 awarded.
    assert.ok(
      (res.categories_awarded as number[]).includes(2205),
      `2205 (DOC-06) must be awarded when all definitions are documented, got ${JSON.stringify(res.categories_awarded)}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doc-coverage detects KDoc on public Kotlin functions', async () => {
  const documented = mkdtempSync(join(tmpdir(), 'awos-doc-kt-yes-'));
  const bare = mkdtempSync(join(tmpdir(), 'awos-doc-kt-no-'));
  try {
    writeFileSync(
      join(documented, 'a.kt'),
      '/** Adds two numbers. */\nfun add(a: Int, b: Int): Int = a + b\n'
    );
    writeFileSync(join(bare, 'a.kt'), 'fun add(a: Int, b: Int): Int = a + b\n');
    const hi = await compute(documented, {}, {}, documented);
    const lo = await compute(bare, {}, {}, bare);
    assert.ok(
      Number(hi.value) > Number(lo.value),
      `documented Kotlin must score higher: ${hi.value} vs ${lo.value}`
    );
  } finally {
    rmSync(documented, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test('doc-coverage carries per-code evidence — the all-defs code (2205) must not reuse the public-defs line (B5)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-doc-percode-'));
  try {
    // 1 public documented def + 1 private undocumented def:
    // public coverage (2204) = 1/1 = 1.00, overall coverage (2205) = 1/2 = 0.50.
    writeFileSync(
      join(dir, 'a.py'),
      'def f():\n    """Does f."""\n    return 1\n\ndef _helper():\n    return 2\n'
    );
    const res = await compute(dir, {}, {}, dir);
    assert.equal(res.status, 'OK', 'metric must run when python files exist');
    const perCode = (res as { evidence_per_code?: Record<number, string[]> })
      .evidence_per_code;
    assert.ok(perCode, 'result must carry evidence_per_code');
    assert.match(
      perCode![2204][0],
      /public defs documented/,
      `2204 evidence must describe the public surface, got "${perCode![2204][0]}"`
    );
    assert.ok(
      !/public/.test(perCode![2205][0]),
      `2205 evidence must describe ALL defs, not the public surface, got "${perCode![2205][0]}"`
    );
    assert.notEqual(
      perCode![2205][0],
      perCode![2204][0],
      '2205 must not reuse the 2204 evidence line (the B5 mislabel)'
    );
    // With a private undocumented def present, all-defs coverage < public coverage.
    const scores = (res as { score_per_code?: Record<number, number> })
      .score_per_code;
    assert.ok(
      (scores?.[2205] ?? 1) < (scores?.[2204] ?? 0),
      `2205 (all defs) must score below 2204 (public only) here, got ${scores?.[2205]} vs ${scores?.[2204]}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
