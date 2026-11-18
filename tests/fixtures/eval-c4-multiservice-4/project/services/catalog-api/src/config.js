'use strict';

const { load } = require('../../../packages/messaging/src/config');

function loadServiceConfig(env = process.env) {
  const config = load(env);
  return {
    catalogDir: config.catalogDir,
    eventsDir: config.eventsDir,
    port: config.catalogPort,
    apiKey: config.catalogApiKey,
    projectorPollMs: config.projectorPollMs,
  };
}

module.exports = { loadServiceConfig };
