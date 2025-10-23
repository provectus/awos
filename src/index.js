/**
 * AWOS Application Entry Point
 * Minimal entry point that bootstraps the setup process
 * Single Responsibility: Application initialization and error handling
 */

const { runSetup } = require('./core/setup-orchestrator');
const { log } = require('./utils/logger');
const { SUPPORTED_AGENTS } = require('./config/setup-config');

/**
 * Main application entry point
 * Handles setup execution and error handling
 */
async function main() {
  const workingDir = process.cwd();
  const packageRoot = __dirname + '/..';

  // Parse command line arguments
  const forceOverwrite = process.argv.includes('--force-overwrite');
  const dryRun = process.argv.includes('--dry-run');

  // Parse and validate --agent flag
  const agentIndex = process.argv.indexOf('--agent');
  if (agentIndex === -1 || agentIndex === process.argv.length - 1) {
    console.error('');
    log('Error: --agent flag is required', 'error');
    log('Usage: npx @provectusinc/awos --agent <agent-name>', 'info');
    log('Example: npx @provectusinc/awos --agent claude', 'info');
    process.exit(1);
  }

  const agent = process.argv[agentIndex + 1];

  if (!SUPPORTED_AGENTS.includes(agent)) {
    console.error('');
    log(`Error: Unsupported agent "${agent}"`, 'error');
    log(`Supported agents: ${SUPPORTED_AGENTS.join(', ')}`, 'info');
    process.exit(1);
  }

  try {
    await runSetup({ workingDir, packageRoot, forceOverwrite, dryRun, agent });
  } catch (err) {
    console.error('');
    log(`Error during setup: ${err.message}`, 'error');
    console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { main };
