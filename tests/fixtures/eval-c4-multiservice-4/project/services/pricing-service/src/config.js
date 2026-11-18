'use strict';

const { load } = require('../../../packages/messaging/src/config');

function loadServiceConfig(env = process.env) {
  const config = load(env);
  return {
    ratesDir: config.ratesDir,
    commandsDir: config.commandsDir,
    eventsDir: config.eventsDir,
    pollMs: config.pricingPollMs,
  };
}

module.exports = { loadServiceConfig };
