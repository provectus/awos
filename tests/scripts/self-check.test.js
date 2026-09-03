/**
 * Tests for scripts/self-check.mjs — the advisory installation health check
 * that /awos:spec runs as its Step 0.
 *
 * Two modes:
 *   - Contract tests spawn the real CLI and pin the three hard invariants:
 *     exit code is always 0, stdout is exactly one JSON document, and an
 *     inconclusive probe never yields a negative finding.
 *   - Unit tests import the pure helpers out of the .mjs directly (dynamic
 *     import works fine from CommonJS; node:test bodies may be async).
 *
 * No test may touch the network: every CLI run passes --offline or points
 * HOME at a temp directory, so the suite is hermetic and fast.
 */

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'self-check.mjs');

const createdDirs = [];

/** Create an isolated temp directory that is cleaned up after the suite. */
function freshTemp(prefix = 'awos-selfcheck-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of createdDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Cleanup is best-effort.
    }
  }
});

/** Write a file, creating parent directories as needed. */
function writeFile(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, 'utf8');
}

/**
 * Run the CLI against `root`. Returns the spawn result plus the parsed report.
 * `--offline` is on by default so no test can reach the npm registry.
 * @param {string} root
 * @param {{ args?: string[], home?: string, env?: object }} [options]
 */
function runCli(root, options = {}) {
  const args = options.args ?? ['--offline'];
  const home = options.home ?? freshTemp('awos-selfcheck-home-');
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.AWOS_SELF_CHECK;
  // A developer who has relocated their own Claude config must not leak it
  // into the suite: HOME-override tests would then probe the real directory.
  delete env.CLAUDE_CONFIG_DIR;
  Object.assign(env, options.env ?? {});
  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--root', root, ...args],
    { encoding: 'utf8', env }
  );
  return result;
}

/**
 * Run the CLI and assert the two universal invariants before returning the
 * parsed report: exit code 0 and stdout that is exactly one JSON document.
 */
function runAndParse(root, options = {}) {
  const result = runCli(root, options);
  assert.equal(
    result.status,
    0,
    `self-check must always exit 0 so the calling model does not read it as a failure (got ${result.status}; stderr: ${result.stderr})`
  );
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (err) {
    assert.fail(
      `stdout must be exactly one JSON document with no banner or trailing prose; JSON.parse failed (${err.message}) on: ${JSON.stringify(result.stdout)}`
    );
  }
  return report;
}

/** A home directory that looks like a Claude Code host. */
function claudeHome(installedPlugins, userSettings) {
  const home = freshTemp('awos-selfcheck-home-');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  if (installedPlugins !== undefined) {
    writeFile(
      path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify(installedPlugins, null, 2)
    );
  }
  if (userSettings !== undefined) {
    writeFile(
      path.join(home, '.claude', 'settings.json'),
      JSON.stringify(userSettings, null, 2)
    );
  }
  return home;
}

/** Load the pure helper exports out of the ESM script. */
function loadHelpers() {
  return import(pathToFileURL(SCRIPT).href);
}

const CHECK_KEYS = ['hired_agents', 'plugin', 'mcp', 'version'];
const STATUS_VOCABULARY = new Set([
  'ok',
  'stale',
  'missing',
  'disabled',
  'outdated',
  'skipped',
  'unknown',
]);

// ---------------------------------------------------------------------------
// 1–2. Output contract
// ---------------------------------------------------------------------------

test('an empty project yields a parseable report with all four check keys', () => {
  const root = freshTemp();
  const report = runAndParse(root);

  assert.equal(
    report.schema,
    1,
    'the report must declare schema 1 so the consuming prompt can version-gate it'
  );
  assert.equal(
    report.status,
    'checked',
    'a first run against a fresh project must actually run the checks'
  );
  assert.ok(
    !Number.isNaN(Date.parse(report.checked_at)),
    'checked_at must be a parseable ISO-8601 timestamp'
  );
  for (const key of CHECK_KEYS) {
    assert.ok(
      report[key] && typeof report[key] === 'object',
      `the report must always carry the "${key}" check so the consuming prompt has one branch, not two`
    );
    assert.ok(
      STATUS_VOCABULARY.has(report[key].status),
      `"${key}" reported status "${report[key].status}", which is outside the seven-value status vocabulary`
    );
    assert.ok(
      Array.isArray(report[key].remedy),
      `"${key}".remedy must always be an array of strings, even when empty`
    );
  }
});

