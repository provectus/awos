/**
 * cli.test.ts — hermetic smoke tests for dist/cli.js (the bundled dispatcher).
 *
 * Runs against the BUNDLED file, not the TypeScript sources, so build:engine
 * must be run before this test suite executes.
 *
 * Node path: the subprocess is spawned with the same Node binary that runs
 * this test (`process.execPath`), so it stays portable across CI and local
 * runs. Override with the NODE_BIN env var when a different binary is required.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE = process.env.NODE_BIN || process.execPath;
const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(SKILL, 'dist', 'cli.js');

// ---------------------------------------------------------------------------
// Helper: run cli.js and parse stdout as JSON
// ---------------------------------------------------------------------------

function runCli(...args: string[]): { json: unknown; code: number } {
  try {
    const stdout = execFileSync(NODE, [CLI, ...args], {
      encoding: 'utf8',
      // suppress the "module type not specified" warning from Node
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { json: JSON.parse(stdout), code: 0 };
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      status?: number;
    };
    let json: unknown = null;
    try {
      json = JSON.parse(e.stdout ?? '');
    } catch {
      // not parseable — leave null
    }
    return { json, code: e.status ?? 1 };
  }
}

// ---------------------------------------------------------------------------
// 'detect' smoke test — category 2706 (Python-2 except-clause syntax)
// ---------------------------------------------------------------------------

test('detect 2706: FAIL when repo contains Python-2 except-clause syntax', () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'awos-cli-test-'));
  try {
    // Write a Python file that triggers the pattern: `except A, B:` (Py2-only)
    mkdirSync(join(tmpRepo, 'src'), { recursive: true });
    writeFileSync(
      join(tmpRepo, 'src', 'bad.py'),
      'try:\n    risky()\nexcept ValueError, IOError:\n    pass\n'
    );

    const { json, code } = runCli('detect', '2706', tmpRepo);

    assert.equal(
      code,
      0,
      'detect must exit 0 even when result is FAIL (it found the defect)'
    );
    assert.ok(json && typeof json === 'object', 'output must be a JSON object');
    const result = json as Record<string, unknown>;
    assert.equal(
      result['status'],
      'FAIL',
      'status must be FAIL for a file with Python-2 except syntax'
    );
    assert.ok(Array.isArray(result['evidence']), 'evidence must be an array');
    const evidence = result['evidence'] as string[];
    assert.ok(
      evidence.some((e) => e.includes('bad.py')),
      `evidence must mention bad.py; got: ${JSON.stringify(evidence)}`
    );
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 'collect' smoke test — git collector produces a valid artifact
// ---------------------------------------------------------------------------

test('collect git: artifact has source === "git" and required fields', () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'awos-cli-collect-'));
  try {
    // Init a minimal git repo so the git collector can run
    execFileSync('git', ['init', '--quiet', tmpRepo]);
    execFileSync('git', [
      '-C',
      tmpRepo,
      'config',
      'user.email',
      'test@example.com',
    ]);
    execFileSync('git', ['-C', tmpRepo, 'config', 'user.name', 'Test']);
    writeFileSync(join(tmpRepo, 'README.md'), '# test\n');
    execFileSync('git', ['-C', tmpRepo, 'add', '.']);
    execFileSync('git', ['-C', tmpRepo, 'commit', '--quiet', '-m', 'init']);

    const { json, code } = runCli('collect', 'git', tmpRepo);

    assert.equal(code, 0, 'collect git must exit 0');
    assert.ok(json && typeof json === 'object', 'output must be a JSON object');
    const artifact = json as Record<string, unknown>;

    assert.equal(artifact['source'], 'git', 'artifact.source must be "git"');
    assert.ok('available' in artifact, 'artifact must have available field');
    assert.ok('period' in artifact, 'artifact must have period field');
    assert.ok('raw' in artifact, 'artifact must have raw field');
    assert.equal(
      artifact['available'],
      true,
      'artifact.available must be true for a valid git repo'
    );
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 'metric' command — exits non-zero with a clear error for unknown metric id
// ---------------------------------------------------------------------------

test('metric <id>: exits non-zero with error JSON for unknown metric id', () => {
  const { json, code } = runCli('metric', 'ADP-I1', '/tmp');
  assert.notEqual(code, 0, 'unknown metric id must exit non-zero');
  assert.ok(json && typeof json === 'object', 'must print JSON error');
  const err = json as Record<string, unknown>;
  assert.ok(
    typeof err['error'] === 'string' && err['error'].length > 0,
    'error field must be a non-empty string naming the unknown metric'
  );
});

// ---------------------------------------------------------------------------
// unknown collector exits non-zero
// ---------------------------------------------------------------------------

test('collect unknown-source: exits non-zero with error JSON', () => {
  const { json, code } = runCli('collect', 'nonexistent', '/tmp');
  assert.notEqual(code, 0, 'unknown collector must exit non-zero');
  assert.ok(json && typeof json === 'object', 'must print JSON error');
  const err = json as Record<string, unknown>;
  assert.ok(typeof err['error'] === 'string', 'error field must be a string');
});

// ---------------------------------------------------------------------------
// 'standards' verb — parses standards.toml and emits JSON
// ---------------------------------------------------------------------------

test('standards: parses standards.toml, emits JSON with expected codes and meta', () => {
  // Use the canonical standards.toml shipped with this plugin.
  const standardsPath = join(SKILL, 'references', 'standards.toml');

  const { json, code } = runCli('standards', standardsPath);

  assert.equal(code, 0, 'standards must exit 0');
  assert.ok(json && typeof json === 'object', 'output must be a JSON object');

  const parsed = json as Record<string, unknown>;

  // [meta] must be present with the locked cadence constants.
  assert.ok(
    parsed['meta'] && typeof parsed['meta'] === 'object',
    'parsed JSON must have a "meta" key'
  );
  const meta = parsed['meta'] as Record<string, unknown>;
  assert.equal(
    meta['monthly_bucket_days'],
    undefined,
    'meta.monthly_bucket_days must be absent (bucket machinery removed)'
  );

  // [category.*] tables must be present.
  assert.ok(
    parsed['category'] && typeof parsed['category'] === 'object',
    'parsed JSON must have a "category" key'
  );
  const categories = parsed['category'] as Record<string, unknown>;
  const categoryCodes = Object.values(categories)
    .filter((v) => v && typeof v === 'object')
    .map((v) => (v as Record<string, unknown>)['code'])
    .filter((c) => typeof c === 'number');

  // At minimum the first three ADP-G1 codes (101, 102, 103) must be present.
  for (const expectedCode of [101, 102, 103]) {
    assert.ok(
      categoryCodes.includes(expectedCode),
      `standards.toml categories must include code ${expectedCode}`
    );
  }
});

test('standards: exits non-zero with error JSON when file does not exist', () => {
  const { json, code } = runCli('standards', '/no/such/file.toml');
  assert.notEqual(code, 0, 'standards must exit non-zero when file missing');
  assert.ok(json && typeof json === 'object', 'must print JSON error');
  const err = json as Record<string, unknown>;
  assert.ok(
    typeof err['error'] === 'string' && err['error'].length > 0,
    'error field must be a non-empty string'
  );
});

// ---------------------------------------------------------------------------
// 'metric' query-once path — collectedDir argument reads pre-written artifacts
// ---------------------------------------------------------------------------

test('metric adp_g2_contributors: query-once path reads pre-collected git.json', () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'awos-cli-queryonce-'));
  const collectedDir = join(tmpRepo, 'collected');
  try {
    // Init a minimal git repo.
    execFileSync('git', ['init', '--quiet', tmpRepo]);
    execFileSync('git', [
      '-C',
      tmpRepo,
      'config',
      'user.email',
      'test@example.com',
    ]);
    execFileSync('git', ['-C', tmpRepo, 'config', 'user.name', 'Test']);
    writeFileSync(join(tmpRepo, 'README.md'), '# test\n');
    execFileSync('git', ['-C', tmpRepo, 'add', '.']);
    execFileSync('git', ['-C', tmpRepo, 'commit', '--quiet', '-m', 'init']);

    // Step 1: collect git artifact via the collect verb.
    const { json: artifact, code: collectCode } = runCli(
      'collect',
      'git',
      tmpRepo
    );
    assert.equal(collectCode, 0, 'collect git must exit 0');
    mkdirSync(collectedDir, { recursive: true });
    writeFileSync(
      join(collectedDir, 'git.json'),
      JSON.stringify(artifact, null, 2)
    );

    // Step 2: run metric with pre-collected dir (query-once path).
    const { json: result, code: metricCode } = runCli(
      'metric',
      'adp_g2_contributors',
      tmpRepo,
      collectedDir
    );

    assert.equal(metricCode, 0, 'metric adp_g2_contributors must exit 0');
    assert.ok(
      result && typeof result === 'object',
      'output must be a JSON object'
    );
    const r = result as Record<string, unknown>;
    assert.equal(
      r['metric'],
      'adp_g2_contributors',
      'metric field must be "adp_g2_contributors"'
    );
    assert.equal(
      r['status'],
      'OK',
      'adp_g2 must be OK after migrating to window_stats.per_author'
    );
    assert.ok(
      Array.isArray(r['categories_awarded']) &&
        (r['categories_awarded'] as number[]).includes(201),
      'adp_g2 must award code 201 when active contributor count is available'
    );
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});
