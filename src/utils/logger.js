/**
 * Logger utility for AWOS setup
 * Handles all console output with proper formatting and styling
 */

const { style } = require('../config/constants');

const LINE_LENGTH = 70;

const LOG_TYPES = {
  success: { prefix: '✓', style: style.success },
  error: { prefix: '✗', style: style.error },
  info: { prefix: '•', style: style.dim },
  item: { prefix: '•', style: (text) => text },
};

/**
 * Log a message with specific styling
 * @param {string} message - The message to log
 * @param {string} type - The type of log (success, error, item, info)
 */
function log(message, type = 'item') {
  const { prefix, style: styleFn } = LOG_TYPES[type] || LOG_TYPES.item;
  console.log(`  ${styleFn(prefix)} ${styleFn(message)}`);
}

/**
 * Display a line in the terminal
 */
function showLine() {
  console.log('');
  console.log('─'.repeat(LINE_LENGTH));
}

/**
 * Display a step header in the setup process
 * @param {string} stepName - The name of the step
 * @param {string} stepDescription - The description of the step
 * @param {number} currentStep - The current step number
 * @param {number} totalSteps - The total number of steps
 */
function showStep(stepName, stepDescription, currentStep, totalSteps) {
  const stepNumber = `[${currentStep}/${totalSteps}]`;
  showLine();
  console.log(
    style.step(` ${stepNumber} ${stepName}`),
    style.dim(`- ${stepDescription}`)
  );
}

/**
 * Clear the current line in the terminal
 */
function clearLine() {
  process.stdout.write('\r' + ' '.repeat(LINE_LENGTH) + '\r');
}

/**
 * Display the AWOS header
 * @param {string} asciiArt - The ASCII art to display
 * @param {string} subtitle - The subtitle to display
 */
function showHeader(asciiArt, subtitle) {
  console.log(style.success(asciiArt));
  console.log(style.bold('  ' + subtitle));
}

/**
 * Display the setup summary
 * @param {Object} statistics - Statistics about the setup process
 * @param {Object} options - Options for the setup process
 * @param {boolean} options.dryRun - Whether this was a dry-run
 */
function showSummary(statistics, options) {
  // Handle both old and new property names for compatibility
  const directoriesCreated =
    statistics.directoriesCreated || statistics.created || 0;
  const filesCopied = statistics.filesCopied || statistics.copied || 0;
  const directoriesExisted =
    statistics.directoriesExisted || statistics.existing || 0;
  const filesSkipped = statistics.filesSkipped || statistics.skipped || 0;
  const migrationsApplied = statistics.migrations || 0;

  const summaryItems = [
    ['Directories created', directoriesCreated],
    ['Files installed', filesCopied],
    ['Existing items preserved', directoriesExisted + filesSkipped],
  ];

  // Add migrations if any were applied
  if (migrationsApplied > 0) {
    summaryItems.push(['Migrations applied', migrationsApplied]);
  }

  // Add VS Code settings status for Copilot
  if (statistics.settingsMerged) {
    summaryItems.push(['VS Code settings merged', 1]);
  } else if (statistics.settingsCreated) {
    summaryItems.push(['VS Code settings created', 1]);
  }

  showLine();

  if (options?.dryRun) {
    console.log(style.bold(style.warn(' 🔍 Dry-Run Complete')));
    console.log('');
    console.log(style.dim('  This was a preview. No files were modified.'));
    console.log('');
    console.group(style.bold('  What would happen:'));
  } else {
    console.log(style.bold(style.success(' ✨ AWOS Setup Complete!')));
    console.log('');
    console.group(style.bold('  Summary:'));
  }

  summaryItems.forEach(([label, value]) => {
    const prefix = options?.dryRun ? style.dim('○') : style.success('•');
    let labelText = label;

    if (options?.dryRun) {
      // Convert past tense to future conditional
      if (label === 'Directories created') {
        labelText = 'Would create directories';
      } else if (label === 'Files installed') {
        labelText = 'Would install files';
      } else if (label === 'Existing items preserved') {
        labelText = 'Would preserve existing items';
      } else if (label === 'Migrations applied') {
        labelText = 'Would apply migrations';
      } else if (label === 'VS Code settings merged') {
        labelText = 'Would merge VS Code settings';
      } else if (label === 'VS Code settings created') {
        labelText = 'Would create VS Code settings';
      } else {
        labelText = `Would ${label.toLowerCase()}`;
      }
    }

    console.log(`${prefix} ${labelText}: ${style.bold(value.toString())}`);
  });

  if (options?.dryRun) {
    console.log('');
    console.log(style.dim('  Run without --dry-run to apply these changes.'));
  }

  console.groupEnd();
  showLine();
}

module.exports = {
  log,
  showStep,
  clearLine,
  showHeader,
  showSummary,
};