test('a project with every finding present still exits 0', () => {
  const root = freshTemp();
  // Agents on disk but no coverage report -> hired_agents: missing.
  writeFile(
    path.join(root, '.claude', 'agents', 'api-expert.md'),
    '---\nname: api-expert\n---\n\nAPI specialist.\n'
  );
  // No .mcp.json at all -> mcp: missing.
  // Empty plugin registry -> plugin: missing.
  const home = claudeHome({ version: 2, plugins: {} });

  const report = runAndParse(root, { home });

  assert.equal(
    report.hired_agents.status,
    'missing',
    'agents on disk with no hired-agents.md must report the coverage report as missing'
  );
  assert.equal(
    report.plugin.status,
    'missing',
    'an installed_plugins.json with no awos entry must report the plugin as missing'
  );
  assert.equal(
    report.mcp.status,
    'missing',
    'an absent .mcp.json must report the MCP server as missing'
  );
  assert.deepEqual(
    report.hired_agents.remedy,
    ['/awos:hire'],
    'the remedy for a missing coverage report must be the /awos:hire command'
  );
});

// ---------------------------------------------------------------------------
// 3–5. Cadence gate and cache directory
// ---------------------------------------------------------------------------

test('a second run within 24h is skipped and does not replay cached findings', () => {
  const root = freshTemp();
  writeFile(
    path.join(root, '.claude', 'agents', 'api-expert.md'),
    '---\nname: api-expert\n---\n'
  );
  const first = runAndParse(root);
  assert.equal(first.status, 'checked', 'the first run must run the checks');
  assert.equal(
    first.hired_agents.status,
    'missing',
    'the first run must produce the finding that the second run has to suppress'
  );

  const second = runAndParse(root);
  assert.equal(
    second.status,
    'skipped',
    'a run within 24h of the last one must be gated so /awos:spec does not re-nag all day'
  );
  for (const key of CHECK_KEYS) {
    assert.equal(
      second[key].status,
      'skipped',
      `the gated run must report "${key}" as skipped rather than replaying the cached finding`
    );
  }
});

test('--force re-runs the checks despite a fresh cadence timestamp', () => {
  const root = freshTemp();
  runAndParse(root);
  const forced = runAndParse(root, { args: ['--offline', '--force'] });
  assert.equal(
    forced.status,
    'checked',
    '--force must bypass the once-per-day gate'
  );
});

test('the cache .gitignore is created once and never rewritten', () => {
  const root = freshTemp();
  runAndParse(root);
  const gitignore = path.join(root, '.awos', 'cache', '.gitignore');
  assert.equal(
    fs.readFileSync(gitignore, 'utf8'),
    '*\n!.gitignore\n',
    'the cache directory must be self-ignoring: the .gitignore is tracked, everything beside it is not'
  );

  fs.writeFileSync(gitignore, '# user edited\n*\n!.gitignore\n', 'utf8');
  runAndParse(root, { args: ['--offline', '--force'] });
  assert.equal(
    fs.readFileSync(gitignore, 'utf8'),
    '# user edited\n*\n!.gitignore\n',
    'an existing cache .gitignore must never be rewritten — the user may have edited it'
  );
});

// ---------------------------------------------------------------------------
// 6–11. Check 1 — hired-agent staleness
// ---------------------------------------------------------------------------

const FOOTER_SHA_NONE = 'none';

function writeHiredAgents(root, agents, sha) {
  writeFile(
    path.join(root, 'context', 'product', 'hired-agents.md'),
    [
      '# Specialist Agents Coverage',
      '',
      '<!-- awos:hired-agents',
      '  generated: 2026-08-25T09:12:00Z',
      `  agents: ${agents.join(',')}`,
      `  architecture-sha256: ${sha}`,
      '-->',
      '',
    ].join('\n')
  );
}

function writeAgent(root, name, subdir) {
  const dir = subdir
    ? path.join(root, '.claude', 'agents', subdir)
    : path.join(root, '.claude', 'agents');
  writeFile(path.join(dir, `${name}.md`), `---\nname: ${name}\n---\n`);
}

test('an agent added since the last /awos:hire run reports stale and names it', () => {
  const root = freshTemp();
  writeAgent(root, 'a');
  writeAgent(root, 'b');
  writeAgent(root, 'c');
  writeHiredAgents(root, ['a', 'b'], FOOTER_SHA_NONE);

  const report = runAndParse(root);
  assert.equal(
    report.hired_agents.status,
    'stale',
    'a roster that gained an agent since the recorded footer must report stale'
  );
  assert.match(
    report.hired_agents.reason,
    /\bc\b/,
    'the stale reason must name the specific agent that drifted, so the user knows why'
  );
});

