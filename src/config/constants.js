/**
 * UI and display constants for AWOS setup
 */

const AWOS_ASCII = `
      ░███      ░██       ░██     ░██████       ░██████
     ░██░██     ░██       ░██    ░██   ░██     ░██   ░██
    ░██  ░██    ░██  ░██  ░██   ░██     ░██   ░██
   ░█████████   ░██ ░████ ░██   ░██     ░██    ░████████
   ░██    ░██   ░██░██ ░██░██   ░██     ░██           ░██
   ░██    ░██   ░████   ░████    ░██   ░██     ░██   ░██
   ░██    ░██   ░███     ░███     ░██████       ░██████
`;

const AWOS_SUBTITLE = 'Agentic Workflow Operating System for Coding Assistance';

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
};

/**
 * Styling utilities for formatted output
 */
const style = {
  success: (text) => `${COLORS.green}${text}${COLORS.reset}`,
  error: (text) => `${COLORS.red}${text}${COLORS.reset}`,
  bold: (text) => `${COLORS.bright}${text}${COLORS.reset}`,
  dim: (text) => `${COLORS.dim}${text}${COLORS.reset}`,
  step: (text) => `${COLORS.bright}${COLORS.blue}${text}${COLORS.reset}`,
};

module.exports = {
  AWOS_ASCII,
  AWOS_SUBTITLE,
  style,
};
