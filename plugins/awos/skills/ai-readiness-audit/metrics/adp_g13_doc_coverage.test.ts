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
