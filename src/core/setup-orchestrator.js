/**
 * Setup Orchestrator
 * Coordinates the entire AWOS setup process
 * Single Responsibility: Orchestration of setup workflow
 */

const { AWOS_ASCII, AWOS_SUBTITLE, style } = require('../config/constants');
const {
  directories,
  copyOperations,
  filterOperationsByTool,
  filterDirectoriesByTool,
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
const { mergeVSCodeSettings } = require('../services/settings-merger');
const { runMigrations } = require('../migrations/runner');
const { generatePrompts, generateAgents } = require('../copilot');

/**
 * Run the setup process
 * @param {Object} config - Setup configuration
 * @param {string} config.workingDir - The working directory where setup will be performed
 * @param {string} config.packageRoot - The root directory of the AWOS package
 * @param {boolean} config.dryRun - Run in dry-run mode (preview changes only)
 * @param {string} config.tool - Target tool ('claude', 'copilot', 'all')
 * @returns {Promise<void>}
 */
async function runSetup({ workingDir, packageRoot, dryRun = false   tool = 'claude',
}) {
  const TOTAL_STEPS = 4;

  // Filter directories and operations based on selected tool
  const filteredDirectories = filterDirectoriesByTool(directories, tool);
  const filteredOperations = filterOperationsByTool(copyOperations, tool);

  // Display header
  showHeader(AWOS_ASCII, AWOS_SUBTITLE);

  // Show mode notices
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
  log(`Target tool: ${style.dim(tool)}`, 'item');

  // Step 2: Creating directories
  showStep(
    'Creating Directories',
    'Setting up project structure',
    2,
    TOTAL_STEPS
  );
  const directoryStatistics = await createDirectories({
    baseDir: workingDir,
    directories: filteredDirectories,
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
    copyOperations: filteredOperations,
    dryRun,
  });

  // Merge VS Code settings for Copilot
  let settingsStatistics = { merged: false, created: false };
  let promptStatistics = { generated: 0, skipped: 0 };
  let agentStatistics = { generated: 0, skipped: 0 };
  if (tool === 'copilot' || tool === 'all') {
    settingsStatistics = await mergeVSCodeSettings({
      packageRoot,
      targetDir: workingDir,
      dryRun,
    });

    // Generate Copilot prompts with inlined command content
    promptStatistics = await generatePrompts({
      packageRoot,
      targetDir: workingDir,
      dryRun,
    });

    // Generate Copilot agents with inlined subagent content
    agentStatistics = await generateAgents({
      packageRoot,
      targetDir: workingDir,
      dryRun,
    });
  }

  // Display summary with combined statistics
  const statistics = {
    ...directoryStatistics,
    ...fileStatistics,
    migrations: migrationStatistics.applied,
    settingsMerged: settingsStatistics.merged,
    settingsCreated: settingsStatistics.created,
    promptsGenerated: promptStatistics.generated,
    agentsGenerated: agentStatistics.generated,
  };
  showSummary(statistics, { dryRun, tool });
}

module.exports = { runSetup };
