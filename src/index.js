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
async function main() {
  const workingDir = process.cwd();
  const packageRoot = __dirname + '/..';

  // Parse command line arguments
  const dryRun = process.argv.includes('--dry-run');

  try {
    await runSetup({ workingDir, packageRoot, dryRun });
  } catch (err) {
    console.error('');
    log(`Error during setup: ${err.message}`, 'error');
    console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { main };
