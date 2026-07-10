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
const { configureHooks } = require('../../src/services/hooks-configurator');
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

test('configureHooks creates settings.json with the containment PreToolUse hook', async () => {
  const workingDir = await freshTemp();
  await fsPromises.mkdir(path.join(workingDir, '.claude'), { recursive: true });
  const settingsPath = path.join(workingDir, '.claude', 'settings.json');

  const result = await silenced(() => configureHooks({ workingDir }));

  assert.equal(
    result.hooksConfigured,
    true,
    'configureHooks must report it registered the containment hook'
  );
  const settings = JSON.parse(await fsPromises.readFile(settingsPath, 'utf8'));
  const preToolUse = settings.hooks && settings.hooks.PreToolUse;
  assert.ok(
    Array.isArray(preToolUse) && preToolUse.length === 1,
    'settings.json must carry exactly one PreToolUse matcher group after configureHooks'
  );
  const command = preToolUse[0].hooks[0].command;
  assert.ok(
    command.includes('awos-containment-guard.js'),
    'the registered hook command must invoke the copied containment guard script (.awos/scripts/awos-containment-guard.js)'
  );
  assert.ok(
    /\bWrite\b/.test(preToolUse[0].matcher) &&
      /\bBash\b/.test(preToolUse[0].matcher) &&
      /\bPowerShell\b/.test(preToolUse[0].matcher) &&
      /\bRead\b/.test(preToolUse[0].matcher),
    'the PreToolUse matcher must cover Write, Bash, and PowerShell (write/egress/shell channels) and Read (the secret-read deny) — every channel a containment crossing travels through, including the distinct Windows PowerShell shell tool'
  );
});

test('configureHooks merges into a pre-existing .claude/settings.json without clobbering', async () => {
  const workingDir = await freshTemp();
  await fsPromises.mkdir(path.join(workingDir, '.claude'), { recursive: true });
  const settingsPath = path.join(workingDir, '.claude', 'settings.json');
  // Realistic upgrade path: the marketplace step (Step 6) already wrote its
  // entry, and the user has an unrelated hook of their own. Both must survive.
  const priorSettings = {
    extraKnownMarketplaces: {
      'awos-marketplace': {
        source: { source: 'github', repo: 'provectus/awos' },
      },
    },
    someUserSetting: 'must-survive',
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: 'echo user-hook' }],
        },
      ],
    },
  };
  await fsPromises.writeFile(
    settingsPath,
    JSON.stringify(priorSettings, null, 2) + '\n'
  );

  const result = await silenced(() => configureHooks({ workingDir }));

  assert.equal(
    result.hooksConfigured,
    true,
    'configureHooks must report it added the hook to existing settings'
  );
  const settings = JSON.parse(await fsPromises.readFile(settingsPath, 'utf8'));
  assert.equal(
    settings.someUserSetting,
    'must-survive',
    'unrelated user settings must survive the hook merge'
  );
  assert.ok(
    settings.extraKnownMarketplaces['awos-marketplace'],
    'the Step 6 marketplace entry must survive the Step 7 hook merge'
  );
  assert.equal(
    settings.hooks.PreToolUse.length,
    2,
    "the user's own PreToolUse hook must be preserved and our guard appended (2 groups total)"
  );
  assert.ok(
    settings.hooks.PreToolUse.some((g) =>
      g.hooks.some((h) => h.command === 'echo user-hook')
    ),
    "the user's pre-existing hook must not be clobbered by the merge"
  );
  assert.ok(
    settings.hooks.PreToolUse.some((g) =>
      g.hooks.some((h) => h.command.includes('awos-containment-guard.js'))
    ),
    'the AWOS containment guard hook must be present after the merge'
  );
});

test('configureHooks is a no-op when the guard hook already exists', async () => {
  const workingDir = await freshTemp();
  await fsPromises.mkdir(path.join(workingDir, '.claude'), { recursive: true });
  const settingsPath = path.join(workingDir, '.claude', 'settings.json');
  const seeded = {
    hooks: {
      PreToolUse: [
        {
          matcher:
            'Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell|Read|Glob|Grep',
          hooks: [
            {
              type: 'command',
              command:
                'node "${CLAUDE_PROJECT_DIR}/.awos/scripts/awos-containment-guard.js"',
            },
          ],
        },
      ],
    },
  };
  await fsPromises.writeFile(
    settingsPath,
    JSON.stringify(seeded, null, 2) + '\n'
  );
  const seededBytes = await fsPromises.readFile(settingsPath);

  const result = await silenced(() => configureHooks({ workingDir }));

  assert.equal(
    result.hooksConfigured,
    false,
    'configureHooks must skip when the guard hook is already registered (idempotency)'
  );
  const afterBytes = await fsPromises.readFile(settingsPath);
  assert.ok(
    seededBytes.equals(afterBytes),
    'configureHooks idempotency must leave settings.json byte-for-byte unchanged — a re-run must not duplicate the hook'
  );
});

test('configureHooks refreshes a stale guard matcher on upgrade (no duplicate)', async () => {
  // An earlier version registered the guard with a matcher that predates the
  // PowerShell shell tool. A re-install must UPDATE the matcher in place so the
  // new channel (PowerShell commands) actually routes to the guard — not
  // silently no-op.
  const workingDir = await freshTemp();
  await fsPromises.mkdir(path.join(workingDir, '.claude'), { recursive: true });
  const settingsPath = path.join(workingDir, '.claude', 'settings.json');
  const staleMatcher = 'Write|Edit|MultiEdit|NotebookEdit|Bash|Read|Glob|Grep';
  const seeded = {
    someUserSetting: 'must-survive',
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: 'echo user-hook' }],
        },
        {
          matcher: staleMatcher,
          hooks: [
            {
              type: 'command',
              command:
                'node "${CLAUDE_PROJECT_DIR}/.awos/scripts/awos-containment-guard.js"',
            },
          ],
        },
      ],
    },
  };
  await fsPromises.writeFile(
    settingsPath,
    JSON.stringify(seeded, null, 2) + '\n'
  );

  const result = await silenced(() => configureHooks({ workingDir }));

  assert.equal(
    result.hooksConfigured,
    true,
    'configureHooks must report (re)configuration when it refreshes a stale matcher'
  );
  const settings = JSON.parse(await fsPromises.readFile(settingsPath, 'utf8'));
  const groups = settings.hooks.PreToolUse;
  const guardGroup = groups.find((g) =>
    g.hooks.some((h) => h.command.includes('awos-containment-guard.js'))
  );
  assert.match(
    guardGroup.matcher,
    /\bPowerShell\b/,
    'the refreshed guard matcher must now include PowerShell so PowerShell-tool egress/secret-read/tamper commands route to the guard on upgrade'
  );
  assert.equal(
    groups.length,
    2,
    'refreshing the matcher must not duplicate the guard group — the user hook and the (updated) guard group remain, 2 total'
  );
  assert.equal(
    settings.someUserSetting,
    'must-survive',
    'unrelated settings must survive a matcher refresh'
  );
});

test('configureHooks writes nothing in dry-run', async () => {
  const workingDir = await freshTemp();
  const settingsPath = path.join(workingDir, '.claude', 'settings.json');

  const result = await silenced(() =>
    configureHooks({ workingDir, dryRun: true })
  );

  assert.equal(
    result.hooksConfigured,
    true,
    'configureHooks must still report the intended change in dry-run'
  );
  assert.equal(
    fs.existsSync(settingsPath),
    false,
    'dry-run must not create .claude/settings.json'
  );
});
