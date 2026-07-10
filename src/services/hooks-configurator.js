/**
 * Hooks Configurator Service
 * Merges the AWOS containment PreToolUse hook into .claude/settings.json.
 * Single Responsibility: containment-hook registration
 *
 * The hook points every Write/Edit/Bash/PowerShell/Read/Glob/Grep tool call at
 * the copied guard script `.awos/scripts/awos-containment-guard.js`, which exits
 * 2 (block) when a proposed action crosses a containment boundary — an
 * out-of-tree write
 * (Write/Edit family or Bash redirect), a write to a protected in-tree path
 * (the guard's own files, the hook registration, persistence sinks), a
 * network-egress Bash command, or a Read/Glob/Grep of a secret-bearing file.
 * See that script for the full boundary policy.
 *
 * Honesty about scope (do not overclaim):
 *   - CONTAINMENT lever (least privilege), not a general injection defense. It
 *     does NOT stop a generic in-tree, in-domain write — a poisoned spec that
 *     has a subagent drop a `build-provenance.json` in the repo root still
 *     lands, because that write stays inside the project and names no protected
 *     path. It stops the HARMFUL subset: egress, out-of-tree writes, reading
 *     secrets, and in-tree writes that disarm the guard or plant persistence.
 *   - ROBUST guarantees: network-egress deny; secret-read deny (Read/Glob/Grep,
 *     by basename); and — for same-namespace paths — out-of-tree deny and
 *     protected-in-tree deny for the Write/Edit family. BEST-EFFORT: the Bash
 *     redirect/copy out-of-tree and protected-path checks — a determined
 *     payload can still write through an interpreter (`python -c`, `node -e`),
 *     which no shell-string parse can catch without an OS sandbox.
 *   - Cross-namespace paths (a POSIX `/tmp/…` target under a Windows `C:\…`
 *     root, or vice versa) FAIL OPEN — a false block is worse than a rare miss.
 *   - Escape hatch: `AWOS_CONTAINMENT_OFF=1` in the environment fails the guard
 *     open for every call, for runs that legitimately need out-of-tree writes
 *     or egress.
 * It is, however, the only lever that holds even under
 * `--dangerously-skip-permissions`: hooks fire in that mode while
 * `permissions.deny` in settings.json is inert.
 *
 * Read-merge-write shaped after marketplace-configurator.js: existing hooks
 * and unrelated settings are preserved, and a re-run is a no-op (the guard
 * hook is detected by its command referencing the guard script filename).
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { log } = require('../utils/logger');
const { pathExists } = require('../utils/fs-utils');

const SETTINGS_FILE = '.claude/settings.json';
const GUARD_SCRIPT = 'awos-containment-guard.js';
// Tools the guard inspects: the Write family and the shell tools — Bash and
// PowerShell (a distinct Windows shell tool that must be matched explicitly, or
// its commands never reach the guard and bypass the egress / out-of-tree /
// secret-read / tamper checks) — plus the Read family (Read/Glob/Grep, for the
// secret-read deny). These are the channels a containment crossing travels
// through.
const HOOK_MATCHER =
  'Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell|Read|Glob|Grep';
// ${CLAUDE_PROJECT_DIR} is the documented Claude Code placeholder for the
// project root; Claude Code substitutes it regardless of host shell, so the
// command stays cross-platform.
const GUARD_COMMAND = `node "\${CLAUDE_PROJECT_DIR}/.awos/scripts/${GUARD_SCRIPT}"`;

/**
 * The PreToolUse matcher group that points at our guard script, or null. Used
 * both for the idempotency check and to detect a stale matcher on upgrade.
 */
function findGuardHookGroup(settings) {
  const preToolUse = settings.hooks && settings.hooks.PreToolUse;
  if (!Array.isArray(preToolUse)) return null;
  return (
    preToolUse.find(
      (group) =>
        group &&
        Array.isArray(group.hooks) &&
        group.hooks.some(
          (h) =>
            h &&
            typeof h.command === 'string' &&
            h.command.includes(GUARD_SCRIPT)
        )
    ) || null
  );
}

/**
 * Register the AWOS containment PreToolUse hook in .claude/settings.json.
 * Handles three cases:
 * - File doesn't exist: creates it with the hook block
 * - File exists without our hook: merges the hook block in
 * - File exists with our hook, current matcher: skips (already configured)
 * - File exists with our hook, stale matcher: refreshes the matcher in place
 *
 * @param {Object} config - Configuration options
 * @param {string} config.workingDir - The working directory
 * @param {boolean} config.dryRun - Whether to run in dry-run mode
 * @returns {Promise<Object>} Statistics: { hooksConfigured: boolean }
 */
async function configureHooks({ workingDir, dryRun = false }) {
  const settingsPath = path.join(workingDir, SETTINGS_FILE);
  const fileExists = await pathExists(settingsPath);

  let settings = {};

  if (fileExists) {
    const content = await fsPromises.readFile(settingsPath, 'utf-8');
    try {
      settings = JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON in ${SETTINGS_FILE}: ${error.message}`);
    }
  }

  const guardGroup = findGuardHookGroup(settings);
  if (guardGroup) {
    // Already registered. If an earlier version left a stale matcher (e.g. one
    // without the Read family), refresh it in place so every current deny class
    // routes to the guard on upgrade; otherwise it is a true no-op. The guard
    // script itself is always overwritten by the copy step, so only the matcher
    // can drift.
    if (guardGroup.matcher === HOOK_MATCHER) {
      log(`${SETTINGS_FILE} already has the AWOS containment hook`, 'info');
      return { hooksConfigured: false };
    }
    const staleMatcher = guardGroup.matcher;
    guardGroup.matcher = HOOK_MATCHER;
    if (!dryRun) {
      await fsPromises.writeFile(
        settingsPath,
        JSON.stringify(settings, null, 2) + '\n'
      );
      log(
        `Refreshed the AWOS containment hook matcher in ${SETTINGS_FILE} ` +
          `(${staleMatcher} → ${HOOK_MATCHER})`,
        'success'
      );
    }
    return { hooksConfigured: true };
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!Array.isArray(settings.hooks.PreToolUse)) {
    settings.hooks.PreToolUse = [];
  }

  settings.hooks.PreToolUse.push({
    matcher: HOOK_MATCHER,
    hooks: [{ type: 'command', command: GUARD_COMMAND }],
  });

  if (!dryRun) {
    await fsPromises.mkdir(path.dirname(settingsPath), { recursive: true });
    await fsPromises.writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2) + '\n'
    );

    if (fileExists) {
      log(
        `Added AWOS containment hook to existing ${SETTINGS_FILE}`,
        'success'
      );
    } else {
      log(`Created ${SETTINGS_FILE} with the AWOS containment hook`, 'success');
    }
  }

  return { hooksConfigured: true };
}

module.exports = { configureHooks };
