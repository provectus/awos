'use strict';

const { load } = require('../../../packages/messaging/src/config');

function loadServiceConfig(env = process.env) {
  const config = load(env);
  return {
    promosDir: config.promosDir,
    commandsDir: config.commandsDir,
    eventsDir: config.eventsDir,
    pollMs: config.promotionsPollMs,
  };
}

module.exports = { loadServiceConfig };