test('a matching roster and architecture hash reports ok', async () => {
  const { serializeHiredAgentsFooter } = await loadHelpers();
  const root = freshTemp();
  writeAgent(root, 'a');
  writeAgent(root, 'b');
  writeFile(
    path.join(root, 'context', 'product', 'hired-agents.md'),
    '# Coverage\n'
  );
  const recordAck = runAndParse(root, { args: ['--record'] });
  assert.equal(
    recordAck.status,
    'recorded',
    '--record must acknowledge with status "recorded"'
  );
  assert.ok(
    typeof serializeHiredAgentsFooter === 'function',
    'serializeHiredAgentsFooter must be exported for the consuming prompt tests'
  );

  const report = runAndParse(root, { args: ['--offline', '--force'] });
  assert.equal(
    report.hired_agents.status,
    'ok',
    'a footer recorded from the current state must read back as ok'
  );
});

test('editing architecture.md after --record reports stale and names the file', () => {
  const root = freshTemp();
  writeAgent(root, 'a');
  writeFile(
    path.join(root, 'context', 'product', 'architecture.md'),
    '# Architecture\n\nPostgres.\n'
  );
  writeFile(
    path.join(root, 'context', 'product', 'hired-agents.md'),
    '# Coverage\n'
  );
  runAndParse(root, { args: ['--record'] });

  writeFile(
    path.join(root, 'context', 'product', 'architecture.md'),
    '# Architecture\n\nPostgres and Kafka.\n'
  );
  const report = runAndParse(root, { args: ['--offline', '--force'] });
  assert.equal(
    report.hired_agents.status,
    'stale',
    'a changed architecture.md must invalidate the recorded hire fingerprint'
  );
  assert.match(
    report.hired_agents.reason,
    /architecture\.md/,
    'the stale reason must name architecture.md as what changed'
  );
});

test('a hired-agents.md with no footer reports unknown, never stale', () => {
  const root = freshTemp();
  writeAgent(root, 'a');
  writeFile(
    path.join(root, 'context', 'product', 'hired-agents.md'),
    '# Specialist Agents Coverage\n\nNo footer here.\n'
  );

  const report = runAndParse(root);
  assert.equal(
    report.hired_agents.status,
    'unknown',
    'a report with no footer is every pre-existing project — an inconclusive probe must never report a negative finding'
  );
  assert.deepEqual(
    report.hired_agents.remedy,
    [],
    'an inconclusive hired-agents probe must not propose a remedy'
  );
});

test('a greenfield project with no agents, report, or architecture reports ok', () => {
  const root = freshTemp();
  const report = runAndParse(root);
  assert.equal(
    report.hired_agents.status,
    'ok',
    'a greenfield project must never be nagged about hiring on its first spec'
  );
});

test('agent discovery recurses into .claude/agents subdirectories', async () => {
  const { scanAgentRoster } = await loadHelpers();
  const root = freshTemp();
  writeAgent(root, 'top-level');
  writeAgent(root, 'nested-expert', 'domain-experts');

  assert.deepEqual(
    scanAgentRoster(path.join(root, '.claude', 'agents')),
    ['nested-expert', 'top-level'],
    'the roster scan must recurse — migration 001 moved bundled agents under domain-experts/'
  );

  writeHiredAgents(root, ['top-level'], FOOTER_SHA_NONE);
  const report = runAndParse(root);
  assert.match(
    report.hired_agents.reason,
    /nested-expert/,
    'an agent nested under domain-experts/ must be visible to the staleness check'
  );
});

// ---------------------------------------------------------------------------
// 12. Check 2 — MCP
// ---------------------------------------------------------------------------

test('the .mcp.json probe separates absent, configured, and unparseable', () => {
  const home = claudeHome({ version: 2, plugins: {} });

  const absent = freshTemp();
  assert.equal(
    runAndParse(absent, { home }).mcp.status,
    'missing',
    'an absent .mcp.json must report the MCP server as missing'
  );

  const configured = freshTemp();
  writeFile(
    path.join(configured, '.mcp.json'),
    JSON.stringify({
      mcpServers: {
        'awos-recruitment': {
          type: 'http',
          url: 'https://recruitment.awos.provectus.pro/mcp',
        },
      },
    })
  );
  assert.equal(
    runAndParse(configured, { home }).mcp.status,
    'ok',
    'a present awos-recruitment entry must report ok regardless of its url'
  );

  const broken = freshTemp();
  writeFile(path.join(broken, '.mcp.json'), '{ this is not json');
  assert.equal(
    runAndParse(broken, { home }).mcp.status,
    'unknown',
    'an unparseable .mcp.json is an inconclusive probe and must report unknown, not missing'
  );
});

