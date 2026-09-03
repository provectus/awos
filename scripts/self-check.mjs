#!/usr/bin/env node
/**
 * self-check.mjs — advisory health check for a project's AWOS installation.
 *
 * The installer copies `scripts/` into a user's project as `.awos/scripts/`.
 * `/awos:spec` runs `node .awos/scripts/self-check.mjs` as its Step 0 and
 * parses the JSON document printed on stdout. Nothing here installs, updates,
 * or mutates anything except its own cache file under `.awos/cache/` and the
 * `hired-agents.md` footer written by `--record`.
 *
 * Three hard invariants govern every code path in this file:
 *
 * 1. The exit code is ALWAYS 0. Findings present, network failure, unreadable
 *    files, unexpected throw — all exit 0. The whole body is wrapped in one
 *    try/catch that degrades to `{"status":"error", ...}` and still exits 0.
 *    A non-zero exit reads to the calling model as a failure it should fix.
 *
 * 2. Stdout is EXACTLY one JSON document and nothing else. All diagnostics go
 *    to stderr. `JSON.parse(entireStdout)` must succeed: no banner, no help
 *    text, no trailing prose.
 *
 * 3. A negative finding is NEVER reported from an inconclusive probe. If a
 *    probe could not run — file absent, unparseable, fetch timed out, host not
 *    applicable — the answer is `unknown` or `skipped`, never `missing` /
 *    `stale` / `outdated`. A false "your plugin is gone" nag is far worse than
 *    a missed one; Step 0 treats `unknown` as silence.
 *
 * The module format is `.mjs` on purpose and must not change: `.awos/scripts/`
 * lands in a project whose `package.json` `"type"` field we do not control, so
 * a bare `.js` would be CJS or ESM depending on the user. `.mjs` pins it.
 *
 * Node stdlib only — no npm dependencies. Targets Node 22+.
 *
 * Usage:
 *   node .awos/scripts/self-check.mjs [--root <dir>] [--force] [--offline]
 *   node .awos/scripts/self-check.mjs --record
 *
 * Environment:
 *   AWOS_SELF_CHECK=off   emit `{"status":"skipped"}` and do nothing else.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The complete per-check status vocabulary. Every value appears here as a
 * single-quoted literal; the prompt linter greps for them.
 */
const STATUS = {
  ok: 'ok',
  stale: 'stale',
  missing: 'missing',
  disabled: 'disabled',
  outdated: 'outdated',
  skipped: 'skipped',
  unknown: 'unknown',
};

const PLUGIN_KEY = 'awos@awos-marketplace';
const MARKETPLACE_KEY = 'awos-marketplace';
const MCP_SERVER_KEY = 'awos-recruitment';
const NPM_LATEST_URL = 'https://registry.npmjs.org/@provectusinc%2Fawos/latest';
const NPM_TIMEOUT_MS = 2500;
const CADENCE_MS = 24 * 60 * 60 * 1000;
const RELEASE_VERSION_RE = /^\d+\.\d+\.\d+$/;

// ---------------------------------------------------------------------------
// Small filesystem / JSON helpers
// ---------------------------------------------------------------------------

/** Write a diagnostic line to stderr. Stdout stays reserved for the JSON. */
function warn(message) {
  try {
    process.stderr.write(`self-check: ${message}\n`);
  } catch {
    // Diagnostics are best-effort and must never break the run.
  }
}

/**
 * Read a file as UTF-8, returning null when it cannot be read for any reason.
 * @param {string} file
 * @returns {string|null}
 */
function readTextOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Read a JSON file, distinguishing "absent" from "present but unparseable".
 * @param {string} file
 * @returns {{ present: boolean, value: unknown }}
 */
function readJsonFile(file) {
  const raw = readTextOrNull(file);
  if (raw === null) return { present: false, value: null };
  try {
    return { present: true, value: JSON.parse(raw) };
  } catch {
    return { present: true, value: null };
  }
}

/** @returns {boolean} true when `p` exists and is a directory. */
function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Canonicalize a path for comparison: resolve, then realpath when possible so
 * a symlinked project root still matches a plugin entry's `projectPath`.
 * @param {string} p
 * @returns {string}
 */
