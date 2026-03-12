/**
 * Marketplace Configurator Service
 * Handles registration of AWOS plugin marketplace in .claude/settings.json
 * Single Responsibility: Plugin marketplace registration
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

/**
 * Register the AWOS plugin marketplace in .claude/settings.json
 * Handles three cases:
 * - File doesn't exist: creates it with the marketplace entry
 * - File exists without the entry: adds the marketplace entry
 * - File exists with the entry: skips (already configured)
 *
 * @param {Object} config - Configuration options
 * @param {string} config.workingDir - The working directory
 * @param {boolean} config.dryRun - Whether to run in dry-run mode
 * @returns {Promise<Object>} Statistics: { marketplaceConfigured: boolean }
 */
async function configureMarketplace({ workingDir, dryRun = false }) {
  const settingsPath = path.join(workingDir, SETTINGS_FILE);
  const fileExists = await pathExists(settingsPath);

  let settings = {};

  if (fileExists) {
    const content = await fsPromises.readFile(settingsPath, 'utf-8');
    settings = JSON.parse(content);
  }

  if (!settings.extraKnownMarketplaces) {
    settings.extraKnownMarketplaces = {};
  }

  if (settings.extraKnownMarketplaces[MARKETPLACE_NAME]) {
    log(`${SETTINGS_FILE} already has ${MARKETPLACE_NAME} registered`, 'info');
    return { marketplaceConfigured: false };
  }

  settings.extraKnownMarketplaces[MARKETPLACE_NAME] = MARKETPLACE_CONFIG;

  if (!dryRun) {
    await fsPromises.writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2) + '\n'
    );

    if (fileExists) {
      log(`Added ${MARKETPLACE_NAME} to existing ${SETTINGS_FILE}`, 'success');
    } else {
      log(`Created ${SETTINGS_FILE} with ${MARKETPLACE_NAME}`, 'success');
    }
  }

  return { marketplaceConfigured: true };
}

module.exports = { configureMarketplace };
