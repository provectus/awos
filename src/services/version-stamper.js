/**
 * Version Stamper Service
 * Records the installed AWOS package version in .awos/.awos-version
 * Single Responsibility: Version bookkeeping for the self-check script
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { log } = require('../utils/logger');
const { pathExists } = require('../utils/fs-utils');

const VERSION_FILE = path.join('.awos', '.awos-version');

/**
 * Read the previously stamped version, if any.
 * @param {string} stampPath - Path to the stamp file
 * @returns {Promise<string|null>} The stamped version, or null if absent
 */
async function readStamp(stampPath) {
  if (!(await pathExists(stampPath))) {
    return null;
  }
  const content = await fsPromises.readFile(stampPath, 'utf-8');
  return content.trim();
}

/**
 * Stamp the installed AWOS version into .awos/.awos-version.
 *
 * Reads the version straight off disk via fsPromises.readFile + JSON.parse
 * rather than `require(packageRoot/package.json)`, so it stays independent
 * of the require cache and of how the caller computed packageRoot.
 *
 * This function never throws. A missing, unreadable, or malformed
 * package.json is bookkeeping trouble, not an installer failure — unlike
 * mcp-configurator.js, which throws on invalid JSON because that file is
 * the user's own and silent corruption there would matter. Here the
 * version stamp is ours to write; failing to write it should never fail
 * the install. The same applies if the stamp path itself is unreadable or
 * unwritable (e.g. `.awos/.awos-version` exists as a directory, or `.awos`
 * is blocked by a file of the same name): the read/mkdir/write is caught
 * and reported via `versionStampFailed` rather than rejecting.
 *
 * @param {Object} config - Configuration options
 * @param {string} config.workingDir - The working directory
 * @param {string} config.packageRoot - The root directory of the AWOS package
 * @param {boolean} config.dryRun - Whether to run in dry-run mode
 * @returns {Promise<Object>} Statistics: { versionStamped: boolean, version: string|null, versionStampFailed?: boolean }
 */
async function stampVersion({ workingDir, packageRoot, dryRun = false }) {
  const packageJsonPath = path.join(packageRoot, 'package.json');

  let version;
  try {
    const content = await fsPromises.readFile(packageJsonPath, 'utf-8');
    const parsed = JSON.parse(content);
    version = parsed.version;
  } catch (error) {
    log(
      `Could not read version from ${packageJsonPath}: ${error.message}`,
      'info'
    );
    return { versionStamped: false, version: null };
  }

  if (!version) {
    log(`${packageJsonPath} has no "version" field`, 'info');
    return { versionStamped: false, version: null };
  }

  const stampPath = path.join(workingDir, VERSION_FILE);

  try {
    const existingStamp = await readStamp(stampPath);

    if (existingStamp === version) {
      log(`${VERSION_FILE} already records ${version}`, 'info');
      return { versionStamped: false, version };
    }

    if (!dryRun) {
      await fsPromises.mkdir(path.dirname(stampPath), { recursive: true });
      await fsPromises.writeFile(stampPath, version, 'utf-8');
      log(`Stamped ${VERSION_FILE} with ${version}`, 'success');
    }

    return { versionStamped: true, version };
  } catch (error) {
    log(`Could not write ${VERSION_FILE}: ${error.message}`, 'info');
    return { versionStamped: false, versionStampFailed: true, version };
  }
}

module.exports = { stampVersion };