function canonicalPath(p) {
  const resolved = path.resolve(p);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

/** Current instant as an ISO-8601 string with milliseconds. */
function nowIso() {
  return new Date().toISOString();
}

/** Current instant as a second-precision ISO-8601 string (footer format). */
function nowIsoSeconds() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ---------------------------------------------------------------------------
// Pure exported helpers (imported directly by the test suite)
// ---------------------------------------------------------------------------

/**
 * Compare two semantic versions without a dependency.
 *
 * The core (`major.minor.patch`) must be exactly three all-digit parts on both
 * sides; anything else — `"unknown"`, `"2.0"`, a date, `null` — yields `null`,
 * which callers map to `unknown` and NEVER to `outdated`. Equal cores with a
 * prerelease on one side sort that side below; two prereleases compare equal
 * (AWOS never needs finer prerelease ordering than "is it a release or not").
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {-1|0|1|null} -1 when a < b, 1 when a > b, 0 when equal, null when
 *   either input is not a comparable release version.
 */
export function compareSemver(a, b) {
  const parse = (v) => {
    if (typeof v !== 'string') return null;
    const dash = v.indexOf('-');
    const core = dash === -1 ? v : v.slice(0, dash);
    const prerelease = dash === -1 ? '' : v.slice(dash + 1);
    const parts = core.split('.');
    if (parts.length !== 3) return null;
    if (!parts.every((part) => /^\d+$/.test(part))) return null;
    return { nums: parts.map(Number), prerelease };
  };
  const left = parse(a);
  const right = parse(b);
  if (left === null || right === null) return null;
  for (let i = 0; i < 3; i += 1) {
    if (left.nums[i] !== right.nums[i]) {
      return left.nums[i] < right.nums[i] ? -1 : 1;
    }
  }
  const leftPre = left.prerelease !== '';
  const rightPre = right.prerelease !== '';
  if (leftPre && !rightPre) return -1;
  if (!leftPre && rightPre) return 1;
  return 0;
}

const STATUS_RANK = {
  [STATUS.outdated]: 3,
  [STATUS.unknown]: 2,
  [STATUS.ok]: 1,
};

/**
 * Pick the worse of two version sub-statuses, ordered `outdated` > `unknown` >
 * `ok`. Used to roll the package and plugin verdicts into `version.status`.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function worstStatus(a, b) {
  return (STATUS_RANK[b] ?? 0) > (STATUS_RANK[a] ?? 0) ? b : a;
}

/**
 * The machine-readable footer this script owns at the bottom of
 * `context/product/hired-agents.md`. `/awos:hire` writes the human report;
 * `--record` writes this block so a later run can tell whether the roster or
 * the architecture has drifted since.
 */
const FOOTER_RE = /<!--\s*awos:hired-agents\b[\s\S]*?-->/g;

/**
 * Render the footer block.
 * @param {{ generated: string, agents: string[], architectureSha256: string }} data
 * @returns {string} the complete HTML-comment block, no trailing newline
 */
export function serializeHiredAgentsFooter(data) {
  const agents = Array.isArray(data.agents) ? data.agents : [];
  return [
    '<!-- awos:hired-agents',
    `  generated: ${data.generated}`,
    `  agents: ${agents.join(',')}`,
    `  architecture-sha256: ${data.architectureSha256}`,
    '-->',
  ].join('\n');
}

/**
 * Parse the footer out of a `hired-agents.md` body.
 *
 * Returns null when there is no footer at all — the state of every project
 * that predates this mechanism, which must read as `unknown`, never `stale`.
 *
 * @param {string} markdown
 * @returns {{ generated: string|null, agents: string[], architectureSha256: string|null }|null}
 */
export function parseHiredAgentsFooter(markdown) {
  if (typeof markdown !== 'string') return null;
  const matches = markdown.match(FOOTER_RE);
  if (matches === null || matches.length === 0) return null;
  // Last block wins: an append-only edit history should read as "current".
  const block = matches[matches.length - 1];
  const fields = { generated: null, agents: [], architectureSha256: null };
  for (const line of block.split(/\r?\n/)) {
    const kv = /^\s*([a-z0-9-]+)\s*:\s*(.*?)\s*$/i.exec(line);
    if (kv === null) continue;
    const key = kv[1].toLowerCase();
    const value = kv[2];
    if (key === 'generated') fields.generated = value || null;
    else if (key === 'architecture-sha256')
      fields.architectureSha256 = value || null;
    else if (key === 'agents')
      fields.agents = value
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '');
  }
  return fields;
}

/**
 * Resolve an agent's canonical name: the frontmatter `name:` when present,
 * otherwise the filename stem.
 * @param {string} file
 * @returns {string}
 */
