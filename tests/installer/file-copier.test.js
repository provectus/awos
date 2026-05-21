/**
 * Unit tests for src/services/file-copier.js.
 *
 * Runs the real `executeCopyOperations` against the real source tree, with
 * the destination set to a fresh fs.mkdtemp() directory. No mocks.
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = fs.promises;
const path = require('node:path');

const { executeCopyOperations } = require('../../src/services/file-copier');
const { copyOperations } = require('../../src/config/setup-config');
const {
  makeTempDir,
  removeTempDir,
  copyTree,
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

test('fresh install copies every source file to its destination', async () => {
  const targetDir = await freshTemp();

  const stats = await silenced(() =>
    executeCopyOperations({
      packageRoot: repoRoot,
      targetDir,
      copyOperations,
    })
  );

  assert.ok(stats.filesCopied > 0, 'expected at least one file to be copied');

  // For each copy operation, walk the source tree and assert that each
  // file lands at its destination.
  for (const op of copyOperations) {
    const srcDir = path.join(repoRoot, op.source);
    const dstDir = path.join(targetDir, op.destination);
    const srcFiles = await fsPromises.readdir(srcDir);
    for (const f of srcFiles) {
      const srcPath = path.join(srcDir, f);
      const dstPath = path.join(dstDir, f);
      const stat = await fsPromises.stat(srcPath);
      if (stat.isFile()) {
        assert.ok(
          exists(dstPath),
          `expected ${op.destination}/${f} to exist after install`
        );
      }
    }
  }
});

test('new framework file auto-discovers (no setup-config edit required)', async () => {
  // Build an isolated "package root" that mirrors the real one but adds an
  // extra synthetic file inside commands/. The copier should pick it up
  // because copyOperations declares patterns: ['*'] — i.e. all files inside
  // the source directory get copied.
  const pkgRoot = await freshTemp();
  const targetDir = await freshTemp();

  // Copy enough of the real source tree to satisfy copyOperations.
  for (const op of copyOperations) {
    await copyTree(
      path.join(repoRoot, op.source),
      path.join(pkgRoot, op.source)
    );
  }

  // Inject a synthetic command file at the package source root.
  const syntheticPath = path.join(pkgRoot, 'commands', 'synth-test.md');
  await fsPromises.writeFile(
    syntheticPath,
    '---\ndescription: synthetic\n---\n# synth\n',
    'utf8'
  );

  await silenced(() =>
    executeCopyOperations({
      packageRoot: pkgRoot,
      targetDir,
      copyOperations,
    })
  );

  assert.ok(
    exists(path.join(targetDir, '.awos', 'commands', 'synth-test.md')),
    'synthetic commands/synth-test.md should land at .awos/commands/synth-test.md without any setup-config.js edit'
  );
});

test('wrapper destinations are OVERWRITTEN by the copier (open question §11)', async () => {
  // OPEN QUESTION — see plan §11.
  //
  // Docs (CLAUDE.md, src/CLAUDE.md) describe .claude/commands/awos/*.md as
  // the "user customization layer". But file-copier.js:55-57 unconditionally
  // unlinks and overwrites the destination. This test pins the CURRENT
  // behaviour (overwrite) so that a future PR which intentionally changes
  // this policy fails this test and forces the team to update the
  // assertion in the same commit. The team should resolve the docs-vs-code
  // tension in a separate follow-up PR; do not "fix" either in this PR.
  const targetDir = await freshTemp();

  // Pre-create the wrapper destination with custom user text.
  const wrapperPath = path.join(
    targetDir,
    '.claude',
    'commands',
    'awos',
    'architecture.md'
  );
  await fsPromises.mkdir(path.dirname(wrapperPath), { recursive: true });
  const customSentinel = '# USER CUSTOM CONTENT — should it survive?\n';
  await fsPromises.writeFile(wrapperPath, customSentinel, 'utf8');

  await silenced(() =>
    executeCopyOperations({
      packageRoot: repoRoot,
      targetDir,
      copyOperations,
    })
  );

  const finalContent = await fsPromises.readFile(wrapperPath, 'utf8');
  // Current code overwrites — the sentinel is gone.
  assert.equal(
    finalContent.includes(customSentinel),
    false,
    'wrapper currently gets overwritten — if this assertion ever flips, the docs/code reconciliation has shipped and this test needs updating'
  );
  // And the destination now matches the source wrapper.
  const sourceWrapper = await fsPromises.readFile(
    path.join(repoRoot, 'claude', 'commands', 'architecture.md'),
    'utf8'
  );
  assert.equal(finalContent, sourceWrapper);
});

test('dry-run creates zero files', async () => {
  const targetDir = await freshTemp();

  const stats = await silenced(() =>
    executeCopyOperations({
      packageRoot: repoRoot,
      targetDir,
      copyOperations,
      dryRun: true,
    })
  );

  assert.ok(stats.filesCopied > 0, 'dry-run still reports counts');

  // Walk the entire target dir — it should have no files in it.
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
  assert.equal(
    countFiles(targetDir),
    0,
    'dry-run must not write any files to disk'
  );
});