// ---------------------------------------------------------------------------
// 13–15. Check 3 — version drift
// ---------------------------------------------------------------------------

test('a development version stamp suppresses version comparison', () => {
  const root = freshTemp();
  writeFile(path.join(root, '.awos', '.awos-version'), '0.0.0-develop');
  const report = runAndParse(root);
  assert.equal(
    report.version.status,
    'unknown',
    'a contributor running from a development build must never be nagged about version drift'
  );
  assert.match(
    report.version.detail.package.reason,
    /development build/,
    'the version reason must say why the comparison was skipped'
  );
});

test('an absent version stamp reports unknown, not outdated', () => {
  const root = freshTemp();
  const report = runAndParse(root);
  assert.equal(
    report.version.status,
    'unknown',
    'a release that predates the version stamp is an inconclusive probe — it must never report outdated'
  );
  assert.equal(
    report.version.detail.package.installed,
    null,
    'version.detail.package.installed must be null when the stamp is absent'
  );
});

test('--offline skips the registry lookup and returns promptly', () => {
  const root = freshTemp();
  writeFile(path.join(root, '.awos', '.awos-version'), '2.4.0');
  const started = Date.now();
  const report = runAndParse(root);
  const elapsed = Date.now() - started;

  assert.equal(
    report.version.detail.package.latest,
    null,
    '--offline must leave the published version null rather than reaching the network'
  );
  assert.equal(
    report.version.status,
    'unknown',
    'an unknown published version must roll up to unknown, never outdated'
  );
  assert.ok(
    elapsed < 2000,
    `--offline must not wait on any network call (took ${elapsed}ms)`
  );
});

// ---------------------------------------------------------------------------
// 16–17. Opt-out and host applicability
// ---------------------------------------------------------------------------

test('AWOS_SELF_CHECK=off skips everything with a uniform payload', () => {
  const root = freshTemp();
  const report = runAndParse(root, { env: { AWOS_SELF_CHECK: 'off' } });
  assert.equal(
    report.status,
    'skipped',
    'AWOS_SELF_CHECK=off must disable the check entirely'
  );
  assert.match(
    report.reason,
    /disabled/,
    'the skip reason must say the check is disabled, so the user can tell it apart from the daily gate'
  );
  for (const key of CHECK_KEYS) {
    assert.equal(
      report[key].status,
      'skipped',
      `a disabled run must still emit "${key}" so the consuming prompt has one branch, not two`
    );
  }
});

test('a host with no ~/.claude skips the plugin and MCP checks only', () => {
  const root = freshTemp();
  // No .claude/ in HOME: this is a Cursor/Codex user, not a Claude Code host.
  const home = freshTemp('awos-selfcheck-home-');
  writeFile(path.join(root, '.awos', '.awos-version'), '2.4.0');

  const report = runAndParse(root, { home });
  assert.equal(
    report.plugin.status,
    'skipped',
    'a non-Claude-Code host must never be nagged about the plugin'
  );
  assert.equal(
    report.mcp.status,
    'skipped',
    'a non-Claude-Code host must never be nagged about the MCP server'
  );
  assert.equal(
    report.hired_agents.status,
    'ok',
    'the hired-agents check is host-neutral and must still run'
  );
  assert.ok(
    STATUS_VOCABULARY.has(report.version.status) &&
      report.version.status !== 'skipped',
    'the version check is host-neutral and must still report a verdict'
  );
});

/**
 * A relocated user-level Claude config directory, as `CLAUDE_CONFIG_DIR`
 * addresses it: the config directory itself, not the home that contains it.
 */
function claudeConfigDir(installedPlugins) {
  const dir = freshTemp('awos-selfcheck-config-');
  if (installedPlugins !== undefined) {
    writeFile(
      path.join(dir, 'plugins', 'installed_plugins.json'),
      JSON.stringify(installedPlugins, null, 2)
    );
  }
  return dir;
}

