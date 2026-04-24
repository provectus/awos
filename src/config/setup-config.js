/**
 * Configuration for AWOS setup process
 * Defines directories to create and file copy operations
 */

/**
 * Directories to create during setup
 */
const directories = [
  {
    path: '.claude',
    description: 'Claude configuration directory',
  },
  {
    path: '.awos',
    description: 'awos configuration directory',
  },
  {
    path: 'context',
    description: 'A home for project documentation',
  },
  {
    path: 'context/product',
    description: 'Global product definitions',
  },
  {
    path: 'context/spec',
    description: 'A home for specifications',
  },
];

/**
 * File copy operations to perform during setup
 * Each operation defines what to copy from source to destination
 */
const copyOperations = [
  {
    source: 'commands',
    destination: '.awos/commands',
    patterns: ['*'],
    description: 'AWOS command prompts',
  },
  {
    source: 'templates',
    destination: '.awos/templates',
    patterns: ['*'],
    description: 'AWOS templates',
  },
  {
    source: 'scripts',
    destination: '.awos/scripts',
    patterns: ['*'],
    description: 'AWOS scripts',
  },
  {
    source: 'claude/commands',
    destination: '.claude/commands/awos',
    patterns: ['*'],
    description: 'Claude Code commands',
  },
];

module.exports = {
  directories,
  copyOperations,
};
