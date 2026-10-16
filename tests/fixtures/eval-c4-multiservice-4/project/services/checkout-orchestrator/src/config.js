'use strict';

const { load } = require('../../../packages/messaging/src/config');

function loadServiceConfig(env = process.env) {
  const config = load(env);
  return {
    ordersDir: config.ordersDir,
    ledgerDir: config.ledgerDir,
    commandsDir: config.commandsDir,
    eventsDir: config.eventsDir,
    pollMs: config.orchestratorPollMs,
  };
}

module.exports = { loadServiceConfig };