test('CLAUDE_CONFIG_DIR is honored over the home directory', () => {
  const root = freshTemp();
  // HOME holds a registry that WOULD answer ok; the relocated config dir holds
  // one with no awos entry. Reading the home would be a false ok about a
  // directory Claude Code is not using.
  const home = claudeHome(duplicateScopePlugins(freshTemp()));
  const configDir = claudeConfigDir({ version: 2, plugins: {} });

  const report = runAndParse(root, {
    home,
    env: { CLAUDE_CONFIG_DIR: configDir },
  });
  assert.equal(
    report.plugin.status,
    'missing',
    'CLAUDE_CONFIG_DIR must win over ~/.claude — reading the home registry would report a plugin state Claude Code is not using'
  );
  assert.equal(
    report.plugin.detail.source,
    path.join(configDir, 'plugins', 'installed_plugins.json'),
    'the plugin probe must name the relocated config directory it actually read'
  );
});

test('a CLAUDE_CONFIG_DIR that does not exist skips the plugin and MCP checks', () => {
  const root = freshTemp();
  const home = claudeHome(duplicateScopePlugins(freshTemp()));
  const missingDir = path.join(freshTemp(), 'no-such-config-dir');

  const report = runAndParse(root, {
    home,
    env: { CLAUDE_CONFIG_DIR: missingDir },
  });
  assert.equal(
    report.plugin.status,
    'skipped',
    'a CLAUDE_CONFIG_DIR that does not exist means no Claude Code host state — the applicability gate must skip the plugin check'
  );
  assert.equal(
    report.mcp.status,
    'skipped',
    'a CLAUDE_CONFIG_DIR that does not exist must skip the MCP check through the same applicability gate'
  );
});

test('an empty CLAUDE_CONFIG_DIR falls back to the home directory', () => {
  const root = freshTemp();
  const home = claudeHome(duplicateScopePlugins(freshTemp()));

  const report = runAndParse(root, { home, env: { CLAUDE_CONFIG_DIR: '   ' } });
  assert.equal(
    report.plugin.status,
    'ok',
    'an empty or whitespace-only CLAUDE_CONFIG_DIR must be treated as unset rather than resolving to a meaningless path'
  );
});

// ---------------------------------------------------------------------------
// 18–20. Check 2 — plugin
// ---------------------------------------------------------------------------

/** The real multi-scope case: another repo's project install beside a user install. */
function duplicateScopePlugins(foreignProjectPath) {
  return {
    version: 2,
    plugins: {
      'awos@awos-marketplace': [
        {
          scope: 'project',
          projectPath: foreignProjectPath,
          installPath: '/tmp/whatever',
          version: '2.4.2',
        },
        {
          scope: 'user',
          installPath: '/tmp/whatever',
          version: '2.4.4',
        },
      ],
    },
  };
}

test('a user-scope install beside a foreign project-scope one reports ok at the user version', () => {
  const root = freshTemp();
  const foreign = freshTemp();
  const home = claudeHome(duplicateScopePlugins(foreign));

  const report = runAndParse(root, { home });
  assert.equal(
    report.plugin.status,
    'ok',
    'a user-scope entry applies to every project and must report the plugin as installed'
  );
  assert.equal(
    report.version.detail.plugin.installed,
    '2.4.4',
    'the reported plugin version must be the highest qualifying entry, ignoring another project`s install'
  );
});

test('an explicitly disabled plugin reports disabled with the enable remedy', () => {
  const root = freshTemp();
  const foreign = freshTemp();
  const home = claudeHome(duplicateScopePlugins(foreign), {
    enabledPlugins: { 'awos@awos-marketplace': false },
  });

  const report = runAndParse(root, { home });
  assert.equal(
    report.plugin.status,
    'disabled',
    'an installed plugin turned off in settings must report disabled, not missing'
  );
  assert.deepEqual(
    report.plugin.remedy,
    ['claude plugin enable awos@awos-marketplace'],
    'a disabled plugin must be remedied by enabling it, not by reinstalling it'
  );
});

test('an absent installed_plugins.json reports unknown, never missing', () => {
  const root = freshTemp();
  const home = claudeHome();

  const report = runAndParse(root, { home });
  assert.equal(
    report.plugin.status,
    'unknown',
    'an unreadable plugin registry is an inconclusive probe — a false "your plugin is gone" nag is worse than a missed one'
  );
  assert.deepEqual(
    report.plugin.remedy,
    [],
    'an inconclusive plugin probe must not propose a remedy'
  );
});

// ---------------------------------------------------------------------------
// 21. --record
// ---------------------------------------------------------------------------

