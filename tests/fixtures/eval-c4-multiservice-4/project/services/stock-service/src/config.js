'use strict';

const { load } = require('../../../packages/messaging/src/config');

// The slice of platform configuration this service reads.

function loadServiceConfig(env = process.env) {
  const config = load(env);
  return {
    stockDir: config.stockDir,
    commandsDir: config.commandsDir,
    eventsDir: config.eventsDir,
    pollMs: config.stockPollMs,
  };
}

module.exports = { loadServiceConfig };
