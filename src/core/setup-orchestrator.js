/**
 * Setup Orchestrator
 * Coordinates the entire AWOS setup process
 * Single Responsibility: Orchestration of setup workflow
 */

const { AWOS_ASCII, AWOS_SUBTITLE, style } = require('../config/constants');
const {
  getDirectories,
  getCopyOperations,
} = require('../config/setup-config');
const {
  showHeader,
  showStep,
  log,
  clearLine,
  showSummary,
} = require('../utils/logger');
const { createDirectories } = require('../services/directory-creator');
const { executeCopyOperations } = require('../services/file-copier');
const { runMigrations } = require('../migrations/runner');

/**
 * Run the setup process
 * @param {Object} config - Setup configuration
 * @param {string} config.workingDir - The working directory where setup will be performed
 * @param {string} config.packageRoot - The root directory of the AWOS package
 * @param {boolean} config.forceOverwrite - Force overwrite all files regardless of config
 * @param {boolean} config.dryRun - Run in dry-run mode (preview changes only)
 * @param {string} config.agent - The AI agent to configure (e.g., 'claude')
 * @returns {Promise<void>}
 */
async function runSetup({
  workingDir,
  packageRoot,
  forceOverwrite = false,
  dryRun = false,
  agent,
}) {
  const TOTAL_STEPS = 4;

  // Display header
  showHeader(AWOS_ASCII, AWOS_SUBTITLE, agent);

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
  const directories = getDirectories(agent);
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
  const copyOperations = getCopyOperations(agent);
  const fileStatistics = await executeCopyOperations({
    packageRoot,
    targetDir: workingDir,
    copyOperations,
    forceOverwrite,
    dryRun,
  });

  // Display summary with combined statistics
  const statistics = {
    ...directoryStatistics,
    ...fileStatistics,
    migrations: migrationStatistics.applied,
  };
  showSummary(statistics, { forceOverwrite, dryRun, agent });
}

module.exports = { runSetup };
