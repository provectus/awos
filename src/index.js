/**
 * AWOS Application Entry Point
 * Minimal entry point that bootstraps the setup process
 * Single Responsibility: Application initialization and error handling
 */

const { runSetup } = require('./core/setup-orchestrator');
const { log } = require('./utils/logger');

/**
 * Main application entry point
 * Handles setup execution and error handling
 */
const VALID_TOOLS = ['claude', 'copilot', 'all'];

async function main() {
  const workingDir = process.cwd();
  const packageRoot = __dirname + '/..';

  // Parse command line arguments
  const forceOverwrite = process.argv.includes('--force-overwrite');
  const dryRun = process.argv.includes('--dry-run');

  // Parse --tool <name> argument (supports: claude, copilot, all)
  const toolIndex = process.argv.indexOf('--tool');
  let tool = 'claude';

  if (toolIndex !== -1) {
    const nextArg = process.argv[toolIndex + 1];

    if (!nextArg || nextArg.startsWith('--')) {
      log(
        `Error: --tool requires a value. Supported: ${VALID_TOOLS.join(', ')}`,
        'error'
      );
      process.exit(1);
    }

    tool = nextArg;
  }

  // Validate tool
  if (!VALID_TOOLS.includes(tool)) {
    log(`Invalid tool: ${tool}. Supported: ${VALID_TOOLS.join(', ')}`, 'error');
    process.exit(1);
  }

  try {
    await runSetup({ workingDir, packageRoot, forceOverwrite, dryRun, tool });
  } catch (err) {
    console.error('');
    log(`Error during setup: ${err.message}`, 'error');
    console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { main };
