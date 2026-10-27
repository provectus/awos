#!/usr/bin/env node
'use strict';

const { loadServiceConfig } = require('../src/config');
const { createCheckoutOrchestrator } = require('../src/service');

const config = loadServiceConfig();
const service = createCheckoutOrchestrator(config);
service.start({ pollMs: config.pollMs });
console.log(`checkout-orchestrator polling every ${config.pollMs}ms`);

process.on('SIGINT', () => {
  service.stop();
  process.exit(0);
});
