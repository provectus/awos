/**
 * Migration Runner
 * Handles executing migrations to update project structure
 * Single Responsibility: Managing and executing migrations in order
 */

const fs = require('fs').promises;
const path = require('path');
const { log, clearLine } = require('../utils/logger');
const { style } = require('../config/constants');

/**
 * Read the current migration version
 * @param {string} versionFile - Path to version file
 * @returns {Promise<number>} Current version (0 if file doesn't exist)
 */
async function readVersion(versionFile) {
  try {
    const content = await fs.readFile(versionFile, 'utf-8');
    const version = parseInt(content.trim(), 10);
    return isNaN(version) ? 0 : version;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0; // File doesn't exist, start from 0
    }
    throw error;
  }
}

/**
 * Write the migration version
 * @param {string} versionFile - Path to version file
 * @param {number} version - Version to write
 * @returns {Promise<void>}
 */
async function writeVersion(versionFile, version) {
  // Ensure directory exists
  await fs.mkdir(path.dirname(versionFile), { recursive: true });
  await fs.writeFile(versionFile, version.toString(), 'utf-8');
}

/**
 * Load all migration files from the migrations directory
 * @returns {Promise<Array>} Sorted array of migrations
 */
async function loadMigrations() {
  const migrationsDir = path.join(__dirname);
  const files = await fs.readdir(migrationsDir);

  const migrations = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const filePath = path.join(migrationsDir, file);
    const content = await fs.readFile(filePath, 'utf-8');

    try {
      const migration = JSON.parse(content);
      migrations.push(migration);
    } catch (error) {
      throw new Error(`Invalid migration JSON in ${file}: ${error.message}`);
    }
  }

  // Sort by version
  return migrations.sort((a, b) => a.version - b.version);
}

/**
 * Check if a file exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>}
 */
async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute a single operation
 * @param {Object} operation - The operation to execute
 * @param {string} workingDir - Working directory
 * @param {Object} options - Execution options
 * @returns {Promise<void>}
 */
async function executeOperation(
  operation,
  workingDir,
  { dryRun = false } = {}
) {
  const sourcePath = path.normalize(path.join(workingDir, operation.from));
  const targetPath = operation.to
    ? path.normalize(path.join(workingDir, operation.to))
    : null;

  switch (operation.type) {
    case 'move':
      if (!targetPath) {
        throw new Error('Move operation requires "to" field');
      }

      // Check if source exists
      const sourceExists = await exists(sourcePath);
      const targetExists = await exists(targetPath);

      if (dryRun) {
        if (!sourceExists) {
          log(
            `  ${style.dim('[DRY-RUN]')} Would skip move (source not found): ${operation.from}`,
            'item'
          );
          return;
        }
        if (targetExists) {
          log(
            `  ${style.warn('⚠')} ${style.dim('[DRY-RUN]')} Would skip move (target exists): ${operation.to}`,
            'item'
          );
          return;
        }
        log(
          `  ${style.dim('[DRY-RUN]')} Would move: ${operation.from} → ${operation.to}`,
          'item'
        );
      } else {
        if (!sourceExists) {
          // Source doesn't exist - skip silently (might be already migrated)
          return;
        }
        if (targetExists) {
          // Target already exists - skip silently (already migrated)
          return;
        }

        // Ensure target directory exists
        await fs.mkdir(path.dirname(targetPath), { recursive: true });

        // Perform the move
        await fs.rename(sourcePath, targetPath);
        log(
          `  ${style.success('✓')} Moved: ${operation.from} → ${operation.to}`,
          'item'
        );
      }
      break;

    case 'copy':
      if (!targetPath) {
        throw new Error('Copy operation requires "to" field');
      }

      // Check if source exists
      const copySourceExists = await exists(sourcePath);
      const copyTargetExists = await exists(targetPath);

      if (dryRun) {
        if (!copySourceExists) {
          log(
            `  ${style.dim('[DRY-RUN]')} Would skip copy (source not found): ${operation.from}`,
            'item'
          );
          return;
        }
        if (copyTargetExists) {
          log(
            `  ${style.warn('⚠')} ${style.dim('[DRY-RUN]')} Would skip copy (target exists): ${operation.to}`,
            'item'
          );
          return;
        }
        log(
          `  ${style.dim('[DRY-RUN]')} Would copy: ${operation.from} → ${operation.to}`,
          'item'
        );
      } else {
        if (!copySourceExists) {
          // Source doesn't exist - skip silently
          return;
        }
        if (copyTargetExists) {
          // Target already exists - skip silently
          return;
        }

        // Ensure target directory exists
        await fs.mkdir(path.dirname(targetPath), { recursive: true });

        // Perform the copy
        await fs.copyFile(sourcePath, targetPath);
        log(
          `  ${style.success('✓')} Copied: ${operation.from} → ${operation.to}`,
          'item'
        );
      }
      break;

    case 'delete':
      if (dryRun) {
        if (!(await exists(sourcePath))) {
          log(
            `  ${style.dim('[DRY-RUN]')} Would skip delete (not found): ${operation.from}`,
            'item'
          );
        } else {
          log(
            `  ${style.dim('[DRY-RUN]')} Would delete: ${operation.from}`,
            'item'
          );
        }
      } else {
        try {
          await fs.unlink(sourcePath);
          log(`  ${style.success('✓')} Deleted: ${operation.from}`, 'item');
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
          // File doesn't exist, that's okay for delete
          log(
            `  ${style.dim('–')} Skipped delete (not found): ${operation.from}`,
            'item'
          );
        }
      }
      break;

    default:
      throw new Error(`Unknown operation type: ${operation.type}`);
  }
}

