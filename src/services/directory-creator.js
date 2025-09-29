/**
 * Directory Creator Service
 * Handles creation of directories during setup
 * Single Responsibility: Directory management operations
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { log } = require('../utils/logger');

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

/**
 * Create directories based on configuration
 * @param {Object} config - Directory creation configuration
 * @param {string} config.baseDir - The base directory where directories will be created
 * @param {Array<Object>} config.directories - Array of directory configurations
 * @returns {Promise<Object>} Statistics: { dirsCreated, dirsExisted }
 */
async function createDirectories({ baseDir, directories }) {
  const stats = {
    directoriesCreated: 0,
    directoriesExisted: 0,
  };

  for (const directory of directories) {
    const fullPath = path.join(baseDir, directory.path);
    const directoryExists = await pathExists(fullPath);

    if (!directoryExists) {
      await fsPromises.mkdir(fullPath, { recursive: true });
      log(`Created ${directory.path} - ${directory.description}`, 'success');
      stats.directoriesCreated++;
    } else {
      stats.directoriesExisted++;
      log(
        `${directory.path} - ${directory.description} already exists`,
        'info'
      );
    }
  }

  return stats;
}

module.exports = { createDirectories };
