/**
 * Tests for adp_g12_deps metric.
 *
 * Contracts verified:
 * - package.json: dependencies + devDependencies counted
 * - pyproject.toml: project.dependencies counted
 * - requirements.txt: non-blank, non-comment lines counted
 * - go.mod: direct require entries counted (indirect excluded)
 * - Cargo.toml: [dependencies] entries counted
 * - SKIP when no supported manifest found
 * - categories_awarded includes 1303 when data available
 * - kind is "computed"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compute } from '../metrics/adp_g12_deps.ts';
import { loadStandards } from './helpers.ts';

const standards = loadStandards();

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'g12-'));
}

test('adp_g12: counts dependencies from package.json', () => {
  const tmp = makeTmpDir();
  writeFileSync(
    join(tmp, 'package.json'),
    JSON.stringify({
      name: 'test',
      dependencies: { express: '^4.0', lodash: '^4.0' },
      devDependencies: { jest: '^29.0', typescript: '^5.0' },
    })
  );

  const result = compute('', standards, {}, tmp);

  assert.equal(result.status, 'OK', 'status must be OK');
  assert.equal(result.kind, 'computed', 'kind must be "computed"');
  assert.ok(
    result.categories_awarded.includes(1303),
    'code 1303 must be awarded'
  );

  const val = result.value as { total_direct_deps: number };
  // 2 deps + 2 devDeps = 4
  assert.equal(
    val.total_direct_deps,
    4,
    `expected 4 total deps, got ${val.total_direct_deps}`
  );
});

test('adp_g12: counts dependencies from requirements.txt', () => {
  const tmp = makeTmpDir();
  writeFileSync(
    join(tmp, 'requirements.txt'),
    [
      '# This is a comment',
      'requests>=2.0',
      'numpy==1.24.0',
      '',
      'Flask>=2.3',
      '-r base-requirements.txt', // -r lines excluded
    ].join('\n')
  );

  const result = compute('', standards, {}, tmp);

  assert.equal(result.status, 'OK');
  const val = result.value as { total_direct_deps: number };
  // 3 non-comment, non-blank, non -r lines
  assert.equal(
    val.total_direct_deps,
    3,
    `expected 3 deps, got ${val.total_direct_deps}`
  );
});

test('adp_g12: counts direct dependencies from go.mod', () => {
  const tmp = makeTmpDir();
  writeFileSync(
    join(tmp, 'go.mod'),
    [
      'module example.com/mymodule',
      '',
      'go 1.21',
      '',
      'require (',
      '    github.com/gin-gonic/gin v1.9.0',
      '    github.com/indirect/pkg v0.1.0 // indirect',
      '    github.com/direct/pkg v1.0.0',
      ')',
    ].join('\n')
  );

  const result = compute('', standards, {}, tmp);

  assert.equal(result.status, 'OK');
  const val = result.value as { total_direct_deps: number };
  // 2 direct (gin + direct/pkg), 1 indirect excluded
  assert.equal(
    val.total_direct_deps,
    2,
    `expected 2 direct go deps, got ${val.total_direct_deps}`
  );
});

test('adp_g12: counts dependencies from Cargo.toml', () => {
  const tmp = makeTmpDir();
  writeFileSync(
    join(tmp, 'Cargo.toml'),
    [
      '[package]',
      'name = "myapp"',
      'version = "0.1.0"',
      '',
      '[dependencies]',
      'serde = { version = "1.0", features = ["derive"] }',
      'tokio = { version = "1.0", features = ["full"] }',
      '',
      '[dev-dependencies]',
      'assert_matches = "1.5"',
    ].join('\n')
  );

  const result = compute('', standards, {}, tmp);

  assert.equal(result.status, 'OK');
  const val = result.value as { total_direct_deps: number };
  // 2 deps + 1 dev-dep = 3
  assert.equal(
    val.total_direct_deps,
    3,
    `expected 3 Cargo deps, got ${val.total_direct_deps}`
  );
});

test('adp_g12: SKIP when no manifest found', () => {
  const tmp = makeTmpDir();
  writeFileSync(join(tmp, 'main.go'), 'package main\nfunc main() {}\n');

  const result = compute('', standards, {}, tmp);

  assert.equal(result.status, 'SKIP', 'must SKIP when no manifest found');
  assert.equal(result.value, null, 'value must be null on SKIP');
});

test('adp_g12: SKIP when repo path does not exist', () => {
  const result = compute('', standards, {}, '/nonexistent/path/g12-test');
  assert.equal(result.status, 'SKIP');
  assert.equal(result.value, null);
});

test('adp_g12: by_manifest breakdown is provided', () => {
  const tmp = makeTmpDir();
  writeFileSync(
    join(tmp, 'package.json'),
    JSON.stringify({
      dependencies: { react: '^18.0' },
      devDependencies: { webpack: '^5.0', 'webpack-cli': '^5.0' },
    })
  );

  const result = compute('', standards, {}, tmp);

  assert.equal(result.status, 'OK');
  const val = result.value as { by_manifest: Record<string, number> };
  const manifestPaths = Object.keys(val.by_manifest);
  assert.equal(manifestPaths.length, 1, 'one manifest entry');
  assert.ok(
    manifestPaths[0].endsWith('package.json'),
    `manifest path must end with package.json, got ${manifestPaths[0]}`
  );
  assert.equal(val.by_manifest[manifestPaths[0]], 3, '1 dep + 2 devDeps = 3');
});

test('adp_g12: reliability tag is not-reliable', () => {
  const tmp = makeTmpDir();
  writeFileSync(join(tmp, 'requirements.txt'), 'flask\n');
  const result = compute('', standards, {}, tmp);
  assert.equal(result.reliability.tag, 'not-reliable');
});

test('adp_g12: metric id is adp_g12_deps', () => {
  const tmp = makeTmpDir();
  writeFileSync(
    join(tmp, 'package.json'),
    JSON.stringify({ dependencies: { x: '1' } })
  );
  const result = compute('', standards, {}, tmp);
  assert.equal(result.metric, 'adp_g12_deps');
});

// ---------------------------------------------------------------------------
// Phase 3b: score/confidence contracts
// ---------------------------------------------------------------------------

test('adp_g12: score=1.0 and confidence=1.0 when deps found (observational metric)', () => {
  const tmp = makeTmpDir();
  writeFileSync(
    join(tmp, 'package.json'),
    JSON.stringify({ dependencies: { react: '^18', axios: '^1' } })
  );

  const result = compute('', standards, {}, tmp);
  assert.equal(
    result.score,
    1.0,
    'score must be 1.0 when deps found (observational — count alone is informational)'
  );
  assert.equal(
    result.confidence,
    1.0,
    'confidence must be 1.0 when manifest present'
  );
});

test('adp_g12: score=0 and confidence=0 on SKIP (no manifest)', () => {
  const tmp = makeTmpDir();
  const result = compute('', standards, {}, tmp);
  assert.equal(result.score, 0, 'score must be 0 on SKIP');
  assert.equal(result.confidence, 0, 'confidence must be 0 on SKIP');
});