test('--record writes the footer, is idempotent, and no-ops without a report', () => {
  const root = freshTemp();
  writeAgent(root, 'api-expert');
  writeAgent(root, 'react-expert', 'domain-experts');
  writeFile(
    path.join(root, 'context', 'product', 'architecture.md'),
    '# Architecture\n'
  );

  const noReport = runAndParse(root, { args: ['--record'] });
  assert.equal(
    noReport.status,
    'recorded',
    '--record must acknowledge even when there is nothing to record'
  );
  assert.equal(
    noReport.recorded,
    false,
    '--record must be a no-op when hired-agents.md does not exist'
  );

  const reportPath = path.join(root, 'context', 'product', 'hired-agents.md');
  writeFile(reportPath, '# Specialist Agents Coverage\n');
  runAndParse(root, { args: ['--record'] });
  const afterFirst = fs.readFileSync(reportPath, 'utf8');
  assert.match(
    afterFirst,
    /<!-- awos:hired-agents/,
    '--record must append the awos:hired-agents footer to the coverage report'
  );
  assert.match(
    afterFirst,
    /agents: api-expert,react-expert/,
    'the recorded footer must list the sorted agent names found by a recursive scan'
  );
  assert.match(
    afterFirst,
    /architecture-sha256: [0-9a-f]{64}/,
    'the recorded footer must carry a sha256 of architecture.md'
  );

  runAndParse(root, { args: ['--record'] });
  assert.equal(
    fs.readFileSync(reportPath, 'utf8'),
    afterFirst,
    '--record must be idempotent: re-recording an unchanged state must leave the file byte-for-byte identical'
  );
});

// ---------------------------------------------------------------------------
// 22. compareSemver
// ---------------------------------------------------------------------------

test('compareSemver orders releases and refuses non-comparable input', async () => {
  const { compareSemver, worstStatus } = await loadHelpers();

  const cases = [
    ['2.4.1', '2.5.0', -1],
    ['2.10.0', '2.9.9', 1],
    ['1.0.0-rc.1', '1.0.0', -1],
    ['2.0.0', '2.0.0', 0],
    ['unknown', '2.0.0', null],
    ['2.0', '2.0.0', null],
  ];
  for (const [a, b, expected] of cases) {
    assert.equal(
      compareSemver(a, b),
      expected,
      `compareSemver('${a}', '${b}') must be ${expected} — a non-comparable pair must yield null so it maps to unknown, never outdated`
    );
  }

  assert.equal(
    worstStatus('ok', 'unknown'),
    'unknown',
    'the version rollup must order unknown above ok'
  );
  assert.equal(
    worstStatus('unknown', 'outdated'),
    'outdated',
    'the version rollup must order outdated above unknown'
  );
});

// ---------------------------------------------------------------------------
// 23. checkVersion rollup — no contradictory top-level installed/latest
// ---------------------------------------------------------------------------

test('a current package with an outdated plugin rolls up to outdated without a contradictory top-level pair', async () => {
  const { checkVersion } = await loadHelpers();

  const pkg = {
    status: 'ok',
    reason: 'the installed package 1.4.0 is current',
    installed: '1.4.0',
    latest: '1.4.0',
    remedy: [],
  };
  const plugin = {
    status: 'outdated',
    reason: 'the installed plugin is 1.3.0; 1.4.0 is published',
    installed: '1.3.0',
    latest: '1.4.0',
    remedy: ['/plugin update awos@awos-marketplace'],
  };

  const version = checkVersion(pkg, plugin);

  assert.equal(
    version.status,
    'outdated',
    'the rollup must surface outdated when either component is outdated, even with a current package'
  );
  assert.equal(
    'installed' in version,
    false,
    'the rollup must not carry a top-level installed field that could contradict a per-component verdict'
  );
  assert.equal(
    'latest' in version,
    false,
    'the rollup must not carry a top-level latest field that could contradict a per-component verdict'
  );
  assert.deepEqual(
    version.detail.package,
    pkg,
    'the package verdict, with its own current installed/latest pair, must survive unchanged under detail.package'
  );
  assert.deepEqual(
    version.detail.plugin,
    plugin,
    'the plugin verdict, with its own outdated installed/latest pair, must survive unchanged under detail.plugin'
  );
  assert.deepEqual(
    version.remedy,
    ['/plugin update awos@awos-marketplace'],
    'remedy must still accumulate the outdated component even though the package needs no remedy'
  );
});
