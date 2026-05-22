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

test('wrapper destinations are PRESERVED when promptForOverwrite returns false', async () => {
  // Wrappers under .claude/commands/awos/ are the user customization
  // layer. If they already exist when the installer runs, the file-copier
  // must consult the injected promptForOverwrite callback. When the
  // callback returns false, existing wrappers must survive byte-for-byte.
  const targetDir = await freshTemp();

  const wrapperPath = path.join(
    targetDir,
    '.claude',
    'commands',
    'awos',
    'architecture.md'
  );
  await fsPromises.mkdir(path.dirname(wrapperPath), { recursive: true });
  const customSentinel = '# USER CUSTOM CONTENT — must survive update\n';
  await fsPromises.writeFile(wrapperPath, customSentinel, 'utf8');

  const promptCalls = [];
  await silenced(() =>
    executeCopyOperations({
      packageRoot: repoRoot,
      targetDir,
      copyOperations,
      promptForOverwrite: async (info) => {
        promptCalls.push(info);
        return false;
      },
    })
  );

  assert.equal(
    promptCalls.length,
    1,
    'promptForOverwrite must be called exactly once when wrapper conflicts exist'
  );
  assert.ok(
    promptCalls[0].files.some((f) => f.endsWith('architecture.md')),
    'prompt payload must list the conflicting wrapper(s)'
  );
  assert.equal(
    promptCalls[0].operation.destination,
    '.claude/commands/awos',
    'prompt payload must identify which destination is at risk'
  );

  const finalContent = await fsPromises.readFile(wrapperPath, 'utf8');
  assert.equal(
    finalContent,
    customSentinel,
    'user customization in .claude/commands/awos/architecture.md must survive verbatim when the user declines overwrite'
  );
});

test('wrapper destinations ARE overwritten when promptForOverwrite returns true', async () => {
  // When the user explicitly opts in (returns true), conflicting wrappers
  // must be replaced with the canonical source content. This is how a
  // user gets fresh wrappers after intentionally deciding to re-sync.
  const targetDir = await freshTemp();

  const wrapperPath = path.join(
    targetDir,
    '.claude',
    'commands',
    'awos',
    'architecture.md'
  );
  await fsPromises.mkdir(path.dirname(wrapperPath), { recursive: true });
  await fsPromises.writeFile(wrapperPath, '# stale custom\n', 'utf8');

  await silenced(() =>
    executeCopyOperations({
      packageRoot: repoRoot,
      targetDir,
      copyOperations,
      promptForOverwrite: async () => true,
    })
  );

  const finalContent = await fsPromises.readFile(wrapperPath, 'utf8');
  const sourceWrapper = await fsPromises.readFile(
    path.join(repoRoot, 'claude', 'commands', 'architecture.md'),
    'utf8'
  );
  assert.equal(
    finalContent,
    sourceWrapper,
    'opt-in overwrite must replace the wrapper with the canonical source'
  );
});

test('promptForOverwrite is not invoked when no wrapper conflicts exist (fresh install)', async () => {
  // Fresh installs have no existing wrappers to clobber, so the prompt
  // must never fire — silent install. This pins the "fresh install = just
  // create files" half of the spec.
  const targetDir = await freshTemp();

  let promptCallCount = 0;
  await silenced(() =>
    executeCopyOperations({
      packageRoot: repoRoot,
      targetDir,
      copyOperations,
      promptForOverwrite: async () => {
        promptCallCount++;
        return false;
      },
    })
  );

  assert.equal(
    promptCallCount,
    0,
    'fresh install must not trigger promptForOverwrite — no existing wrappers to protect'
  );

  // And every wrapper from the source landed in place.
  const sourceWrappers = await fsPromises.readdir(
    path.join(repoRoot, 'claude', 'commands')
  );
  for (const f of sourceWrappers) {
    assert.ok(
      exists(path.join(targetDir, '.claude', 'commands', 'awos', f)),
      `expected fresh-installed wrapper ${f}`
    );
  }
});

test('user opt-out preserves existing wrappers but still installs new ones', async () => {
  // Per-file granularity: the user's existing wrapper survives, but
  // wrappers they don't yet have (e.g., a newly added command) get
  // installed during the same run. This validates that "opt out of
  // override" does not block fresh additions the user has never seen.
  const targetDir = await freshTemp();

  const existingWrapper = path.join(
    targetDir,
    '.claude',
    'commands',
    'awos',
    'architecture.md'
  );
  await fsPromises.mkdir(path.dirname(existingWrapper), { recursive: true });
  const customSentinel = '# preserved on update\n';
  await fsPromises.writeFile(existingWrapper, customSentinel, 'utf8');

  await silenced(() =>
    executeCopyOperations({
      packageRoot: repoRoot,
      targetDir,
      copyOperations,
      promptForOverwrite: async () => false,
    })
  );

  // Existing one survives.
  assert.equal(
    await fsPromises.readFile(existingWrapper, 'utf8'),
    customSentinel,
    'pre-existing wrapper must survive even when other wrappers in the same op are fresh-installed'
  );
  // A non-conflicting source wrapper still lands.
  assert.ok(
    exists(path.join(targetDir, '.claude', 'commands', 'awos', 'product.md')),
    'wrappers the user does not yet have must still be installed when opting out'
  );
});

