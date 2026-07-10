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

  // Step 7 registers the containment PreToolUse hook, and the guard script it
  // points at rides in via the scripts/* copy operation. Both halves must be
  // present after a full setup or the hook is inert.
  assert.ok(
    exists(path.join(workingDir, '.awos/scripts/awos-containment-guard.js')),
    'the containment guard script should be copied to .awos/scripts/'
  );
  const settings = JSON.parse(
    await fsPromises.readFile(
      path.join(workingDir, '.claude', 'settings.json'),
      'utf8'
    )
  );
  const hookCommands = (settings.hooks?.PreToolUse ?? []).flatMap((g) =>
    (g.hooks ?? []).map((h) => h.command)
  );
  assert.ok(
    hookCommands.some((c) => c && c.includes('awos-containment-guard.js')),
    'settings.json should carry a PreToolUse hook pointing at the containment guard after full setup'
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

test('setup preserves customized wrappers when promptForOverwrite returns false', async () => {
  // End-to-end check for the customization-overwrite fix: pre-seed a
  // customized wrapper, run the full pipeline with an explicit "no"
  // decision, and confirm both halves of the contract:
  //   - the customized wrapper survives byte-for-byte
  //   - other wrappers the user didn't pre-create still get installed
  const workingDir = await freshTemp();
  const wrapperDir = path.join(workingDir, '.claude', 'commands', 'awos');
  await fsPromises.mkdir(wrapperDir, { recursive: true });
  const customSentinel = '# preserved by promptForOverwrite=false\n';
  await fsPromises.writeFile(
    path.join(wrapperDir, 'architecture.md'),
    customSentinel,
    'utf8'
  );

  let promptCallCount = 0;
  await silenced(() =>
    runSetup({
      workingDir,
      packageRoot: repoRoot,
      promptForOverwrite: async () => {
        promptCallCount++;
        return false;
      },
    })
  );

  assert.equal(
    promptCallCount,
    1,
    'promptForOverwrite must be invoked once when wrapper conflicts exist'
  );
  assert.equal(
    await fsPromises.readFile(path.join(wrapperDir, 'architecture.md'), 'utf8'),
    customSentinel,
    'customized wrapper must be preserved when user declines overwrite'
  );
  assert.ok(
    exists(path.join(wrapperDir, 'product.md')),
    'wrappers the user did not pre-create must still be installed'
  );
});

test('setup overwrites wrappers when promptForOverwrite returns true', async () => {
  // Opt-in path: when the user (or --overwrite) approves overwrite, the
  // customized wrapper is replaced with the canonical source.
  const workingDir = await freshTemp();
  const wrapperDir = path.join(workingDir, '.claude', 'commands', 'awos');
  await fsPromises.mkdir(wrapperDir, { recursive: true });
  await fsPromises.writeFile(
    path.join(wrapperDir, 'architecture.md'),
    '# stale\n',
    'utf8'
  );

  await silenced(() =>
    runSetup({
      workingDir,
      packageRoot: repoRoot,
      promptForOverwrite: async () => true,
    })
  );

  const finalBody = await fsPromises.readFile(
    path.join(wrapperDir, 'architecture.md'),
    'utf8'
  );
  const sourceBody = await fsPromises.readFile(
    path.join(repoRoot, 'claude', 'commands', 'architecture.md'),
    'utf8'
  );
  assert.equal(
    finalBody,
    sourceBody,
    'opt-in overwrite must replace wrapper with canonical source'
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
