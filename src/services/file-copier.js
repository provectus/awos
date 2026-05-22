/**
 * File Copier Service
 * Handles file and directory copying operations
 * Single Responsibility: File copy operations with pattern matching
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { matchesAnyPattern } = require('../utils/pattern-matcher');
const { log } = require('../utils/logger');
const { style } = require('../config/constants');
const { pathExists } = require('../utils/fs-utils');

/**
 * Copy a single file if it matches the patterns
 * @param {Object} config - File copy configuration
 * @param {string} config.sourcePath - Source file path
 * @param {string} config.destinationPath - Destination file path
 * @param {string} config.targetDir - Target directory path (for relative path calculation)
 * @param {string[]} config.patterns - Array of patterns to match against filename
 * @param {Object} config.stats - Statistics tracker
 * @param {Set<string>} [config.skipPaths] - Destination paths to skip (preserve as-is)
 * @param {boolean} config.dryRun - Whether to run in dry-run mode
 * @returns {Promise<boolean>} True if file was copied, false otherwise
 */
async function copyFile({
  sourcePath,
  destinationPath,
  targetDir,
  patterns,
  stats,
  skipPaths,
  dryRun = false,
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

  // Honor opt-out for preserveOnUpdate destinations.
  if (skipPaths && skipPaths.has(destinationPath)) {
    stats.filesSkipped++;
    return false;
  }

  // Check if destination already exists
  const destinationExists = await pathExists(destinationPath);

  if (!dryRun) {
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
    const relativePath = path.relative(targetDir, destinationPath);

    if (destinationExists) {
      log(`Updated ${relativePath}`, 'success');
    } else {
      log(`Copied ${relativePath}`, 'success');
    }
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
 * @param {Object} config.stats - Statistics tracker
 * @param {Set<string>} [config.skipPaths] - Destination paths to skip (preserve as-is)
 * @returns {Promise<void>}
 */
async function copyDirectory({
  sourceDir,
  destinationDir,
  targetDir,
  patterns,
  description,
  stats,
  skipPaths,
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
  const relativePath = path.relative(targetDir, destinationDir);

  if (!destinationExists) {
    await fsPromises.mkdir(destinationDir, { recursive: true });
    log(`Created ${style.bold(relativePath)} - ${description}`, 'success');
  } else {
    log(`${style.bold(relativePath)} - ${description} already exists`, 'info');
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
        stats,
        skipPaths,
      });
    } else if (entry.isFile()) {
      await copyFile({
        sourcePath: entrySourcePath,
        destinationPath: entryDestinationPath,
        targetDir,
        patterns,
        stats,
        skipPaths,
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
}

/**
 * Count files that would be copied (for dry-run)
 * @param {Object} config - Same as copyDirectory but simplified
 * @returns {Promise<void>}
 */
async function countFiles({
  sourceDir,
  destinationDir,
  patterns,
  stats,
  skipPaths,
}) {
  // Verify source directory exists
  const sourceStat = await fsPromises.stat(sourceDir).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    return;
  }

  // Read directory entries
  const entries = await fsPromises.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const entrySourcePath = path.join(sourceDir, entry.name);
    const entryDestinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      await countFiles({
        sourceDir: entrySourcePath,
        destinationDir: entryDestinationPath,
        patterns,
        stats,
        skipPaths,
      });
    } else if (entry.isFile()) {
      const fileName = path.basename(entrySourcePath);
      if (!matchesAnyPattern(fileName, patterns)) continue;
      if (skipPaths && skipPaths.has(entryDestinationPath)) {
        stats.filesSkipped++;
        continue;
      }
      stats.filesCopied++;
    }
  }
}

/**
 * Walk a source tree and return absolute destination paths of files that
 * already exist at the destination (i.e. would be overwritten by a copy).
 *
 * @param {Object} config
 * @param {string} config.sourceDir
 * @param {string} config.destinationDir
 * @param {string[]} config.patterns
 * @returns {Promise<string[]>} Conflicting destination paths.
 */
async function findConflicts({ sourceDir, destinationDir, patterns }) {
  const conflicts = [];

  async function walk(srcDir, dstDir) {
    const srcStat = await fsPromises.stat(srcDir).catch(() => null);
    if (!srcStat?.isDirectory()) return;
    const entries = await fsPromises.readdir(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const dstPath = path.join(dstDir, entry.name);
      if (entry.isDirectory()) {
        await walk(srcPath, dstPath);
      } else if (entry.isFile()) {
        if (!matchesAnyPattern(entry.name, patterns)) continue;
        if (await pathExists(dstPath)) {
          conflicts.push(dstPath);
        }
      }
      // Symlinks intentionally skipped — current behavior never overwrites
      // an existing symlink (see copyDirectory) so they cannot conflict.
    }
  }

  await walk(sourceDir, destinationDir);
  return conflicts;
}

/**
 * For operations declared `preserveOnUpdate: true`, ask the user whether
 * to overwrite any pre-existing files. Returns a Set of destination paths
 * the file-copier should leave alone for the rest of this run.
 *
 * @param {Object} config
 * @param {Object} config.operation
 * @param {string} config.sourceDir
 * @param {string} config.destinationDir
 * @param {Function} config.promptForOverwrite
 * @param {Object} config.stats
 * @param {boolean} config.dryRun
 * @returns {Promise<Set<string>>} Empty set when nothing should be skipped.
 */
async function resolvePreserveDecision({
  operation,
  sourceDir,
  destinationDir,
  promptForOverwrite,
  stats,
  dryRun,
}) {
  const conflicts = await findConflicts({
    sourceDir,
    destinationDir,
    patterns: operation.patterns,
  });
  if (conflicts.length === 0) return new Set();

  // In dry-run we don't ask the user — assume the safe default (preserve).
  // countFiles increments stats.filesSkipped for each conflict via the
  // returned skipPaths set, so we only log here.
  if (dryRun) {
    log(
      `${style.bold(operation.destination)} - ${conflicts.length} existing file(s) would be preserved (run without --dry-run to choose)`,
      'info'
    );
    return new Set(conflicts);
  }

  const shouldOverwrite = await promptForOverwrite({
    operation,
    files: conflicts,
  });
  if (shouldOverwrite) return new Set();

  log(
    `Preserved existing ${style.bold(operation.destination)} (${conflicts.length} file(s) left untouched)`,
    'info'
  );
  if (operation.manualUpdateUrl) {
    log(`Update wrappers manually: ${operation.manualUpdateUrl}`, 'info');
  }
  return new Set(conflicts);
}

/**
 * Execute copy operations based on configuration
 * @param {Object} config - Copy operations configuration
 * @param {string} config.packageRoot - The root directory of the package
 * @param {string} config.targetDir - The target directory where files will be copied
 * @param {Array<Object>} config.copyOperations - Array of copy operation configurations
 * @param {Function} [config.promptForOverwrite] - Async callback consulted before
 *   overwriting files for operations marked `preserveOnUpdate`. Signature:
 *   `async ({operation, files}) => boolean`. Defaults to a no-op that returns
 *   `false` (preserve), which keeps non-interactive callers safe.
 * @param {boolean} config.dryRun - Whether to run in dry-run mode
 * @returns {Promise<Object>} Statistics: { filesCopied, filesSkipped }
 */
async function executeCopyOperations({
  packageRoot,
  targetDir,
  copyOperations,
  promptForOverwrite = async () => false,
  dryRun = false,
}) {
  const stats = { filesCopied: 0, filesSkipped: 0 };

  for (const operation of copyOperations) {
    const sourceDir = path.join(packageRoot, operation.source);
    const destinationDir = path.join(targetDir, operation.destination);

    let skipPaths = new Set();
    if (operation.preserveOnUpdate) {
      skipPaths = await resolvePreserveDecision({
        operation,
        sourceDir,
        destinationDir,
        promptForOverwrite,
        stats,
        dryRun,
      });
    }

    if (dryRun) {
      await countFiles({
        sourceDir,
        destinationDir,
        patterns: operation.patterns,
        stats,
        skipPaths,
      });
    } else {
      await copyDirectory({
        sourceDir,
        destinationDir,
        targetDir,
        patterns: operation.patterns,
        description: operation.description,
        stats,
        skipPaths,
      });
    }
  }

  return stats;
}

module.exports = { executeCopyOperations };