test('missing source directory is logged and skipped without throwing', async () => {
  // Defensive path in copyDirectory: a copyOperations entry pointing
  // at a non-existent source must not crash the install — it logs an
  // error and continues. We synthesize the failure by pointing the
  // copier at a packageRoot that does not contain the source dir.
  const pkgRoot = await freshTemp();
  const targetDir = await freshTemp();

  const stats = await silenced(() =>
    executeCopyOperations({
      packageRoot: pkgRoot,
      targetDir,
      copyOperations: [
        {
          source: 'does-not-exist',
          destination: '.awos/ghost',
          patterns: ['*'],
          description: 'phantom directory',
        },
      ],
    })
  );

  assert.equal(
    stats.filesCopied,
    0,
    'missing source must yield zero copies, not a thrown error'
  );
});

test('symlinks in the source tree are recreated at the destination', async () => {
  // The copier has a dedicated symlink branch (entry.isSymbolicLink())
  // that is otherwise unreachable from the real source tree. Build a
  // synthetic package root with a symlink inside it to exercise that
  // branch.
  const pkgRoot = await freshTemp();
  const targetDir = await freshTemp();
  const sourceDir = path.join(pkgRoot, 'sym-source');
  await fsPromises.mkdir(sourceDir, { recursive: true });
  await fsPromises.writeFile(
    path.join(sourceDir, 'real.md'),
    '# real\n',
    'utf8'
  );
  // Relative symlink so the destination can resolve it after copy.
  await fsPromises.symlink('real.md', path.join(sourceDir, 'link.md'));

  await silenced(() =>
    executeCopyOperations({
      packageRoot: pkgRoot,
      targetDir,
      copyOperations: [
        {
          source: 'sym-source',
          destination: '.synth/sym',
          patterns: ['*'],
          description: 'synthetic symlink op',
        },
      ],
    })
  );

  const linkStat = await fsPromises.lstat(
    path.join(targetDir, '.synth', 'sym', 'link.md')
  );
  assert.ok(
    linkStat.isSymbolicLink(),
    'link.md must land at the destination as a symlink, not a regular file'
  );
});

test('non-matching patterns skip files even when source has matches', async () => {
  // Patterns are a per-operation filter. A pattern that no source file
  // matches must result in zero copies. Pins copyFile's early-return
  // branch and protects against pattern-matcher regressions.
  const pkgRoot = await freshTemp();
  const targetDir = await freshTemp();
  const sourceDir = path.join(pkgRoot, 'mixed');
  await fsPromises.mkdir(sourceDir, { recursive: true });
  await fsPromises.writeFile(
    path.join(sourceDir, 'keep.md'),
    '# keep\n',
    'utf8'
  );
  await fsPromises.writeFile(
    path.join(sourceDir, 'skip.txt'),
    'should be skipped\n',
    'utf8'
  );

  await silenced(() =>
    executeCopyOperations({
      packageRoot: pkgRoot,
      targetDir,
      copyOperations: [
        {
          source: 'mixed',
          destination: '.synth/mixed',
          patterns: ['*.md'],
          description: 'md-only',
        },
      ],
    })
  );

  assert.ok(
    exists(path.join(targetDir, '.synth/mixed/keep.md')),
    '*.md pattern must include keep.md'
  );
  assert.equal(
    exists(path.join(targetDir, '.synth/mixed/skip.txt')),
    false,
    '*.md pattern must exclude skip.txt — copyFile early-return on pattern miss'
  );
});

test('dry-run countFiles handles a missing source directory cleanly', async () => {
  // Dry-run path (countFiles) has its own missing-source guard. Without
  // this test the early-return branch is never exercised, leaving an
  // uncovered guard that could rot.
  const pkgRoot = await freshTemp();
  const targetDir = await freshTemp();

  const stats = await silenced(() =>
    executeCopyOperations({
      packageRoot: pkgRoot,
      targetDir,
      copyOperations: [
        {
          source: 'absent',
          destination: '.awos/absent',
          patterns: ['*'],
          description: 'phantom',
        },
      ],
      dryRun: true,
    })
  );
  assert.equal(
    stats.filesCopied,
    0,
    'dry-run with missing source must report zero copied files'
  );
});

