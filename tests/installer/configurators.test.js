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
  assert.equal(
    result.containmentPluginEnabled,
    true,
    'configureMarketplace must report it enabled the awos-containment plugin'
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
  assert.equal(
    final.enabledPlugins['awos-containment@awos-marketplace'],
    true,
    'the awos-containment plugin must be enabled so its PreToolUse hook is active after install'
  );
});

test('configureMarketplace is a no-op when marketplace registered AND plugin enabled', async () => {
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
    enabledPlugins: {
      'awos-containment@awos-marketplace': true,
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
    'configureMarketplace must skip the marketplace entry when already registered'
  );
  assert.equal(
    result.containmentPluginEnabled,
    false,
    'configureMarketplace must skip the plugin entry when already enabled'
  );
  const afterBytes = await fsPromises.readFile(settingsPath);
  assert.ok(
    seededBytes.equals(afterBytes),
    'configureMarketplace idempotency must leave settings.json byte-for-byte unchanged — not even a JSON-equivalent rewrite'
  );
});

test('configureMarketplace enables the plugin on an upgrade where only the marketplace was registered', async () => {
  // Upgrade path: a prior AWOS version registered the marketplace but predates
  // the awos-containment plugin, so enabledPlugins has no entry for it. The
  // early-return on an already-registered marketplace must NOT skip enabling the
  // plugin, or the containment hook would never arm on an upgraded project.
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

  const result = await silenced(() => configureMarketplace({ workingDir }));

  assert.equal(
    result.marketplaceConfigured,
    false,
    'the marketplace was already registered, so it must not be reported as newly configured'
  );
  assert.equal(
    result.containmentPluginEnabled,
    true,
    'the awos-containment plugin must be enabled even when the marketplace already existed'
  );
  const final = JSON.parse(await fsPromises.readFile(settingsPath, 'utf8'));
  assert.equal(
    final.enabledPlugins['awos-containment@awos-marketplace'],
    true,
    'the containment plugin must end up enabled after an upgrade that only had the marketplace'
  );
  assert.ok(
    final.extraKnownMarketplaces['awos-marketplace'],
    'the pre-existing marketplace registration must survive'
  );
});

test('configureMarketplace with consent=false registers the marketplace but does NOT enable the plugin', async () => {
  // Consent gate: when the operator declines, the marketplace is still
  // registered (harmless — it only makes the plugin available), but the
  // containment plugin is left disabled and the decline is recorded so a later
  // default-on run cannot silently re-enable it.
  const workingDir = await freshTemp();
  const settingsDir = path.join(workingDir, '.claude');
  await fsPromises.mkdir(settingsDir, { recursive: true });
  const settingsPath = path.join(settingsDir, 'settings.json');

  const result = await silenced(() =>
    configureMarketplace({ workingDir, containmentConsent: false })
  );

  assert.equal(
    result.marketplaceConfigured,
    true,
    'the marketplace must be registered regardless of containment consent'
  );
  assert.equal(
    result.containmentPluginEnabled,
    false,
    'declined consent must NOT enable the containment plugin'
  );
  const final = JSON.parse(await fsPromises.readFile(settingsPath, 'utf8'));
  assert.ok(
    final.extraKnownMarketplaces['awos-marketplace'],
    'the marketplace entry must be written even when consent is declined'
  );
  assert.equal(
    final.enabledPlugins['awos-containment@awos-marketplace'],
    false,
    'a declined consent must be recorded as a sticky false, not left absent'
  );
});

test('configureMarketplace consent is STICKY — an explicit false is not re-enabled on a consent=true run', async () => {
  // The `!== true` footgun: a deliberate opt-out (enabledPlugins[key] === false)
  // must survive a later install even when that install would default to
  // enabling. The key must be left byte-untouched (still false), while an
  // unrelated missing marketplace is still registered.
  const workingDir = await freshTemp();
  const settingsDir = path.join(workingDir, '.claude');
  await fsPromises.mkdir(settingsDir, { recursive: true });
  const settingsPath = path.join(settingsDir, 'settings.json');
  const seeded = {
    enabledPlugins: {
      'awos-containment@awos-marketplace': false,
    },
  };
  await fsPromises.writeFile(
    settingsPath,
    JSON.stringify(seeded, null, 2) + '\n'
  );

  const result = await silenced(() =>
    configureMarketplace({ workingDir, containmentConsent: true })
  );

  assert.equal(
    result.containmentPluginEnabled,
    false,
    'a sticky false must not be flipped to enabled even on a consent=true run'
  );
  const final = JSON.parse(await fsPromises.readFile(settingsPath, 'utf8'));
  assert.equal(
    final.enabledPlugins['awos-containment@awos-marketplace'],
    false,
    'the operator-set false must remain false — never silently re-enabled'
  );
  assert.ok(
    final.extraKnownMarketplaces['awos-marketplace'],
    'the marketplace must still be registered on this run (only the plugin key is sticky)'
  );
});
