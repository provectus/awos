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
 * The one probe used everywhere — preconditions and every operation.
 * lstat-based: a dangling symlink counts as present, since the entry is
 * real (fs.access follows the link and would misreport it as absent,
 * flipping precondition decisions). Only "no entry here" codes (ENOENT,
 * ENOTDIR) mean false; anything else (e.g. EACCES) is a real failure
 * and propagates, so the migration fails loudly and is retried on the
 * next run instead of logging a skip and stamping the version. A split
 * probe policy is worse than either policy alone: preconditions and
 * operations disagreeing about whether a path exists is how a migration
 * wedges half-way.
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>}
 */
async function lexists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return false;
    }
    throw error;
  }
}

/**
 * Execute a single operation
 * @param {Object} operation - The operation to execute
 * @param {string} workingDir - Working directory
 * @param {Object} options - Execution options
 * @returns {Promise<boolean>} Whether the operation changed anything
 *   (or would have, under dry-run). Skips return falsy so a migration
 *   whose operations all skipped is reported as skipped, not applied —
 *   the log must never claim work that never happened.
 */
async function executeOperation(
  operation,
  workingDir,
  { dryRun = false } = {}
) {
  const sourcePath = operation.from
    ? path.normalize(path.join(workingDir, operation.from))
    : null;
  const targetPath = operation.to
    ? path.normalize(path.join(workingDir, operation.to))
    : null;

  switch (operation.type) {
    case 'move':
      if (!sourcePath) {
        throw new Error('Move operation requires "from" field');
      }
      if (!targetPath) {
        throw new Error('Move operation requires "to" field');
      }

      // Check if source exists
      const sourceExists = await lexists(sourcePath);
      const targetExists = await lexists(targetPath);

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
        return true;
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
        log(`  Moved: ${operation.from} → ${operation.to}`, 'success');
        return true;
      }

    case 'copy':
      if (!sourcePath) {
        throw new Error('Copy operation requires "from" field');
      }
      if (!targetPath) {
        throw new Error('Copy operation requires "to" field');
      }

      // Check if source exists
      const copySourceExists = await lexists(sourcePath);
      const copyTargetExists = await lexists(targetPath);

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
        return true;
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
        log(`  Copied: ${operation.from} → ${operation.to}`, 'success');
        return true;
      }

    case 'delete':
      if (!sourcePath) {
        throw new Error('Delete operation requires "from" field');
      }
      if (dryRun) {
        if (!(await lexists(sourcePath))) {
          log(
            `  ${style.dim('[DRY-RUN]')} Would skip delete (not found): ${operation.from}`,
            'item'
          );
          return false;
        }
        log(
          `  ${style.dim('[DRY-RUN]')} Would delete: ${operation.from}`,
          'item'
        );
        return true;
      }
      if (!(await lexists(sourcePath))) {
        // fs.rm with force:true never throws ENOENT, so the not-found case
        // must be detected up front or the log claims a deletion that never
        // happened.
        log(
          `  ${style.dim('–')} Skipped delete (not found): ${operation.from}`,
          'item'
        );
        return false;
      }
      await fs.rm(sourcePath, { recursive: true, force: true });
      log(`  Deleted: ${operation.from}`, 'success');
      return true;

    case 'remove_json_key': {
      // Removes one key (dot-path) from a JSON file the installer itself
      // wrote earlier (e.g. the awos-recruitment server entry in .mcp.json).
      // The file belongs to the user's project, so anything unexpected —
      // missing file, unparseable JSON, absent key — is a skip, not an error.
      if (!operation.file) {
        throw new Error('remove_json_key operation requires "file" field');
      }
      if (!operation.key) {
        throw new Error('remove_json_key operation requires "key" field');
      }
      const filePath = path.normalize(path.join(workingDir, operation.file));
      const keySegments = operation.key.split('.');
      const label = `${operation.key} from ${operation.file}`;
      const skip = (reason) =>
        log(
          dryRun
            ? `  ${style.dim('[DRY-RUN]')} Would skip key removal (${reason}): ${label}`
            : `  ${style.dim('–')} Skipped key removal (${reason}): ${label}`,
          'item'
        );

      // Read and parse failures are different animals: an unreadable file
      // (EACCES, EISDIR, …) is an environmental failure — throw, so the
      // migration fails loudly, the version is not stamped, and the next
      // run retries. Only a file that genuinely isn't there is the
      // "nothing to clean" skip, and only unparseable content earns the
      // invalid-JSON label.
      let raw;
      try {
        raw = await fs.readFile(filePath, 'utf-8');
      } catch (error) {
        if (error.code === 'ENOENT') {
          skip('file not found');
          return;
        }
        throw error;
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        skip('file is not valid JSON');
        return;
      }

      let parent = parsed;
      for (const segment of keySegments.slice(0, -1)) {
        parent =
          parent && typeof parent === 'object' ? parent[segment] : undefined;
      }
      const leaf = keySegments[keySegments.length - 1];
      if (
        !parent ||
        typeof parent !== 'object' ||
        !Object.prototype.hasOwnProperty.call(parent, leaf)
      ) {
        skip('key not present');
        return;
      }

      if (dryRun) {
        log(`  ${style.dim('[DRY-RUN]')} Would remove: ${label}`, 'item');
        return true;
      }
      delete parent[leaf];
      // Atomic replace that survives symlinks and preserves permissions.
      // Write-to-temp + same-directory rename keeps the file either the
      // old content or the new, never a torn write (an in-place write
      // interrupted mid-flight would leave truncated JSON that the
      // invalid-JSON skip above then abandons for good). The rename must
      // target the REAL file: a .mcp.json symlinked from a dotfiles repo
      // is written through, not replaced with a regular file that strands
      // the link target. The original mode is copied onto the temp file
      // first — a 0600 config must not come back world-readable — and the
      // temp file is removed if anything fails in between.
      const realPath = await fs.realpath(filePath);
      const { mode } = await fs.stat(realPath);
      const tmpPath = `${realPath}.awos-tmp`;
      try {
        await fs.writeFile(
          tmpPath,
          JSON.stringify(parsed, null, 2) + '\n',
          'utf-8'
        );
        await fs.chmod(tmpPath, mode);
        await fs.rename(tmpPath, realPath);
      } catch (error) {
        await fs.rm(tmpPath, { force: true });
        throw error;
      }
      log(`  Removed: ${label}`, 'success');
      return true;
    }

    case 'replace_content': {
      // Replaces the whole content of a file the installer itself wrote
      // earlier (e.g. a removed command's body becomes a tombstone that a
      // preserved user wrapper still resolves to). Replace-only by default:
      // when the target is absent there is nothing stale to defuse, and
      // creating it would plant framework files in projects that never had
      // them — so a missing file is a skip, not a create. The optional
      // `create_if` field names a path whose presence authorizes creating
      // the missing target (e.g. a preserved wrapper whose @-import would
      // otherwise stay broken in a clone that committed .claude/ but not
      // .awos/) — fresh projects have no such trigger, so they stay clean.
      if (!operation.file) {
        throw new Error('replace_content operation requires "file" field');
      }
      if (!Array.isArray(operation.content)) {
        throw new Error(
          'replace_content operation requires a "content" array field'
        );
      }
      const filePath = path.normalize(path.join(workingDir, operation.file));
      const targetFound = await lexists(filePath);
      const createAuthorized =
        !targetFound &&
        operation.create_if &&
        (await lexists(
          path.normalize(path.join(workingDir, operation.create_if))
        ));
      if (!targetFound && !createAuthorized) {
        log(
          dryRun
            ? `  ${style.dim('[DRY-RUN]')} Would skip content replace (not found): ${operation.file}`
            : `  ${style.dim('–')} Skipped content replace (not found): ${operation.file}`,
          'item'
        );
        return false;
      }
      if (dryRun) {
        log(
          `  ${style.dim('[DRY-RUN]')} Would ${targetFound ? 'replace content' : `create (${operation.create_if} present)`}: ${operation.file}`,
          'item'
        );
        return true;
      }
      if (!targetFound) {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
      }
      // Atomic write (temp + same-directory rename): a partial tombstone
      // interrupted mid-write would be frozen forever by the migration's
      // skip_if_any on the next run — a torn file must never be able to
      // pass for a preserved 1.x body. The temp file is removed if
      // anything fails in between.
      const contentTmpPath = `${filePath}.awos-tmp`;
      try {
        await fs.writeFile(
          contentTmpPath,
          operation.content.join('\n') + '\n',
          'utf-8'
        );
        await fs.rename(contentTmpPath, filePath);
      } catch (error) {
        await fs.rm(contentTmpPath, { force: true });
        throw error;
      }
      log(
        `  ${targetFound ? 'Replaced content' : `Created (${operation.create_if} present)`}: ${operation.file}`,
        'success'
      );
      return true;
    }

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

  // Check skip_if_any conditions. A match means the migration has
  // nothing to do here — either it already ran, or (disown-in-place)
  // the file it would repair is deliberately preserved. The label must
  // not claim a migration happened when the policy is preservation.
  if (preconditions.skip_if_any) {
    for (const checkPath of preconditions.skip_if_any) {
      const fullPath = path.join(workingDir, checkPath);
      if (await lexists(fullPath)) {
        return {
          shouldRun: false,
          matchedSkip: true,
          reason: `Nothing to do (${checkPath} is present)`,
        };
      }
    }
  }

  // Check require_any conditions (at least one must exist to proceed)
  if (preconditions.require_any) {
    let foundOne = false;
    for (const checkPath of preconditions.require_any) {
      const fullPath = path.join(workingDir, checkPath);
      if (await lexists(fullPath)) {
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
      if (!(await lexists(fullPath))) {
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
      if (await lexists(fullPath)) {
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
  const { shouldRun, reason, matchedSkip } = await checkPreconditions(
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
    return matchedSkip ? 'already_applied' : 'not_applicable';
  }

  // Execute operations, counting only the ones that actually changed
  // something (or would, under dry-run). A migration whose preconditions
  // matched but whose every operation skipped did no work — reporting it
  // as applied would claim changes that never happened (e.g. a cleanup
  // matching on a user's own file that holds nothing to clean).
  let changedOperations = 0;
  for (const operation of migration.operations) {
    try {
      if (await executeOperation(operation, workingDir, options)) {
        changedOperations++;
      }
    } catch (error) {
      throw new Error(
        `Migration ${migration.version} failed during ${operation.type} operation: ${error.message}`
      );
    }
  }

  return changedOperations > 0 ? 'applied' : 'skipped';
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

    // Log migration status - only for non-dry-run
    if (!dryRun) {
      log(`${style.info('ℹ')} ${pending.length} migration(s) to apply`, 'info');
    }

    // Execute migrations in order. stampedVersion tracks what the
    // version file actually says — an optional-migration failure halts
    // advancement early, so the loop's end is not proof of the latest.
    let applicableMigrations = 0;
    let stampedVersion = currentVersion;
    for (const migration of pending) {
      if (dryRun) {
        log(
          `Checking migration ${migration.version}: ${migration.name}`,
          'info'
        );
      } else {
        log(
          `Running migration ${migration.version}: ${migration.name}`,
          'info'
        );
      }

      let status;
      try {
        status = await executeMigration(migration, workingDir, { dryRun });
      } catch (error) {
        if (migration.optional) {
          // An optional migration (a repair or cleanup) must never block
          // the install: warn, halt version advancement — so this and any
          // later migrations are retried on the next update — and let
          // setup continue to the copy step. Only migrations the layout
          // depends on may abort the run.
          log(
            `${style.warn('⚠')} Migration ${migration.version} could not run and will be retried on the next update: ${error.message}`,
            'item'
          );
          break;
        }
        throw error;
      }

      // Only count migrations that are actually applied or would be applied
      if (status === 'applied') {
        applicableMigrations++;
      }

      if (!dryRun) {
        // Update version after successful migration
        await writeVersion(versionFile, migration.version);
        stampedVersion = migration.version;
      }
    }

    // Clear the last line if it's a status line
    clearLine();

    // Only report if migrations were actually applicable
    if (!dryRun && applicableMigrations > 0) {
      log(
        `Applied ${applicableMigrations} migration(s) successfully`,
        'success'
      );
    }

    return {
      applied: applicableMigrations,
      current: dryRun ? currentVersion : stampedVersion,
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

// executeOperation is exported for the op-level unit tests only — the
// installer itself goes through runMigrations.
module.exports = { runMigrations, executeOperation };
