/**
 * AWOS Application Entry Point
 * Minimal entry point that bootstraps the setup process
 * Single Responsibility: Application initialization and error handling
 */

const { runSetup } = require('./core/setup-orchestrator');
const { log } = require('./utils/logger');
const { createDefaultOverwritePrompt } = require('./utils/prompt');

/**
 * Main application entry point
 * Handles setup execution and error handling
 */
async function main() {
  const workingDir = process.cwd();
  const packageRoot = __dirname + '/..';

  // Parse command line arguments.
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const forceYes = argv.includes('--yes') || argv.includes('-y');
  const forceNo = argv.includes('--no');

  // The prompt fires only for copy operations marked `preserveOnUpdate`
  // (currently just .claude/commands/awos). In TTY mode the user gets an
  // explanation + file list + [y/N] prompt; otherwise we default to
  // preserve so unattended runs never clobber user customization.
  const promptForOverwrite = createDefaultOverwritePrompt({
    forceYes,
    forceNo,
    isTTY: Boolean(process.stdin.isTTY),
  });

  try {
    await runSetup({ workingDir, packageRoot, dryRun, promptForOverwrite });
  } catch (err) {
    console.error('');
    log(`Error during setup: ${err.message}`, 'error');
    console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { main };
