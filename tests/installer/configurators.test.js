/**
 * Unit tests for the marketplace configurator (.claude/settings.json).
 * The end-to-end orchestrator test already covers the "file does not
 * exist → create" branch; these tests pin the "file exists without our
 * entry → merge in" branch, which is the realistic upgrade path when
 * users already have other marketplace entries.
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = fs.promises;
const path = require('node:path');

const {
  configureMarketplace,
} = require('../../src/services/marketplace-configurator');
const {
  makeTempDir,
  removeTempDir,
  silenced,
} = require('../helpers/temp-project');

const createdDirs = [];
async function freshTemp() {
  const d = await makeTempDir();
  createdDirs.push(d);
  return d;
}

after(async () => {
  for (const d of createdDirs) await removeTempDir(d);
});

test('configureMarketplace merges into a pre-existing .claude/settings.json', async () => {
  const workingDir = await freshTemp();
  const settingsDir = path.join(workingDir, '.claude');
  await fsPromises.mkdir(settingsDir, { recursive: true });
  const settingsPath = path.join(settingsDir, 'settings.json');
  // Pre-existing user settings with an unrelated marketplace entry.
  const userPriorSettings = {
    extraKnownMarketplaces: {
      'user-other-marketplace': {
        source: { source: 'github', repo: 'someone/else' },
      },
    },
    someOtherUserSetting: 'must-survive',
  };
  await fsPromises.writeFile(
    settingsPath,
    JSON.stringify(userPriorSettings, null, 2) + '\n'
  );

  const result = await silenced(() => configureMarketplace({ workingDir }));

  assert.equal(
    result.marketplaceConfigured,
    true,
    'configureMarketplace must report it added our entry to existing settings'
  );
  const final = JSON.parse(await fsPromises.readFile(settingsPath, 'utf8'));
  assert.equal(
    final.someOtherUserSetting,
    'must-survive',
    'unrelated user settings must survive the merge'
  );
  assert.ok(
    final.extraKnownMarketplaces['user-other-marketplace'],
    'unrelated user marketplaces must survive the merge'
  );
  assert.ok(
    final.extraKnownMarketplaces['awos-marketplace'],
    'awos-marketplace entry must be merged into existing settings'
  );
});

test('configureMarketplace is a no-op when our entry already exists', async () => {
  const workingDir = await freshTemp();
  const settingsDir = path.join(workingDir, '.claude');
  await fsPromises.mkdir(settingsDir, { recursive: true });
  const settingsPath = path.join(settingsDir, 'settings.json');
  const seeded = {
    extraKnownMarketplaces: {
      'awos-marketplace': {
        source: { source: 'github', repo: 'provectus/awos' },
      },
    },
  };
  await fsPromises.writeFile(
    settingsPath,
    JSON.stringify(seeded, null, 2) + '\n'
  );
  const seededBytes = await fsPromises.readFile(settingsPath);

  const result = await silenced(() => configureMarketplace({ workingDir }));

  assert.equal(
    result.marketplaceConfigured,
    false,
    'configureMarketplace must skip when our entry is already registered'
  );
  const afterBytes = await fsPromises.readFile(settingsPath);
  assert.ok(
    seededBytes.equals(afterBytes),
    'configureMarketplace idempotency must leave settings.json byte-for-byte unchanged — not even a JSON-equivalent rewrite'
  );
});
