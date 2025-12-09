/**
 * Configuration for AWOS setup process
 * Defines directories to create and file copy operations
 */

/**
 * Directories to create during setup
 * tools: array of tool names this directory applies to ('claude', 'copilot', 'all')
 */
const directories = [
  {
    path: '.awos',
    description: 'AWOS configuration directory',
    tools: ['claude', 'copilot', 'all'],
  },
  {
    path: '.claude',
    description: 'Claude configuration directory',
    tools: ['claude', 'all'],
  },
  {
    path: '.github/agents',
    description: 'Copilot agents directory',
    tools: ['copilot', 'all'],
  },
  {
    path: '.github/prompts',
    description: 'Copilot prompts directory',
    tools: ['copilot', 'all'],
  },
  {
    path: '.vscode',
    description: 'VS Code configuration directory',
    tools: ['copilot', 'all'],
  },
  {
    path: 'context',
    description: 'A home for project documentation',
    tools: ['claude', 'copilot', 'all'],
  },
  {
    path: 'context/product',
    description: 'Global product definitions',
    tools: ['claude', 'copilot', 'all'],
  },
  {
    path: 'context/spec',
    description: 'A home for specifications',
    tools: ['claude', 'copilot', 'all'],
  },
];

/**
 * File copy operations to perform during setup
 * Each operation defines what to copy from source to destination
 * tools: array of tool names this operation applies to ('claude', 'copilot', 'all')
 */
const copyOperations = [
  // Shared AWOS core (always installed for references)
  {
    source: 'commands',
    destination: '.awos/commands',
    patterns: ['*'],
    overwrite: true,
    description: 'AWOS command prompts',
    tools: ['claude', 'copilot', 'all'],
  },
  {
    source: 'templates',
    destination: '.awos/templates',
    patterns: ['*'],
    overwrite: true,
    description: 'AWOS templates',
    tools: ['claude', 'copilot', 'all'],
  },
  {
    source: 'scripts',
    destination: '.awos/scripts',
    patterns: ['*'],
    overwrite: true,
    description: 'AWOS scripts',
    tools: ['claude', 'copilot', 'all'],
  },
  {
    source: 'subagents',
    destination: '.awos/subagents',
    patterns: ['*'],
    overwrite: true,
    description: 'AWOS subagents',
    tools: ['claude', 'copilot', 'all'],
  },
  // Claude Code specific
  {
    source: 'claude/commands',
    destination: '.claude/commands/awos',
    patterns: ['*'],
    overwrite: false,
    description: 'Claude Code commands',
    tools: ['claude', 'all'],
  },
  {
    source: 'claude/agents',
    destination: '.claude/agents',
    patterns: ['*'],
    overwrite: false,
    description: 'Claude Code agents',
    tools: ['claude', 'all'],
  },
  // Copilot specific
  {
    source: 'copilot/agents',
    destination: '.github/agents',
    patterns: ['*.agent.md'],
    overwrite: false,
    description: 'Copilot agents',
    tools: ['copilot', 'all'],
  },
  {
    source: 'copilot/prompts',
    destination: '.github/prompts',
    patterns: ['*.prompt.md'],
    overwrite: false,
    description: 'Copilot prompts',
    tools: ['copilot', 'all'],
  },
];

/**
 * Filter copy operations by selected tool
 * @param {Array} operations - Copy operations array
 * @param {string} tool - Selected tool ('claude', 'copilot', 'all')
 * @returns {Array} Filtered operations
 */
function filterOperationsByTool(operations, tool) {
  return operations.filter((op) => {
    if (!op.tools) return true; // Backward compatible
    return op.tools.includes(tool);
  });
}

/**
 * Filter directories by selected tool
 * @param {Array} dirs - Directories array
 * @param {string} tool - Selected tool ('claude', 'copilot', 'all')
 * @returns {Array} Filtered directories
 */
function filterDirectoriesByTool(dirs, tool) {
  return dirs.filter((dir) => {
    if (!dir.tools) return true; // Backward compatible
    return dir.tools.includes(tool);
  });
}

module.exports = {
  directories,
  copyOperations,
  filterOperationsByTool,
  filterDirectoriesByTool,
};
