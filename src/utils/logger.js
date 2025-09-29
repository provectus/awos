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
 * @param {boolean} options.forceOverwrite - Force overwrite all files regardless of config
 */
function showSummary(statistics, options) {
  const summaryItems = [
    ['Directories created', statistics.directoriesCreated],
    ['Files installed', statistics.filesCopied],
    [
      'Existing items preserved',
      statistics.directoriesExisted + statistics.filesSkipped,
    ],
  ];

  showLine();
  console.log(style.bold(style.success(' ✨ AWOS Setup Complete!')));
  console.log('');
  console.group(style.bold('  Summary:'));

  summaryItems.forEach(([label, value]) => {
    console.log(
      `${style.success('•')} ${label}: ${style.bold(value.toString())}`
    );
  });

  if (options?.forceOverwrite) {
    console.log('');
    console.group(`${style.error('⚠')} ${style.bold('Important:')}`);
    console.log(
      `The ${style.bold(
        style.error('--force-overwrite')
      )} flag overwrote existing files, including:`
    );
    console.log(
      `${style.bold(style.error('.claude/commands/awos'))} and ${style.bold(
        style.error('.claude/agents')
      )}.`
    );
    console.log(
      'If you had customizations within these files, please review and restore them.'
    );
    console.groupEnd();
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