function agentNameFromFile(file) {
  const stem = path.basename(file, '.md');
  const raw = readTextOrNull(file);
  if (raw === null) return stem;
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (frontmatter === null) return stem;
  for (const line of frontmatter[1].split(/\r?\n/)) {
    const kv = /^name:\s*(.+?)\s*$/.exec(line);
    if (kv === null) continue;
    const value = kv[1].replace(/^['"]/, '').replace(/['"]$/, '').trim();
    if (value !== '') return value;
  }
  return stem;
}

/**
 * Scan `.claude/agents/` recursively for agent definitions and return their
 * sorted, deduplicated names. The scan must recurse: migration 001 moved
 * bundled agents under `.claude/agents/domain-experts/`.
 *
 * An absent directory is an empty roster, not an error.
 *
 * @param {string} agentsDir
 * @returns {string[]}
 */
export function scanAgentRoster(agentsDir) {
  const names = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md'))
        names.push(agentNameFromFile(full));
    }
  };
  walk(agentsDir);
  return Array.from(new Set(names)).sort();
}

/**
 * Filter the `installed_plugins.json` entries for `awos@awos-marketplace` down
 * to the ones that actually apply to this project.
 *
 * A `user`-scoped entry applies everywhere and carries no `projectPath`. A
 * `project`-scoped entry applies only when its `projectPath` is this project.
 * Discarding foreign `projectPath` entries is what keeps the real multi-scope
 * duplicate case (same plugin installed for another repo at another version)
 * from producing a wrong answer.
 *
 * @param {unknown} entries - the raw array from installed_plugins.json
 * @param {string} projectRoot
 * @returns {object[]}
 */
export function qualifyingPluginEntries(entries, projectRoot) {
  if (!Array.isArray(entries)) return [];
  const root = canonicalPath(projectRoot);
  return entries.filter((entry) => {
    if (entry === null || typeof entry !== 'object') return false;
    if (entry.scope === 'user') return true;
    if (typeof entry.projectPath === 'string' && entry.projectPath !== '')
      return canonicalPath(entry.projectPath) === root;
    return false;
  });
}

// ---------------------------------------------------------------------------
// CLI argument parsing and project-root detection
// ---------------------------------------------------------------------------

/**
 * Parse argv. Unrecognized arguments are ignored silently — there is no
 * `--help` and no `--json`, because JSON is the only output mode.
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const args = { root: null, force: false, offline: false, record: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') args.force = true;
    else if (arg === '--offline') args.offline = true;
    else if (arg === '--record') args.record = true;
    else if (arg === '--root') {
      const next = argv[i + 1];
      if (typeof next === 'string' && !next.startsWith('--')) {
        args.root = next;
        i += 1;
      }
    } else if (arg.startsWith('--root=')) {
      args.root = arg.slice('--root='.length);
    }
  }
  return args;
}

/**
 * Determine the project root.
 *
 * Deriving from `import.meta.url` before falling back to `process.cwd()` is
 * what makes the script cwd-independent: the calling agent may run Bash from
 * any subdirectory of the project.
 *
 * @param {string|null} rootOverride
 * @returns {string}
 */
function resolveProjectRoot(rootOverride) {
  if (typeof rootOverride === 'string' && rootOverride !== '') {
    return path.resolve(rootOverride);
  }
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const derived = path.resolve(scriptDir, '..', '..');
  if (isDirectory(path.join(derived, '.awos'))) return derived;
  return process.cwd();
}

// ---------------------------------------------------------------------------
// Cadence gate + state file
// ---------------------------------------------------------------------------

function cacheDirFor(root) {
  return path.join(root, '.awos', 'cache');
}

function stateFileFor(root) {
  return path.join(cacheDirFor(root), 'self-check.json');
}

/**
 * Create `.awos/cache/` and, only when absent, its self-ignoring `.gitignore`.
 *
 * The one-line `.gitignore` is itself tracked so the rule travels with the
 * repo, while everything else in the directory is ignored — the state file is
 * per-developer and must never be committed. An existing `.gitignore` is left
 * strictly alone; the user may have edited it.
 *
 * @param {string} root
 */
function ensureCacheDir(root) {
  const dir = cacheDirFor(root);
  fs.mkdirSync(dir, { recursive: true });
  const gitignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(gitignore, '*\n!.gitignore\n', 'utf8');
  }
}

/**
 * Persist the state file. `last_result` / `latest_seen` are recorded for a
 * human debugging a run; they are NEVER replayed to stdout. Replaying them
 * would re-nag on every `/awos:spec` all day, which is exactly what the daily
 * gate exists to prevent.
 *
 * A failed write is logged to stderr and otherwise ignored: bookkeeping must
 * never suppress a finding.
 *
 * @param {string} root
 * @param {object} state
 */
