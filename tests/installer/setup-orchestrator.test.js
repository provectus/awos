/**
 * Unit tests for src/core/setup-orchestrator.js.
 *
 * Runs the full five-step pipeline against a fresh temp directory and
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

async function captureOutput(fn) {
  const lines = [];
  const origLog = console.log;
  const origInfo = console.info;
  const origErr = console.error;
  const origWrite = process.stdout.write.bind(process.stdout);
  console.log = (...args) => lines.push(args.join(' '));
  console.info = () => {};
  console.error = () => {};
  process.stdout.write = () => true;
  try {
    await fn();
  } finally {
    console.log = origLog;
    console.info = origInfo;
    console.error = origErr;
    process.stdout.write = origWrite;
  }
  return lines.join('\n');
}

test('the update output tells legacy projects their removed commands are preserved and links the guide', async () => {
  // Alignment-review concern: the upgrade guide is unreachable if
  // nothing in the update output points at it — the users most affected
  // by the 2.0 removals (those still carrying roadmap) must hear
  // about them from the update itself, not from a doc they never open.
  const legacyDir = await freshTemp();
  await fsPromises.mkdir(path.join(legacyDir, '.claude', 'commands', 'awos'), {
    recursive: true,
  });
  await fsPromises.writeFile(
    path.join(legacyDir, '.claude', 'commands', 'awos', 'roadmap.md'),
    'wrapper\n'
  );

  const output = await captureOutput(() =>
    runSetup({ workingDir: legacyDir, packageRoot: repoRoot })
  );
  assert.ok(
    output.includes('/awos:roadmap'),
    'the legacy notice must name each detected removed command'
  );
  assert.ok(
    !output.includes('/awos:hire'),
    'the legacy notice must not name /awos:hire — it is a current command, not a removed one'
  );
  assert.ok(
    output.includes('preserved and keep working'),
    'the legacy notice must state the preservation policy'
  );
  assert.ok(
    output.includes('docs/2.0/upgrading-2.0.md'),
    'the legacy notice must link the upgrade guide'
  );

  const freshDir = await freshTemp();
  const freshOutput = await captureOutput(() =>
    runSetup({ workingDir: freshDir, packageRoot: repoRoot })
  );
  assert.ok(
    !freshOutput.includes('left AWOS in 2.0'),
    'a fresh project must not get the legacy notice'
  );
});

test('end-to-end setup completes against a fresh temp dir', async () => {
  const workingDir = await freshTemp();

  await silenced(() => runSetup({ workingDir, packageRoot: repoRoot }));

  // Expected top-level layout — these are the directories declared in
  // src/config/setup-config.js plus the .claude/settings.json
  // that the marketplace-configurator step creates.
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
