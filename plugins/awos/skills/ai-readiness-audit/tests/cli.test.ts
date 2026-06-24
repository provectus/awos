/**
 * cli.test.ts — hermetic smoke tests for dist/cli.js (the bundled dispatcher).
 *
 * Runs against the BUNDLED file, not the TypeScript sources, so build:engine
 * must be run before this test suite executes.
 *
 * Node path: hardcoded to /opt/homebrew/bin/node because the system `node`
 * on this machine is a Bun shim.  In CI, `node` is real Node so the hardcode
 * is safe (the path won't exist and execFileSync will throw with a clear error,
 * which is better than silently running Bun).
 * TODO: switch to process.execPath when CI guarantees a real-Node shim at the
 * default $PATH position (or pass via env NODE_BIN=/opt/homebrew/bin/node).
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

const NODE = '/opt/homebrew/bin/node';
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
// 'metric' command — exits non-zero with a clear error (no metrics yet)
// ---------------------------------------------------------------------------

test('metric <id>: exits non-zero with error JSON (no metric modules yet)', () => {
  const { json, code } = runCli('metric', 'ADP-I1', '/tmp');
  assert.notEqual(code, 0, 'metric must exit non-zero');
  assert.ok(json && typeof json === 'object', 'must print JSON error');
  const err = json as Record<string, unknown>;
  assert.ok(
    typeof err['error'] === 'string' && err['error'].length > 0,
    'error field must be a non-empty string'
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