function writeState(root, state) {
  try {
    ensureCacheDir(root);
    fs.writeFileSync(
      stateFileFor(root),
      JSON.stringify(state, null, 2) + '\n',
      'utf8'
    );
  } catch (err) {
    warn(`could not write the cadence state file: ${err.message ?? err}`);
  }
}

/**
 * Decide whether the checks are due. A missing or unparseable state file means
 * "due"; so does an unparseable timestamp.
 * @param {string} root
 * @param {boolean} force
 * @returns {{ due: boolean, state: object|null }}
 */
function readCadence(root, force) {
  const { value } = readJsonFile(stateFileFor(root));
  const state = value !== null && typeof value === 'object' ? value : null;
  if (force || state === null) return { due: true, state };
  const last = Date.parse(state.last_checked_at ?? '');
  if (Number.isNaN(last)) return { due: true, state };
  return { due: Date.now() - last >= CADENCE_MS, state };
}

// ---------------------------------------------------------------------------
// Check 1 — hired-agent staleness
// ---------------------------------------------------------------------------

function hiredAgentsReportPath(root) {
  return path.join(root, 'context', 'product', 'hired-agents.md');
}

function architecturePath(root) {
  return path.join(root, 'context', 'product', 'architecture.md');
}

function agentsDirFor(root) {
  return path.join(root, '.claude', 'agents');
}

/**
 * sha256 of `architecture.md`, or the literal `none` when the file is absent.
 * A literal sentinel (rather than null) keeps the footer round-trippable and
 * makes "architecture.md was added since the last /awos:hire" detectable.
 * @param {string} root
 * @returns {string}
 */
