/**
 * File Copier Service
 * Handles file and directory copying operations
 * Single Responsibility: File copy operations with pattern matching
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { matchesAnyPattern } = require('../utils/pattern-matcher');
const { log, clearLine } = require('../utils/logger');
const { style } = require('../config/constants');

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
 * Copy a single file if it matches the patterns
 * @param {Object} config - File copy configuration
 * @param {string} config.sourcePath - Source file path
 * @param {string} config.destinationPath - Destination file path
 * @param {string} config.targetDir - Target directory path (for relative path calculation)
 * @param {string[]} config.patterns - Array of patterns to match against filename
 * @param {boolean} config.shouldOverwrite - Whether to overwrite existing files
 * @param {boolean} config.forceOverwrite - Force overwrite regardless of config
 * @param {Object} config.stats - Statistics tracker
 * @returns {Promise<boolean>} True if file was copied, false otherwise
 */
async function copyFile({
  sourcePath,
  destinationPath,
  targetDir,
  patterns,
  shouldOverwrite,
  forceOverwrite,
  stats,
}) {
  // Check if source file exists
  const sourceExists = await pathExists(sourcePath);
  if (!sourceExists) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  // Check if filename matches any pattern
  const fileName = path.basename(sourcePath);
  if (!matchesAnyPattern(fileName, patterns)) {
    return false;
  }

  // Check if destination already exists
  const destinationExists = await pathExists(destinationPath);
  // If the destination exists, and the overwrite flag is not set, and the force overwrite flag is not set, skip the file
  const shouldSkip = destinationExists && !shouldOverwrite && !forceOverwrite;
  if (shouldSkip) {
    stats.filesSkipped++;
    return false;
  }

  // Ensure destination directory exists
  const destinationDir = path.dirname(destinationPath);
  await fsPromises.mkdir(destinationDir, { recursive: true });

  // Remove existing file if it exists
  if (destinationExists) {
    await fsPromises.unlink(destinationPath);
  }

  // Copy the file
  await fsPromises.copyFile(sourcePath, destinationPath);

  // Log the result
  const relativePath = destinationPath.replace(targetDir + '/', '');
  const wasForced = !shouldOverwrite && forceOverwrite;

  if (destinationExists) {
    if (wasForced) {
      log(style.error(`Forced overwrite ${relativePath}`), 'success');
    } else {
      log(`Overwrote ${relativePath}`, 'success');
    }
  } else {
    log(`Copied ${relativePath}`, 'success');
  }

  stats.filesCopied++;
  return true;
}

/**
 * Recursively copy a directory with pattern matching
 * @param {Object} config - Directory copy configuration
 * @param {string} config.sourceDir - Source directory path
 * @param {string} config.destinationDir - Destination directory path
 * @param {string} config.targetDir - Target directory path (for relative path calculation)
 * @param {string[]} config.patterns - Array of patterns to match against filenames
 * @param {string} config.description - Human-readable description of the operation
 * @param {boolean} config.shouldOverwrite - Whether to overwrite existing files
 * @param {boolean} config.forceOverwrite - Force overwrite regardless of config
 * @param {Object} config.stats - Statistics tracker
 * @returns {Promise<void>}
 */
async function copyDirectory({
  sourceDir,
  destinationDir,
  targetDir,
  patterns,
  description,
  shouldOverwrite,
  forceOverwrite,
  stats,
}) {
  // Verify source directory exists
  const sourceStat = await fsPromises.stat(sourceDir).catch(() => null);
  const isValidDirectory = sourceStat?.isDirectory();

  if (!isValidDirectory) {
    log(`Source directory not found: ${sourceDir}`, 'error');
    return;
  }

  // Check if destination directory already exists
  const destinationExists = await pathExists(destinationDir);
  const relativePath = destinationDir.replace(targetDir + '/', '');

  console.log('');
  if (!destinationExists) {
    await fsPromises.mkdir(destinationDir, { recursive: true });
    console.group(`  ✓ Created ${style.bold(relativePath)} - ${description}`);
  } else {
    console.group(
      `  • ${style.bold(relativePath)} - ${description} already exists`
    );
  }

  // Read and process all entries in the directory
  const entries = await fsPromises.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const entrySourcePath = path.join(sourceDir, entry.name);
    const entryDestinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory({
        sourceDir: entrySourcePath,
        destinationDir: entryDestinationPath,
        targetDir,
        patterns,
        description,
        shouldOverwrite,
        forceOverwrite,
        stats,
      });
    } else if (entry.isFile()) {
      await copyFile({
        sourcePath: entrySourcePath,
        destinationPath: entryDestinationPath,
        targetDir,
        patterns,
        shouldOverwrite,
        forceOverwrite,
        stats,
      });
    } else if (
      entry.isSymbolicLink() &&
      matchesAnyPattern(entry.name, patterns)
    ) {
      const symlinkExists = await pathExists(entryDestinationPath);

      if (!symlinkExists) {
        const symlinkTarget = await fsPromises.readlink(entrySourcePath);
        await fsPromises.symlink(symlinkTarget, entryDestinationPath);
        stats.filesCopied++;
      }
    }
  }

  console.groupEnd();
  clearLine();
}

/**
 * Execute copy operations based on configuration
 * @param {Object} config - Copy operations configuration
 * @param {string} config.packageRoot - The root directory of the package
 * @param {string} config.targetDir - The target directory where files will be copied
 * @param {Array<Object>} config.copyOperations - Array of copy operation configurations
 * @param {boolean} config.forceOverwrite - Force overwrite all files regardless of config
 * @returns {Promise<Object>} Statistics: { filesCopied, filesSkipped }
 */
async function executeCopyOperations({
  packageRoot,
  targetDir,
  copyOperations,
  forceOverwrite = false,
}) {
  const stats = { filesCopied: 0, filesSkipped: 0 };

  for (const operation of copyOperations) {
    const sourceDir = path.join(packageRoot, operation.source);
    const destinationDir = path.join(targetDir, operation.destination);

    await copyDirectory({
      sourceDir,
      destinationDir,
      targetDir,
      patterns: operation.patterns,
      description: operation.description,
      shouldOverwrite: operation.overwrite,
      forceOverwrite,
      stats,
    });
  }

  if (stats.filesSkipped > 0) {
    log(`Skipped ${stats.filesSkipped} existing files`, 'info');
  }

  return stats;
}

module.exports = { executeCopyOperations };
