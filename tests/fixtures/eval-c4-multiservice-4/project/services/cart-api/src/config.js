'use strict';

const { load } = require('../../../packages/messaging/src/config');

function loadServiceConfig(env = process.env) {
  const config = load(env);
  return {
    cartsDir: config.cartsDir,
    ledgerDir: config.ledgerDir,
    ordersDir: config.ordersDir,
    commandsDir: config.commandsDir,
    port: config.cartPort,
    apiKey: config.cartApiKey,
  };
}

module.exports = { loadServiceConfig };