function architectureSha256(root) {
  const raw = readTextOrNull(architecturePath(root));
  if (raw === null) return 'none';
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Compare the recorded roster/architecture fingerprint against the live one.
 * @param {string} root
 */
function checkHiredAgents(root) {
  const reportPath = hiredAgentsReportPath(root);
  const roster = scanAgentRoster(agentsDirFor(root));
  const currentSha = architectureSha256(root);
  const detail = {
    report: reportPath,
    agents_on_disk: roster,
    architecture_sha256: currentSha,
  };

  const markdown = readTextOrNull(reportPath);
  if (markdown === null) {
    if (roster.length > 0) {
      return {
        status: STATUS.missing,
        reason: `${roster.length} specialist agent(s) exist in .claude/agents/ but context/product/hired-agents.md has never been written`,
        remedy: ['/awos:hire'],
        detail,
      };
    }
    if (currentSha === 'none') {
      // Greenfield: no roster, no architecture, no report. Nothing to nag about.
      return {
        status: STATUS.ok,
        reason:
          'no specialist agents and no architecture document yet — nothing to keep in sync',
        remedy: [],
        detail,
      };
    }
    return {
      status: STATUS.missing,
      reason:
        'context/product/architecture.md exists but /awos:hire has never produced context/product/hired-agents.md',
      remedy: ['/awos:hire'],
      detail,
    };
  }

  const footer = parseHiredAgentsFooter(markdown);
  if (footer === null) {
    // Every project that predates this footer lands here. Stay silent.
    return {
      status: STATUS.unknown,
      reason:
        'context/product/hired-agents.md has no awos:hired-agents footer — staleness cannot be determined',
      remedy: [],
      detail,
    };
  }

  detail.agents_recorded = footer.agents;
  detail.architecture_sha256_recorded = footer.architectureSha256;
  detail.generated = footer.generated;

  const recorded = new Set(footer.agents);
  const live = new Set(roster);
  const added = roster.filter((name) => !recorded.has(name));
  const removed = footer.agents.filter((name) => !live.has(name));

  const reasons = [];
  if (added.length > 0)
    reasons.push(
      `agents added since the last /awos:hire run: ${added.join(', ')}`
    );
  if (removed.length > 0)
    reasons.push(
      `agents recorded by /awos:hire but no longer on disk: ${removed.join(', ')}`
    );
  if (
    footer.architectureSha256 !== null &&
    footer.architectureSha256 !== currentSha
  ) {
    reasons.push('architecture.md changed since the last /awos:hire run');
  }

  if (reasons.length === 0) {
    return {
      status: STATUS.ok,
      reason:
        'the recorded agent roster and architecture.md fingerprint both match what is on disk',
      remedy: [],
      detail,
    };
  }
  return {
    status: STATUS.stale,
    reason: reasons.join('; '),
    remedy: ['/awos:hire'],
    detail,
  };
}

// ---------------------------------------------------------------------------
// Check 2 — plugin / MCP (disk only)
// ---------------------------------------------------------------------------

/**
 * Applicability probe for the two host-specific checks.
 *
 * The probe is the user-level Claude config directory — `CLAUDE_CONFIG_DIR`
 * when set, else `~/.claude` — and deliberately NOT the project's `.claude/`:
 * the AWOS installer creates the latter on every host, so it proves nothing.
 * When the user-level directory is absent the host is not running Claude Code,
 * and neither the plugin nor the MCP check may ever produce a finding.
 *
 * Reading the wrong directory is worse than reading none: a stale `~/.claude`
 * on a host that relocated its config would answer `ok` about a directory
 * Claude Code is not using. An empty or whitespace-only `CLAUDE_CONFIG_DIR` is
 * treated as unset, and a relative one is resolved so the answer stays
 * independent of the cwd the calling agent happened to run Bash from.
 *
 * @returns {string} absolute path to the user-level Claude config directory
 */
function userClaudeDir() {
  const configured = (process.env.CLAUDE_CONFIG_DIR ?? '').trim();
  if (configured !== '') return path.resolve(configured);
  return path.join(os.homedir(), '.claude');
}

const NOT_APPLICABLE_REASON =
  'Claude Code plugin/MCP state not present — not applicable to this host';

/**
 * Resolve whether the plugin is enabled for this project, merging the three
 * settings layers in precedence order. Absent everywhere means enabled: the
 * installed-plugins record carries no `enabled` field, so presence is consent.
 * @param {string} root
 * @returns {{ enabled: boolean, source: string|null }}
 */
function resolvePluginEnabled(root) {
  const layers = [
    path.join(root, '.claude', 'settings.local.json'),
    path.join(root, '.claude', 'settings.json'),
    path.join(userClaudeDir(), 'settings.json'),
  ];
  for (const file of layers) {
    const { value } = readJsonFile(file);
    if (value === null || typeof value !== 'object') continue;
    const enabledPlugins = value.enabledPlugins;
    if (enabledPlugins === null || typeof enabledPlugins !== 'object') continue;
    const flag = enabledPlugins[PLUGIN_KEY];
    if (typeof flag === 'boolean') return { enabled: flag, source: file };
  }
  return { enabled: true, source: null };
}

/**
 * Highest comparable version across the qualifying entries, or null when none
 * of them carries a release version (the literal `"unknown"` occurs in real
 * installed_plugins.json data).
 * @param {object[]} entries
 * @returns {string|null}
 */
function highestEntryVersion(entries) {
  let best = null;
  for (const entry of entries) {
    const candidate = entry.version;
    if (typeof candidate !== 'string') continue;
    if (best === null) {
      if (compareSemver(candidate, candidate) !== null) best = candidate;
      continue;
    }
    if (compareSemver(candidate, best) === 1) best = candidate;
  }
  return best;
}

/**
 * Read the plugin installation state off disk. Never spawns `claude plugin
 * list`: a nested CLI startup from inside a session costs seconds, depends on
 * a JSON shape we do not own, and burns the caller's Bash timeout.
 * @param {string} root
 */
function checkPlugin(root) {
  const file = path.join(userClaudeDir(), 'plugins', 'installed_plugins.json');
  const detail = { source: file };
  const { present, value } = readJsonFile(file);
  if (!present || value === null || typeof value !== 'object') {
    return {
      status: STATUS.unknown,
      reason: present
        ? 'installed_plugins.json could not be parsed — plugin state is undetermined'
        : 'installed_plugins.json not found — plugin state is undetermined',
      remedy: [],
      detail,
      version: null,
    };
  }

  const registry = value.plugins;
  if (registry === null || typeof registry !== 'object') {
    return {
      status: STATUS.unknown,
      reason:
        'installed_plugins.json has no recognizable `plugins` map — plugin state is undetermined',
      remedy: [],
      detail,
      version: null,
    };
  }

  const qualifying = qualifyingPluginEntries(registry[PLUGIN_KEY], root);
  detail.qualifying_entries = qualifying.length;
  detail.scopes = qualifying.map((entry) => entry.scope ?? 'unknown');

  if (qualifying.length === 0) {
    const { value: projectSettings } = readJsonFile(
      path.join(root, '.claude', 'settings.json')
    );
    const marketplaces =
      projectSettings !== null && typeof projectSettings === 'object'
        ? projectSettings.extraKnownMarketplaces
        : null;
    const marketplaceRegistered =
      marketplaces !== null &&
      typeof marketplaces === 'object' &&
      Object.prototype.hasOwnProperty.call(marketplaces, MARKETPLACE_KEY);
    detail.marketplace_registered = marketplaceRegistered;
    return {
      status: STATUS.missing,
      reason: marketplaceRegistered
        ? `the ${MARKETPLACE_KEY} marketplace is registered for this project but the ${PLUGIN_KEY} plugin is not installed`
        : `the ${PLUGIN_KEY} plugin is not installed for this project`,
      remedy: [`claude plugin install ${PLUGIN_KEY}`],
      detail,
      version: null,
    };
  }

  const installed = highestEntryVersion(qualifying);
  detail.installed = installed;

  const { enabled, source } = resolvePluginEnabled(root);
  detail.enabled_source = source;
  if (!enabled) {
    return {
      status: STATUS.disabled,
      reason: `the ${PLUGIN_KEY} plugin is installed but disabled by ${source}`,
      remedy: [`claude plugin enable ${PLUGIN_KEY}`],
      detail,
      version: installed,
    };
  }

  return {
    status: STATUS.ok,
    reason: `the ${PLUGIN_KEY} plugin is installed and enabled for this project`,
    remedy: [],
    detail,
    version: installed,
  };
}

/**
 * Check the project's `.mcp.json` for the AWOS recruitment server. The `url`
 * value is deliberately not validated — users may point at a private mirror.
 * @param {string} root
 */
function checkMcp(root) {
  const file = path.join(root, '.mcp.json');
  const detail = { source: file };
  const { present, value } = readJsonFile(file);
  if (!present) {
    return {
      status: STATUS.missing,
      reason: '.mcp.json not found',
      remedy: ['npx @provectusinc/awos'],
      detail,
    };
  }
  if (value === null || typeof value !== 'object') {
    return {
      status: STATUS.unknown,
      reason: '.mcp.json could not be parsed — MCP state is undetermined',
      remedy: [],
      detail,
    };
  }
  const servers = value.mcpServers;
  const configured =
    servers !== null &&
    typeof servers === 'object' &&
    Object.prototype.hasOwnProperty.call(servers, MCP_SERVER_KEY);
  detail.configured = configured;
  if (!configured) {
    return {
      status: STATUS.missing,
      reason: `.mcp.json has no ${MCP_SERVER_KEY} server entry`,
      remedy: ['npx @provectusinc/awos'],
      detail,
    };
  }
  return {
    status: STATUS.ok,
    reason: `the ${MCP_SERVER_KEY} MCP server is configured for this project`,
    remedy: [],
    detail,
  };
}

// ---------------------------------------------------------------------------
// Check 3 — version drift
// ---------------------------------------------------------------------------

/**
 * The installed AWOS release, read from the installer's version stamp.
 * @param {string} root
 * @returns {{ version: string|null, status: string, reason: string|null }}
 */
function readInstalledPackageVersion(root) {
  const raw = readTextOrNull(path.join(root, '.awos', '.awos-version'));
  if (raw === null) {
    return {
      version: null,
      status: STATUS.unknown,
      reason:
        'installed by an AWOS release that predates the version stamp — version comparison skipped',
    };
  }
  const version = raw.trim();
  if (!RELEASE_VERSION_RE.test(version)) {
    return {
      version,
      status: STATUS.unknown,
      reason: 'installed from a development build — version comparison skipped',
    };
  }
  return { version, status: STATUS.ok, reason: null };
}

/**
 * The published plugin version, read from the marketplace clone Claude Code
 * keeps refreshed on disk. Zero network.
 * @returns {string|null}
 */
function readPublishedPluginVersion() {
  const file = path.join(
    userClaudeDir(),
    'plugins',
    'marketplaces',
    MARKETPLACE_KEY,
    '.claude-plugin',
    'marketplace.json'
  );
  const { value } = readJsonFile(file);
  if (value === null || typeof value !== 'object') return null;
  const plugins = value.plugins;
  if (Array.isArray(plugins)) {
    const entry = plugins.find(
      (item) =>
        item !== null && typeof item === 'object' && item.name === 'awos'
    );
    if (entry && typeof entry.version === 'string') return entry.version;
  }
  const metadata = value.metadata;
  if (
    metadata !== null &&
    typeof metadata === 'object' &&
    typeof metadata.version === 'string'
  ) {
    return metadata.version;
  }
  return null;
}

/**
 * The single network call in this script: the published npm version. Any
 * rejection, non-200, or malformed body yields null (→ `unknown`). No retries.
 * @returns {Promise<string|null>}
 */
async function fetchPublishedPackageVersion() {
  if (typeof fetch !== 'function') return null;
  try {
    const response = await fetch(NPM_LATEST_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(NPM_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = await response.json();
    if (body !== null && typeof body === 'object') {
      const version = body.version;
      if (typeof version === 'string') return version;
    }
    return null;
  } catch (err) {
    warn(`npm registry lookup failed: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Build one drift sub-verdict. A null on either side, or a non-comparable
 * pair, is `unknown` — never `outdated`.
 * @param {string} label
 * @param {string|null} installed
 * @param {string|null} latest
 * @param {string|null} preReason - a reason that already disqualified `installed`
 * @param {string} remedy
 */
function driftVerdict(label, installed, latest, preReason, remedy) {
  if (preReason !== null) {
    return {
      status: STATUS.unknown,
      reason: preReason,
      installed,
      latest,
      remedy: [],
    };
  }
  if (installed === null) {
    return {
      status: STATUS.unknown,
      reason: `the installed ${label} version could not be determined`,
      installed,
      latest,
      remedy: [],
    };
  }
  if (latest === null) {
    return {
      status: STATUS.unknown,
      reason: `the published ${label} version could not be determined`,
      installed,
      latest,
      remedy: [],
    };
  }
  const cmp = compareSemver(installed, latest);
  if (cmp === null) {
    return {
      status: STATUS.unknown,
      reason: `the ${label} versions ${installed} and ${latest} are not comparable`,
      installed,
      latest,
      remedy: [],
    };
  }
  if (cmp === -1) {
    return {
      status: STATUS.outdated,
      reason: `the installed ${label} is ${installed}; ${latest} is published`,
      installed,
      latest,
      remedy: [remedy],
    };
  }
  return {
    status: STATUS.ok,
    reason: `the installed ${label} ${installed} is current`,
    installed,
    latest,
    remedy: [],
  };
}

/**
 * Roll the package and plugin drift verdicts into the single `version` check.
 * The package and plugin versions come from independent streams (npm
 * dist-tag vs. the local marketplace clone), so there is no single
 * `installed`/`latest` pair that could sit beside the rolled-up `status`
 * without risking a mismatch — those numbers live only under
 * `detail.package` and `detail.plugin`, each next to its own `status` and
 * `remedy`.
 * @param {object} pkg
 * @param {object} plugin
 */
export function checkVersion(pkg, plugin) {
  const status = worstStatus(pkg.status, plugin.status);
  const reasons = [pkg.reason, plugin.reason].filter(
    (reason) => typeof reason === 'string' && reason !== ''
  );
  return {
    status,
    reason: reasons.join('; '),
    remedy: [...pkg.remedy, ...plugin.remedy],
    detail: { package: pkg, plugin },
  };
}

// ---------------------------------------------------------------------------
// --record mode
// ---------------------------------------------------------------------------

/**
 * Refresh the `awos:hired-agents` footer at the bottom of `hired-agents.md`.
 *
 * Idempotent by construction: when the computed roster and architecture hash
 * already match the recorded ones, the file is left byte-for-byte untouched
 * (the `generated:` stamp is not churned).
 *
 * @param {string} root
 * @returns {object} the ack payload
 */
function runRecord(root) {
  const reportPath = hiredAgentsReportPath(root);
  const agents = scanAgentRoster(agentsDirFor(root));
  const architecture = architectureSha256(root);
  const base = {
    schema: 1,
    status: 'recorded',
    checked_at: nowIso(),
    project_root: root,
    agents,
    architecture_sha256: architecture,
  };

  const markdown = readTextOrNull(reportPath);
  if (markdown === null) {
    return {
      ...base,
      recorded: false,
      changed: false,
      reason: `${reportPath} does not exist — nothing to record; run /awos:hire first`,
    };
  }

  const existing = parseHiredAgentsFooter(markdown);
  if (
    existing !== null &&
    existing.architectureSha256 === architecture &&
    existing.agents.join(',') === agents.join(',')
  ) {
    return {
      ...base,
      recorded: true,
      changed: false,
      reason: 'the recorded footer already matches the current state',
    };
  }

  const footer = serializeHiredAgentsFooter({
    generated: nowIsoSeconds(),
    agents,
    architectureSha256: architecture,
  });
  const body = markdown.replace(FOOTER_RE, '').trimEnd();
  fs.writeFileSync(reportPath, `${body}\n\n${footer}\n`, 'utf8');
  return {
    ...base,
    recorded: true,
    changed: true,
    reason: `refreshed the awos:hired-agents footer in ${reportPath}`,
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * Print the one and only JSON document and exit 0.
 *
 * The exit is deferred to the write callback so a piped stdout is fully
 * flushed first — `process.exit()` truncates pending pipe writes.
 * @param {object} payload
 */
function emit(payload) {
  process.exitCode = 0;
  process.stdout.write(JSON.stringify(payload) + '\n', () => {
    process.exit(0);
  });
}

/**
 * The uniform "nothing ran" shape. All four check keys are always present, so
 * the consuming prompt has one branch rather than two.
 * @param {string} reason
 */
function skippedChecks(reason) {
  const one = () => ({
    status: STATUS.skipped,
    reason,
    remedy: [],
    detail: {},
  });
  return {
    hired_agents: one(),
    plugin: one(),
    mcp: one(),
    version: one(),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = resolveProjectRoot(args.root);

  if ((process.env.AWOS_SELF_CHECK ?? '').toLowerCase() === 'off') {
    emit({
      schema: 1,
      status: STATUS.skipped,
      checked_at: nowIso(),
      project_root: root,
      reason: 'self-check is disabled via AWOS_SELF_CHECK=off',
      ...skippedChecks('self-check is disabled via AWOS_SELF_CHECK=off'),
    });
    return;
  }

  if (args.record) {
    emit(runRecord(root));
    return;
  }

  const { due } = readCadence(root, args.force);
  if (!due) {
    const reason =
      'the self-check already ran within the last 24 hours; pass --force to re-run';
    emit({
      schema: 1,
      status: STATUS.skipped,
      checked_at: nowIso(),
      project_root: root,
      reason,
      ...skippedChecks(reason),
    });
    return;
  }

  // Claim the day BEFORE probing, so a deterministically-hanging probe cannot
  // hammer the network on every single run.
  const checkedAt = nowIso();
  writeState(root, { schema: 1, last_checked_at: checkedAt });

  const hiredAgents = checkHiredAgents(root);

  const hostApplicable = isDirectory(userClaudeDir());
  let plugin;
  let mcp;
  let pluginVersion = null;
  if (hostApplicable) {
    const pluginResult = checkPlugin(root);
    pluginVersion = pluginResult.version;
    delete pluginResult.version;
    plugin = pluginResult;
    mcp = checkMcp(root);
  } else {
    plugin = {
      status: STATUS.skipped,
      reason: NOT_APPLICABLE_REASON,
      remedy: [],
      detail: {},
    };
    mcp = {
      status: STATUS.skipped,
      reason: NOT_APPLICABLE_REASON,
      remedy: [],
      detail: {},
    };
  }

  const installedPackage = readInstalledPackageVersion(root);
  const latestPackage = args.offline
    ? null
    : await fetchPublishedPackageVersion();
  const packageVerdict = driftVerdict(
    'AWOS package',
    installedPackage.version,
    latestPackage,
    installedPackage.reason,
    'npx @provectusinc/awos@latest'
  );
  const latestPlugin = hostApplicable ? readPublishedPluginVersion() : null;
  const pluginVerdict = driftVerdict(
    'AWOS plugin',
    pluginVersion,
    latestPlugin,
    null,
    `claude plugin update ${PLUGIN_KEY}`
  );
  const version = checkVersion(packageVerdict, pluginVerdict);

  const report = {
    schema: 1,
    status: 'checked',
    checked_at: checkedAt,
    project_root: root,
    hired_agents: hiredAgents,
    plugin,
    mcp,
    version,
  };

  writeState(root, {
    schema: 1,
    last_checked_at: checkedAt,
    last_result: {
      hired_agents: hiredAgents.status,
      plugin: plugin.status,
      mcp: mcp.status,
      version: version.status,
    },
    latest_seen: { package: latestPackage, plugin: latestPlugin },
  });

  emit(report);
}

// Run only when executed directly; stay inert when imported by the tests.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((err) => {
    emit({
      schema: 1,
      status: 'error',
      reason: String(err?.message ?? err),
      checked_at: nowIso(),
    });
  });
}
