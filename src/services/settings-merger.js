/**
 * Settings Merger Service
 * Handles merging of JSON settings files (e.g., VS Code settings)
 * Single Responsibility: JSON settings merge operations
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { log } = require('../utils/logger');

/**
 * Deep equality check for two values
 * Handles primitives, objects, arrays, and null
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {boolean} True if values are deeply equal
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Deep merge two objects recursively
 * For nested objects, keys are merged; for primitive values, source takes precedence.
 * Arrays are deduplicated by combining unique values from both.
 * @param {Object} target - Target object to merge into
 * @param {Object} source - Source object with new values
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else if (Array.isArray(source[key])) {
      const targetArray = Array.isArray(result[key]) ? result[key] : [];
      const sourceArray = source[key];

      const combined = [...targetArray];

      for (const item of sourceArray) {
        const exists = combined.some((existing) => deepEqual(existing, item));
        if (!exists) {
          combined.push(item);
        }
      }

      result[key] = combined;
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Check if a path exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>}
 */
async function pathExists(filePath) {
  return await fsPromises
    .access(filePath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);
}

/**
 * Merge settings from source file into target file
 * Creates target file if it doesn't exist
 * @param {Object} config - Merge configuration
 * @param {string} config.sourceFile - Path to source settings file
 * @param {string} config.targetFile - Path to target settings file
 * @param {boolean} config.dryRun - Whether to run in dry-run mode
 * @returns {Promise<Object>} Result: { merged: boolean, created: boolean }
 */
async function mergeSettings({ sourceFile, targetFile, dryRun = false }) {
  const result = { merged: false, created: false };

  let sourceSettings;
  try {
    const sourceContent = await fsPromises.readFile(sourceFile, 'utf8');
    sourceSettings = JSON.parse(sourceContent);
  } catch (error) {
    if (error instanceof SyntaxError) {
      log(`Invalid JSON in source settings file: ${sourceFile}`, 'error');
      log(`Error: ${error.message}`, 'error');
      throw new Error(`Invalid JSON in source settings file: ${sourceFile}`);
    }
    throw error;
  }

  const targetExists = await pathExists(targetFile);

  if (targetExists) {
    let targetSettings;
    try {
      const targetContent = await fsPromises.readFile(targetFile, 'utf8');
      targetSettings = JSON.parse(targetContent);
    } catch (error) {
      if (error instanceof SyntaxError) {
        log(`Invalid JSON in target settings file: ${targetFile}`, 'error');
        log(`Error: ${error.message}`, 'error');
        throw new Error(`Invalid JSON in target settings file: ${targetFile}`);
      }
      throw error;
    }
    const mergedSettings = deepMerge(targetSettings, sourceSettings);

    if (dryRun) {
      log(`[DRY-RUN] Would merge settings into: ${targetFile}`, 'info');
    } else {
      const targetDir = path.dirname(targetFile);
      await fsPromises.mkdir(targetDir, { recursive: true });
      await fsPromises.writeFile(
        targetFile,
        JSON.stringify(mergedSettings, null, 2) + '\n',
        'utf8'
      );
      log(`Merged settings into: ${targetFile}`, 'success');
    }
    result.merged = true;
  } else {
    if (dryRun) {
      log(`[DRY-RUN] Would create settings: ${targetFile}`, 'info');
    } else {
      const targetDir = path.dirname(targetFile);
      await fsPromises.mkdir(targetDir, { recursive: true });
      await fsPromises.writeFile(
        targetFile,
        JSON.stringify(sourceSettings, null, 2) + '\n',
        'utf8'
      );
      log(`Created settings: ${targetFile}`, 'success');
    }
    result.created = true;
  }

  return result;
}

/**
 * Merge VS Code settings for Copilot
 * @param {Object} config - Configuration
 * @param {string} config.packageRoot - Root of the AWOS package
 * @param {string} config.targetDir - Target directory (user's project)
 * @param {boolean} config.dryRun - Whether to run in dry-run mode
 * @returns {Promise<Object>} Statistics
 */
async function mergeVSCodeSettings({ packageRoot, targetDir, dryRun = false }) {
  const sourceFile = path.join(packageRoot, 'copilot/vscode/settings.json');
  const targetFile = path.join(targetDir, '.vscode/settings.json');

  const sourceExists = await pathExists(sourceFile);
  if (!sourceExists) {
    return { merged: false, created: false };
  }

  return await mergeSettings({ sourceFile, targetFile, dryRun });
}

module.exports = {
  deepMerge,
  mergeSettings,
  mergeVSCodeSettings,
};
