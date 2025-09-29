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

/**
 * Run the setup process
 * @param {Object} config - Setup configuration
 * @param {string} config.workingDir - The working directory where setup will be performed
 * @param {string} config.packageRoot - The root directory of the AWOS package
 * @param {boolean} config.forceOverwrite - Force overwrite all files regardless of config
 * @returns {Promise<void>}
 */
async function runSetup({ workingDir, packageRoot, forceOverwrite = false }) {
  const TOTAL_STEPS = 3;

  // Display header
  showHeader(AWOS_ASCII, AWOS_SUBTITLE);

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
  });
  clearLine();

  // Step 3: Installing components
  showStep(
    'Installing Components',
    'Copying commands, templates, and agents',
    3,
    TOTAL_STEPS
  );
  const fileStatistics = await executeCopyOperations({
    packageRoot,
    targetDir: workingDir,
    copyOperations,
    forceOverwrite,
  });

  // Display summary with combined statistics
  const statistics = { ...directoryStatistics, ...fileStatistics };
  showSummary(statistics, { forceOverwrite });
}

module.exports = { runSetup };
