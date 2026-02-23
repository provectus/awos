/**
 * MCP Configurator Service
 * Handles configuration of MCP servers in .mcp.json
 * Single Responsibility: MCP server configuration management
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { log } = require('../utils/logger');
const { pathExists } = require('../utils/fs-utils');

const MCP_FILE = '.mcp.json';
const MCP_SERVER_NAME = 'awos-recruitment';
const MCP_SERVER_CONFIG = {
  type: 'http',
  url: 'http://localhost:8000/mcp',
};

/**
 * Configure the MCP server in .mcp.json
 * Handles three cases:
 * - File doesn't exist: creates it with the server entry
 * - File exists without the entry: adds the server entry
 * - File exists with the entry: skips (already configured)
 *
 * @param {Object} config - Configuration options
 * @param {string} config.workingDir - The working directory
 * @param {boolean} config.dryRun - Whether to run in dry-run mode
 * @returns {Promise<Object>} Statistics: { mcpConfigured: boolean }
 */
async function configureMcp({ workingDir, dryRun = false }) {
  const mcpPath = path.join(workingDir, MCP_FILE);
  const fileExists = await pathExists(mcpPath);

  let config = {};

  if (fileExists) {
    const content = await fsPromises.readFile(mcpPath, 'utf-8');
    config = JSON.parse(content);
  }

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  if (config.mcpServers[MCP_SERVER_NAME]) {
    log(`${MCP_FILE} already has ${MCP_SERVER_NAME} configured`, 'info');
    return { mcpConfigured: false };
  }

  config.mcpServers[MCP_SERVER_NAME] = MCP_SERVER_CONFIG;

  if (!dryRun) {
    await fsPromises.writeFile(mcpPath, JSON.stringify(config, null, 2) + '\n');

    if (fileExists) {
      log(`Added ${MCP_SERVER_NAME} to existing ${MCP_FILE}`, 'success');
    } else {
      log(`Created ${MCP_FILE} with ${MCP_SERVER_NAME}`, 'success');
    }
  }

  return { mcpConfigured: true };
}

module.exports = { configureMcp };
