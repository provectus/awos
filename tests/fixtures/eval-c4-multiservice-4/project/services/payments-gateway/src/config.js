'use strict';

const { load } = require('../../../packages/messaging/src/config');

function loadServiceConfig(env = process.env) {
  const config = load(env);
  return {
    paymentsDir: config.paymentsDir,
    commandsDir: config.commandsDir,
    eventsDir: config.eventsDir,
    pollMs: config.paymentsPollMs,
  };
}

module.exports = { loadServiceConfig };
