/**
 * Fixture-driven end-to-end installer tests.
 *
 * For every directory under tests/fixtures/<name>/:
 *   1. Make a fresh fs.mkdtemp() temp directory.
 *   2. If the fixture has a before/ subtree, copy it into the temp dir.
 *   3. Run the full installer (runSetup) against the temp dir.
 *   4. Load tests/fixtures/<name>/expected-after.json and assert the
 *      resulting tree matches the manifest.
 *
 * Files not listed in the manifest are not asserted — fixtures are
 * selective by design.
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { runSetup } = require('../src/core/setup-orchestrator');
const {
  makeTempDir,
  removeTempDir,
  copyTree,
  silenced,
} = require('./helpers/temp-project');
const { loadManifest, assertManifest } = require('./helpers/manifest');

const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(__dirname, 'fixtures');

const createdDirs = [];
async function freshTemp() {
  const d = await makeTempDir();
  createdDirs.push(d);
  return d;
}

after(async () => {
  for (const d of createdDirs) await removeTempDir(d);
});

function listFixtures() {
  if (!fs.existsSync(fixturesDir)) return [];
  return fs
    .readdirSync(fixturesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

const fixtures = listFixtures();
assert.ok(
  fixtures.length > 0,
  'expected at least one fixture under tests/fixtures/'
);

for (const name of fixtures) {
  test(`fixture: ${name}`, async () => {
    const fixtureRoot = path.join(fixturesDir, name);
    const beforeDir = path.join(fixtureRoot, 'before');
    const manifestPath = path.join(fixtureRoot, 'expected-after.json');
    assert.ok(
      fs.existsSync(manifestPath),
      `fixture ${name} is missing expected-after.json`
    );
    const manifest = loadManifest(manifestPath);

    const workingDir = await freshTemp();
    if (fs.existsSync(beforeDir)) {
      await copyTree(beforeDir, workingDir);
    }

    await silenced(() => runSetup({ workingDir, packageRoot: repoRoot }));

    assertManifest({
      manifest,
      workingDir,
      beforeDir: fs.existsSync(beforeDir) ? beforeDir : undefined,
    });
  });
}
