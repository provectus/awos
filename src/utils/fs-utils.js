/**
 * Filesystem utilities for AWOS setup
 * Shared utilities for common filesystem operations
 */

const fs = require('fs');
const fsPromises = fs.promises;

/**
 * Check if a path exists (file or directory)
 * @param {string} filePath - The path to check
 * @returns {Promise<boolean>} True if the path exists, false otherwise
 */
async function pathExists(filePath) {
  return await fsPromises
    .access(filePath, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);
}

module.exports = { pathExists };
