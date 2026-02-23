/**
 * Setup Orchestrator
 * Coordinates the entire AWOS setup process
 * Single Responsibility: Orchestration of setup workflow
 */

const { AWOS_ASCII, AWOS_SUBTITLE, style } = require('../config/constants');
const { directories, copyOperations } = require('../config/setup-config');
const {
  showHeader,
  showStep,
  log,
  clearLine,
  showSummary,
} = require('../utils/logger');
const { createDirectories } = require('../services/directory-creator');
const { executeCopyOperations } = require('../services/file-copier');
const { configureMcp } = require('../services/mcp-configurator');
const { runMigrations } = require('../migrations/runner');

/**
 * Run the setup process
 * @param {Object} config - Setup configuration
 * @param {string} config.workingDir - The working directory where setup will be performed
 * @param {string} config.packageRoot - The root directory of the AWOS package
 * @param {boolean} config.dryRun - Run in dry-run mode (preview changes only)
 * @returns {Promise<void>}
 */
async function runSetup({ workingDir, packageRoot, dryRun = false }) {
  const TOTAL_STEPS = 5;

  // Display header
  showHeader(AWOS_ASCII, AWOS_SUBTITLE);

  // Show dry-run mode notice
  if (dryRun) {
    log(`${style.warn('DRY-RUN MODE:')} No files will be modified`, 'info');
    console.log('');
  }

  // Step 1: Initialization
  showStep(
    'Initialization',
    'Checking environment and preparing setup',
    1,
    TOTAL_STEPS
  );
  log(`Working directory: ${style.dim(workingDir)}`, 'item');

  // Step 2: Creating directories
  showStep(
    'Creating Directories',
    'Setting up project structure',
    2,
    TOTAL_STEPS
  );
  const directoryStatistics = await createDirectories({
    baseDir: workingDir,
    directories,
    dryRun,
  });
  clearLine();

  // Step 3: Running migrations
  showStep(
    'Running Migrations',
    'Updating existing project structure',
    3,
    TOTAL_STEPS
  );
  const migrationStatistics = await runMigrations(workingDir, { dryRun });
  clearLine();

  // Step 4: Installing components
  showStep(
    'Installing Components',
    'Copying commands, templates, and agents',
    4,
    TOTAL_STEPS
  );
  const fileStatistics = await executeCopyOperations({
    packageRoot,
    targetDir: workingDir,
    copyOperations,
    dryRun,
  });

  // Step 5: Configure MCP
  showStep(
    'Configuring MCP',
    'Setting up MCP server configuration',
    5,
    TOTAL_STEPS
  );
  const mcpStatistics = await configureMcp({ workingDir, dryRun });
  clearLine();

  // Display summary with combined statistics
  const statistics = {
    ...directoryStatistics,
    ...fileStatistics,
    ...mcpStatistics,
    migrations: migrationStatistics.applied,
  };
  showSummary(statistics, { dryRun });
}

module.exports = { runSetup };
