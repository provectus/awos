/**
 * Configuration for AWOS setup process
 * Defines directories to create and file copy operations
 * Separates core AWOS files from agent-specific files
 */

/**
 * List of supported AI agents
 * Add new agents here to enable support in the installer
 */
const SUPPORTED_AGENTS = ['claude', 'copilot'];

/**
 * Core directories that are agent-agnostic
 * These are always created regardless of which agent is used
 */
const coreDirectories = [
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
 * Core file copy operations that are agent-agnostic
 * These files are always copied regardless of which agent is used
 */
const coreCopyOperations = [
  {
    source: 'commands',
    destination: '.awos/commands',
    patterns: ['*'],
    overwrite: true,
    description: 'AWOS command prompts',
  },
  {
    source: 'templates',
    destination: '.awos/templates',
    patterns: ['*'],
    overwrite: true,
    description: 'AWOS templates',
  },
  {
    source: 'scripts',
    destination: '.awos/scripts',
    patterns: ['*'],
    overwrite: true,
    description: 'AWOS scripts',
  },
  {
    source: 'subagents',
    destination: '.awos/subagents',
    patterns: ['*'],
    overwrite: true,
    description: 'AWOS subagents',
  },
];

/**
 * Agent-specific directory configurations
 * Each agent has its own hardcoded set of directories
 */
const agentDirectories = {
  claude: [
    {
      path: '.claude',
      description: 'Claude configuration directory',
    },
  ],
  copilot: [
    {
      path: '.github',
      description: 'GitHub configuration directory',
    },
    {
      path: '.github/prompts',
      description: 'GitHub Copilot custom instructions directory',
    },
  ],
};

/**
 * Agent-specific copy operation configurations
 * Each agent has its own hardcoded set of copy operations
 */
const agentCopyOperations = {
  claude: [
    {
      source: 'claude/commands',
      destination: '.claude/commands/awos',
      patterns: ['*'],
      overwrite: false,
      description: 'Claude Code commands',
    },
    {
      source: 'claude/agents',
      destination: '.claude/agents',
      patterns: ['*'],
      overwrite: false,
      description: 'Claude Code agents',
    },
  ],
  copilot: [
    {
      source: 'copilot/prompts',
      destination: '.github/prompts',
      patterns: ['*'],
      overwrite: false,
      description: 'GitHub Copilot custom instructions',
    },
  ],
};

/**
 * Get agent-specific directories
 * @param {string} agent - The AI agent to configure (e.g., 'claude')
 * @returns {Array} Array of agent-specific directory configurations
 */
function getAgentDirectories(agent) {
  return agentDirectories[agent] || [];
}

/**
 * Get agent-specific copy operations
 * @param {string} agent - The AI agent to configure (e.g., 'claude')
 * @returns {Array} Array of agent-specific copy operation configurations
 */
function getAgentCopyOperations(agent) {
  return agentCopyOperations[agent] || [];
}

/**
 * Get all directories to create during setup
 * Combines core and agent-specific directories
 * @param {string} agent - The AI agent to configure (e.g., 'claude')
 * @returns {Array} Array of all directory configurations
 */
function getDirectories(agent) {
  return [...coreDirectories, ...getAgentDirectories(agent)];
}

/**
 * Get all file copy operations to perform during setup
 * Combines core and agent-specific operations
 * @param {string} agent - The AI agent to configure (e.g., 'claude')
 * @returns {Array} Array of all copy operation configurations
 */
function getCopyOperations(agent) {
  return [...coreCopyOperations, ...getAgentCopyOperations(agent)];
}

module.exports = {
  SUPPORTED_AGENTS,
  getDirectories,
  getCopyOperations,
  // Export for potential future use
  coreDirectories,
  coreCopyOperations,
  agentDirectories,
  agentCopyOperations,
  getAgentDirectories,
  getAgentCopyOperations,
};