test('dry-run with preserveOnUpdate conflicts logs preserve, writes nothing, single-counts skips', async () => {
  // Closes the dry-run branch in resolvePreserveDecision (file-copier.js
  // ~lines 280-286). Two contracts pinned: (1) dry-run must not modify
  // the pre-existing wrapper, and (2) stats.filesSkipped counts each
  // conflicting file exactly once — earlier code double-counted via both
  // resolvePreserveDecision and countFiles, inflating the preview.
  const targetDir = await freshTemp();
  const wrapperPath = path.join(
    targetDir,
    '.claude',
    'commands',
    'awos',
    'architecture.md'
  );
  await fsPromises.mkdir(path.dirname(wrapperPath), { recursive: true });
  const sentinel = '# preserved by dry-run\n';
  await fsPromises.writeFile(wrapperPath, sentinel, 'utf8');

  let promptCallCount = 0;
  const stats = await silenced(() =>
    executeCopyOperations({
      packageRoot: repoRoot,
      targetDir,
      copyOperations,
      promptForOverwrite: async () => {
        promptCallCount++;
        return true; // would overwrite if asked — but dry-run must not ask
      },
      dryRun: true,
    })
  );

  assert.equal(
    promptCallCount,
    0,
    'dry-run must never invoke promptForOverwrite — preview only'
  );
  assert.equal(
    await fsPromises.readFile(wrapperPath, 'utf8'),
    sentinel,
    'dry-run must not modify the pre-existing wrapper on disk'
  );
  // The wrapper op has 9 source files (one per command). architecture.md is
  // the only conflict → filesSkipped == 1 (single-count, not double).
  assert.equal(
    stats.filesSkipped,
    1,
    'dry-run preserve path must count each conflict exactly once (no double-count between resolvePreserveDecision and countFiles)'
  );
});

test('source subdirectories recurse correctly in copy, dry-run count, and conflict scan', async () => {
  // Three recursion paths in file-copier (copyDirectory, countFiles, and
  // findConflicts.walk) all need a source that contains a subdirectory
  // to be exercised. The real framework source tree is flat, so we build
  // a synthetic one. This single test pins all three recursion branches.
  const pkgRoot = await freshTemp();
  const targetDir = await freshTemp();
  const topDir = path.join(pkgRoot, 'nested');
  const subDir = path.join(topDir, 'inner');
  await fsPromises.mkdir(subDir, { recursive: true });
  await fsPromises.writeFile(path.join(topDir, 'top.md'), '# top\n', 'utf8');
  await fsPromises.writeFile(path.join(subDir, 'deep.md'), '# deep\n', 'utf8');

  // Pre-create the deep destination to exercise findConflicts walking
  // into a subdirectory and finding an overlapping file there.
  const destSubdir = path.join(targetDir, '.synth/nested/inner');
  await fsPromises.mkdir(destSubdir, { recursive: true });
  const customSentinel = '# preserved deep\n';
  await fsPromises.writeFile(
    path.join(destSubdir, 'deep.md'),
    customSentinel,
    'utf8'
  );

  // 1. Dry-run pass: countFiles must recurse into 'inner/' and report
  //    one preserved + one fresh.
  const dryStats = await silenced(() =>
    executeCopyOperations({
      packageRoot: pkgRoot,
      targetDir,
      copyOperations: [
        {
          source: 'nested',
          destination: '.synth/nested',
          patterns: ['*'],
          description: 'synthetic nested op',
          preserveOnUpdate: true,
        },
      ],
      promptForOverwrite: async () => false,
      dryRun: true,
    })
  );
  assert.equal(
    dryStats.filesSkipped,
    1,
    'dry-run findConflicts must recurse into inner/ and count deep.md as preserved'
  );

  // 2. Real pass: copyDirectory must recurse into 'inner/', preserve
  //    deep.md (conflict) and copy top.md (fresh).
  const stats = await silenced(() =>
    executeCopyOperations({
      packageRoot: pkgRoot,
      targetDir,
      copyOperations: [
        {
          source: 'nested',
          destination: '.synth/nested',
          patterns: ['*'],
          description: 'synthetic nested op',
          preserveOnUpdate: true,
        },
      ],
      promptForOverwrite: async () => false,
    })
  );
  assert.equal(
    await fsPromises.readFile(path.join(destSubdir, 'deep.md'), 'utf8'),
    customSentinel,
    'deep.md inside a subdirectory must be preserved when user opts out'
  );
  assert.ok(
    exists(path.join(targetDir, '.synth/nested/top.md')),
    'top-level fresh file must still be installed in a recursive op'
  );
  assert.equal(
    stats.filesSkipped,
    1,
    'real-run skip count must match the single conflict'
  );
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
