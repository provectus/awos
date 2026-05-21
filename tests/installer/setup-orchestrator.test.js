/**
 * Unit tests for src/core/setup-orchestrator.js.
 *
 * Runs the full six-step pipeline against a fresh temp directory and
 * verifies the resulting tree. Re-running it should be safely idempotent.
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = fs.promises;
const path = require('node:path');

const { runSetup } = require('../../src/core/setup-orchestrator');
const {
  makeTempDir,
  removeTempDir,
  exists,
  silenced,
} = require('../helpers/temp-project');

const repoRoot = path.resolve(__dirname, '..', '..');

const createdDirs = [];
async function freshTemp() {
  const d = await makeTempDir();
  createdDirs.push(d);
  return d;
}

after(async () => {
  for (const d of createdDirs) await removeTempDir(d);
});

test('end-to-end setup completes against a fresh temp dir', async () => {
  const workingDir = await freshTemp();

  await silenced(() => runSetup({ workingDir, packageRoot: repoRoot }));

  // Expected top-level layout — these are the directories declared in
  // src/config/setup-config.js plus the .mcp.json and .claude/settings.json
  // that the configurator steps create.
  for (const p of [
    '.awos',
    '.awos/commands',
    '.awos/templates',
    '.awos/scripts',
    '.claude',
    '.claude/commands/awos',
    'context',
    'context/product',
    'context/spec',
  ]) {
    assert.ok(
      exists(path.join(workingDir, p)),
      `expected directory ${p} to exist after setup`
    );
  }

  // At least one file from each copy operation should be present.
  for (const sub of [
    '.awos/commands',
    '.awos/templates',
    '.awos/scripts',
    '.claude/commands/awos',
  ]) {
    const entries = await fsPromises.readdir(path.join(workingDir, sub));
    assert.ok(
      entries.length > 0,
      `${sub} should contain at least one copied file`
    );
  }

  // MCP and marketplace files exist.
  assert.ok(
    exists(path.join(workingDir, '.mcp.json')),
    '.mcp.json should be created by the MCP configurator'
  );
  assert.ok(
    exists(path.join(workingDir, '.claude', 'settings.json')),
    '.claude/settings.json should be created by the marketplace configurator'
  );
});

test('running setup twice is idempotent (no errors, identical layout)', async () => {
  const workingDir = await freshTemp();

  await silenced(() => runSetup({ workingDir, packageRoot: repoRoot }));

  // Snapshot the file list after the first run.
  function listAllFiles(dir, base = dir) {
    if (!exists(dir)) return [];
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...listAllFiles(p, base));
      else if (entry.isFile()) out.push(path.relative(base, p));
    }
    return out.sort();
  }
  const before = listAllFiles(workingDir);
  assert.ok(before.length > 0, 'first run should produce files');

  // Second run.
  await silenced(() => runSetup({ workingDir, packageRoot: repoRoot }));
  const after2 = listAllFiles(workingDir);

  assert.deepEqual(
    after2,
    before,
    'second setup run should not add or remove any files'
  );
});

test('setup dry-run produces zero on-disk files', async () => {
  const workingDir = await freshTemp();

  await silenced(() =>
    runSetup({ workingDir, packageRoot: repoRoot, dryRun: true })
  );

  // The directory-creator and MCP/marketplace configurators run in dry-run
  // and shouldn't write files. The file-copier in dry-run is documented to
  // create zero files. We assert the working dir is empty of regular files.
  function countFiles(dir) {
    if (!exists(dir)) return 0;
    let n = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) n += countFiles(p);
      else if (entry.isFile()) n++;
    }
    return n;
  }
  assert.equal(countFiles(workingDir), 0, 'dry-run must not write any files');
});