/**
 * Check migration preconditions
 * @param {Object} preconditions - The preconditions to check
 * @param {string} workingDir - Working directory
 * @param {boolean} dryRun - Whether this is a dry run
 * @returns {Promise<Object>} Result with { shouldRun, reason }
 */
async function checkPreconditions(preconditions, workingDir, dryRun = false) {
  if (!preconditions) {
    // No preconditions defined - always run
    return { shouldRun: true, reason: null };
  }

  // Check skip_if_any conditions (files that indicate migration already applied)
  if (preconditions.skip_if_any) {
    for (const checkPath of preconditions.skip_if_any) {
      const fullPath = path.join(workingDir, checkPath);
      if (await exists(fullPath)) {
        return {
          shouldRun: false,
          reason: `Already migrated (${checkPath} exists)`,
        };
      }
    }
  }

  // Check require_any conditions (at least one must exist to proceed)
  if (preconditions.require_any) {
    let foundOne = false;
    for (const checkPath of preconditions.require_any) {
      const fullPath = path.join(workingDir, checkPath);
      if (await exists(fullPath)) {
        foundOne = true;
        break;
      }
    }
    if (!foundOne) {
      return {
        shouldRun: false,
        reason: 'Not applicable (source files not found)',
      };
    }
  }

  // Check require_all conditions (all must exist to proceed)
  if (preconditions.require_all) {
    for (const checkPath of preconditions.require_all) {
      const fullPath = path.join(workingDir, checkPath);
      if (!(await exists(fullPath))) {
        return {
          shouldRun: false,
          reason: `Not applicable (${checkPath} not found)`,
        };
      }
    }
  }

  // Check error_if_any conditions (raise error if found)
  if (preconditions.error_if_any) {
    for (const checkPath of preconditions.error_if_any) {
      const fullPath = path.join(workingDir, checkPath);
      if (await exists(fullPath)) {
        throw new Error(
          `Migration blocked: Unexpected file found at ${checkPath}. ` +
            `This may indicate a custom setup that requires manual migration.`
        );
      }
    }
  }

  return { shouldRun: true, reason: null };
}

/**
 * Execute a migration
 * @param {Object} migration - The migration to execute
 * @param {string} workingDir - Working directory
 * @param {Object} options - Execution options
 * @returns {Promise<string>} Status: 'applied', 'skipped', or 'not_applicable'
 */
async function executeMigration(migration, workingDir, options = {}) {
  const { dryRun = false } = options;

  // Check preconditions
  const { shouldRun, reason } = await checkPreconditions(
    migration.preconditions,
    workingDir,
    dryRun
  );

  if (!shouldRun) {
    // Migration should be skipped - this is not an error
    if (dryRun) {
      log(`  ${style.dim('[DRY-RUN]')} Would skip: ${reason}`, 'item');
    }
    // Don't log anything for non-dry-run skips to avoid confusion
    return reason?.includes('Already migrated')
      ? 'already_applied'
      : 'not_applicable';
  }

  // Execute operations
  let operationsExecuted = 0;
  for (const operation of migration.operations) {
    try {
      await executeOperation(operation, workingDir, options);
      operationsExecuted++;
    } catch (error) {
      throw new Error(
        `Migration ${migration.version} failed during ${operation.type} operation: ${error.message}`
      );
    }
  }

  return operationsExecuted > 0 ? 'applied' : 'skipped';
}

/**
 * Run all pending migrations
 * @param {string} workingDir - Working directory
 * @param {Object} options - Options for migration execution
 * @returns {Promise<Object>} Migration statistics
 */
async function runMigrations(workingDir, options = {}) {
  const { dryRun = false } = options;
  const versionFile = path.join(workingDir, '.awos', '.migration-version');

  try {
    // Get current version
    const currentVersion = await readVersion(versionFile);

    // Load all migrations
    const migrations = await loadMigrations();

    // Filter pending migrations
    const pending = migrations.filter((m) => m.version > currentVersion);

    if (pending.length === 0) {
      return {
        applied: 0,
        current: currentVersion,
        latest:
          migrations.length > 0
            ? Math.max(...migrations.map((m) => m.version))
            : 0,
      };
    }

    // Log migration status
    if (dryRun) {
      log(
        `${style.info('ℹ')} ${style.dim('[DRY-RUN]')} ${pending.length} migration(s) would be applied`,
        'info'
      );
    } else {
      log(
        `${style.info('ℹ')} ${pending.length} migration(s) to apply`,
        'info'
      );
    }

    // Execute migrations in order
    for (const migration of pending) {
      log(
        `${dryRun ? `${style.dim('  [DRY-RUN]')} Would run` : 'Running'} migration ${migration.version}: ${migration.name}`,
        'info'
      );

      await executeMigration(migration, workingDir, { dryRun });

      if (!dryRun) {
        // Update version after successful migration
        await writeVersion(versionFile, migration.version);
      }
    }

    // Clear the last line if it's a status line
    clearLine();

    // Report success
    if (dryRun) {
      log(
        `${style.success('✓')} ${style.dim('[DRY-RUN]')} ${pending.length} migration(s) would be applied successfully`,
        'success'
      );
    } else {
      log(
        `${style.success('✓')} Applied ${pending.length} migration(s) successfully`,
        'success'
      );
    }

    return {
      applied: pending.length,
      current: dryRun ? currentVersion : pending[pending.length - 1].version,
      latest: Math.max(...migrations.map((m) => m.version)),
    };
  } catch (error) {
    // Clean error message for better user experience
    const cleanMessage = error.message.replace(
      /^Migration \d+ failed.*?: /,
      ''
    );
    throw new Error(`Migration failed: ${cleanMessage}`);
  }
}

module.exports = { runMigrations };
