/**
 * Unit tests for the two single-file configurators (.mcp.json and
 * .claude/settings.json). The end-to-end orchestrator test already covers
 * the "file does not exist → create" branch; these tests pin the
 * "file exists without our entry → merge in" branch, which is the
 * realistic upgrade path when users already have other MCP servers or
 * marketplace entries.
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = fs.promises;
const path = require('node:path');

const { configureMcp } = require('../../src/services/mcp-configurator');
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

test('configureMcp merges entry into a pre-existing .mcp.json', async () => {
  const workingDir = await freshTemp();
  const mcpPath = path.join(workingDir, '.mcp.json');
  // Pre-existing user MCP config with an unrelated server. Our entry
  // must be added without disturbing the user's existing server.
  const userPriorConfig = {
    mcpServers: {
      'user-other-server': { type: 'http', url: 'https://example.invalid' },
    },
  };
  await fsPromises.writeFile(
    mcpPath,
    JSON.stringify(userPriorConfig, null, 2) + '\n'
  );

  const result = await silenced(() => configureMcp({ workingDir }));

  assert.equal(
    result.mcpConfigured,
    true,
    'configureMcp must report it added the entry to an existing file'
  );
  const final = JSON.parse(await fsPromises.readFile(mcpPath, 'utf8'));
  assert.ok(
    final.mcpServers['user-other-server'],
    'pre-existing user MCP servers must survive merging in awos-recruitment'
  );
  assert.ok(
    final.mcpServers['awos-recruitment'],
    'awos-recruitment MCP server entry must be merged into existing config'
  );
});

test('configureMcp is a no-op when our entry is already present', async () => {
  const workingDir = await freshTemp();
  const mcpPath = path.join(workingDir, '.mcp.json');
  const seeded = {
    mcpServers: {
      'awos-recruitment': {
        type: 'http',
        url: 'https://recruitment.awos.provectus.pro/mcp',
      },
    },
  };
  await fsPromises.writeFile(mcpPath, JSON.stringify(seeded, null, 2) + '\n');
  const seededBytes = await fsPromises.readFile(mcpPath);

  const result = await silenced(() => configureMcp({ workingDir }));

  assert.equal(
    result.mcpConfigured,
    false,
    'configureMcp must skip when our entry already exists (idempotency)'
  );
  const afterBytes = await fsPromises.readFile(mcpPath);
  assert.ok(
    seededBytes.equals(afterBytes),
    'configureMcp idempotency must leave .mcp.json byte-for-byte unchanged — not even a JSON-equivalent rewrite'
  );
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
