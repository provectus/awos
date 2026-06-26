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
