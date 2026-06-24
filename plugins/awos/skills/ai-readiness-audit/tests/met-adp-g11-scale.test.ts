/**
 * Tests for adp_g11_scale metric.
 *
 * Contracts verified:
 * - total_loc and file_count are correct for a known fixture directory
 * - by_language breakdown is correct
 * - categories_awarded includes 1302 when files are found
 * - status is OK when files found, SKIP when no recognized files
 * - kind is "computed"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g11_scale.ts';
import { loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g11-'));
}

test('adp_g11: counts LOC and files for a JS repo', () => {
  const tmp = makeTmpDir();
  // Write 5 non-blank lines in a JS file and 3 blank lines
  writeFileSync(
    join(tmp, 'index.js'),
    [
      'function hello() {',
      '  return 42;',
      '}',
      '',
      'const x = 1;',
      'const y = 2;',
      '',
      'module.exports = { hello };',
    ].join('\n')
  );

  const result = compute('', standards, {}, tmp);

  assert.equal(result.status, 'OK', 'status must be OK when JS files found');
  assert.equal(result.kind, 'computed', 'kind must be "computed"');
  assert.ok(
    result.categories_awarded.includes(1302),
    'code 1302 must be awarded'
  );

  const val = result.value as {
    total_loc: number;
    file_count: number;
    by_language: Record<string, { files: number; loc: number }>;
  };
  assert.equal(val.file_count, 1, 'one JS file');
  // Non-blank lines: 6 (lines 1,2,3,5,6,8)
  assert.equal(
    val.total_loc,
    6,
    `expected 6 non-blank LOC, got ${val.total_loc}`
  );
  assert.ok('JavaScript' in val.by_language, 'JavaScript key must exist');
  assert.equal(val.by_language['JavaScript'].files, 1, 'JS file count');
  assert.equal(val.by_language['JavaScript'].loc, 6, 'JS LOC');
});

test('adp_g11: multi-language breakdown', () => {
  const tmp = makeTmpDir();
  writeFileSync(join(tmp, 'main.py'), 'def f():\n    pass\n\nx = 1\n');
  writeFileSync(join(tmp, 'app.ts'), 'export function g(): void {}\n');

  const result = compute('', standards, {}, tmp);

  assert.equal(result.status, 'OK');
  const val = result.value as {
    total_loc: number;
    file_count: number;
    by_language: Record<string, { files: number; loc: number }>;
  };
  assert.equal(val.file_count, 2, 'two files');
  assert.ok('Python' in val.by_language, 'Python key');
  assert.ok('TypeScript' in val.by_language, 'TypeScript key');
  // Python: 3 non-blank lines (def f():, pass, x = 1)
  assert.equal(
    val.by_language['Python'].loc,
    3,
    `Python LOC, got ${val.by_language['Python'].loc}`
  );
  // TypeScript: 1 non-blank line
  assert.equal(val.by_language['TypeScript'].loc, 1, 'TypeScript LOC');
});

test('adp_g11: SKIP when no recognized source files', () => {
  const tmp = makeTmpDir();
  writeFileSync(join(tmp, 'README.md'), '# hello\n');
  writeFileSync(join(tmp, 'config.yaml'), 'key: value\n');

  const result = compute('', standards, {}, tmp);

  assert.equal(
    result.status,
    'SKIP',
    'must SKIP when no recognized source files'
  );
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g11: SKIP when repo path does not exist', () => {
  const result = compute(
    '',
    standards,
    {},
    '/nonexistent/path/that/does/not/exist'
  );
  assert.equal(result.status, 'SKIP');
  assert.equal(result.value, null);
});

test('adp_g11: node_modules and .git dirs are excluded', () => {
  const tmp = makeTmpDir();
  // Source file in root
  writeFileSync(join(tmp, 'app.js'), 'const x = 1;\n');
  // File in node_modules — should be excluded
  mkdirSync(join(tmp, 'node_modules'), { recursive: true });
  writeFileSync(
    join(tmp, 'node_modules', 'pkg.js'),
    'const big = 1;\nconst big2 = 2;\nconst big3 = 3;\n'
  );

  const result = compute('', standards, {}, tmp);

  assert.equal(result.status, 'OK');
  const val = result.value as { total_loc: number; file_count: number };
  assert.equal(val.file_count, 1, 'only 1 file (node_modules excluded)');
  assert.equal(val.total_loc, 1, 'only 1 LOC (node_modules excluded)');
});

test('adp_g11: reliability tag is not-reliable', () => {
  const tmp = makeTmpDir();
  writeFileSync(join(tmp, 'f.go'), 'package main\nfunc main() {}\n');
  const result = compute('', standards, {}, tmp);
  assert.equal(
    result.reliability.tag,
    'not-reliable',
    'reliability must be not-reliable'
  );
  assert.equal(result.reliability.confidence, 'HIGH');
});

test('adp_g11: metric id is adp_g11_scale', () => {
  const tmp = makeTmpDir();
  writeFileSync(join(tmp, 'f.rs'), 'fn main() {}\n');
  const result = compute('', standards, {}, tmp);
  assert.equal(result.metric, 'adp_g11_scale');
});
