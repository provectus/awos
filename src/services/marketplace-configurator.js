/**
 * Marketplace Configurator Service
 * Registers the AWOS plugin marketplace in .claude/settings.json and enables the
 * awos-containment plugin so its PreToolUse containment hook is active.
 * Single Responsibility: Plugin marketplace registration + plugin enablement
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { log } = require('../utils/logger');
const { pathExists } = require('../utils/fs-utils');

const SETTINGS_FILE = '.claude/settings.json';
const MARKETPLACE_NAME = 'awos-marketplace';
const MARKETPLACE_CONFIG = {
  source: {
    source: 'github',
    repo: 'provectus/awos',
  },
};

// The awos-containment plugin ships the PreToolUse containment guard as a hook.
// Registering the marketplace only makes the plugin available; Claude Code runs
// the hook only when the plugin is ENABLED, so setup also writes an
// enabledPlugins entry. The key is `<plugin-name>@<marketplace-name>` — both the
// plugin name and the marketplace name are the values declared in
// .claude-plugin/marketplace.json (mirrored here, as MARKETPLACE_NAME already
// mirrors that file's top-level name).
const CONTAINMENT_PLUGIN_NAME = 'awos-containment';
const ENABLED_PLUGIN_KEY = `${CONTAINMENT_PLUGIN_NAME}@${MARKETPLACE_NAME}`;

/**
 * Register the AWOS plugin marketplace in .claude/settings.json AND — subject to
 * consent — enable the awos-containment plugin. The two operations are
 * independent and each idempotent (read-merge-write): the marketplace is
 * registered unconditionally (it only makes the plugin AVAILABLE, harmless on
 * its own), while enablement is gated on `containmentConsent` and STICKY.
 *
 * Consent semantics:
 *   - The consent decision is recorded on FIRST install (the key is absent):
 *     `true` writes `true` (armed), `false` writes `false` (a recorded decline).
 *   - It is STICKY: once the key is present — whether the user enabled or
 *     explicitly declined — it is never re-flipped on a later run. This closes
 *     the `!== true` footgun where a deliberate `false` would be silently
 *     re-enabled on every reinstall.
 *
 * @param {Object} config - Configuration options
 * @param {string} config.workingDir - The working directory
 * @param {boolean} config.dryRun - Whether to run in dry-run mode
 * @param {boolean} [config.containmentConsent=true] - Whether to arm the
 *   awos-containment plugin on first install. Defaults to `true` so callers that
 *   do not pass it keep the secure-by-default behavior. Ignored when the key is
 *   already present (sticky).
 * @returns {Promise<Object>} Statistics:
 *   { marketplaceConfigured: boolean, containmentPluginEnabled: boolean }
 */
async function configureMarketplace({
  workingDir,
  dryRun = false,
  containmentConsent = true,
}) {
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

  if (!settings.extraKnownMarketplaces) {
    settings.extraKnownMarketplaces = {};
  }
  if (!settings.enabledPlugins) {
    settings.enabledPlugins = {};
  }

  const needsMarketplace = !settings.extraKnownMarketplaces[MARKETPLACE_NAME];

  // Sticky consent: only act when the key is absent. A present value (true OR
  // false) is a decision the user already made and must not be re-flipped.
  const pluginKeyPresent = Object.prototype.hasOwnProperty.call(
    settings.enabledPlugins,
    ENABLED_PLUGIN_KEY
  );
  const needsPluginWrite = !pluginKeyPresent;
  const pluginWriteValue = containmentConsent === true;

  if (needsMarketplace) {
    settings.extraKnownMarketplaces[MARKETPLACE_NAME] = MARKETPLACE_CONFIG;
  }
  if (needsPluginWrite) {
    settings.enabledPlugins[ENABLED_PLUGIN_KEY] = pluginWriteValue;
  }

  if (!needsMarketplace && !needsPluginWrite) {
    log(
      `${SETTINGS_FILE} already has ${MARKETPLACE_NAME} registered and a sticky ${ENABLED_PLUGIN_KEY} decision`,
      'info'
    );
    return { marketplaceConfigured: false, containmentPluginEnabled: false };
  }

  if (!dryRun) {
    await fsPromises.writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2) + '\n'
    );

    if (needsMarketplace) {
      log(
        fileExists
          ? `Added ${MARKETPLACE_NAME} to existing ${SETTINGS_FILE}`
          : `Created ${SETTINGS_FILE} with ${MARKETPLACE_NAME}`,
        'success'
      );
    }
    if (needsPluginWrite) {
      log(
        pluginWriteValue
          ? `Enabled ${ENABLED_PLUGIN_KEY} in ${SETTINGS_FILE}`
          : `Left ${ENABLED_PLUGIN_KEY} disabled in ${SETTINGS_FILE} (declined)`,
        pluginWriteValue ? 'success' : 'info'
      );
    }
  }

  return {
    marketplaceConfigured: needsMarketplace,
    containmentPluginEnabled: needsPluginWrite && pluginWriteValue,
  };
}

module.exports = { configureMarketplace };
