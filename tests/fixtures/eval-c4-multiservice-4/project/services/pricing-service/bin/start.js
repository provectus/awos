#!/usr/bin/env node
'use strict';

const { loadServiceConfig } = require('../src/config');
const { createPricingService } = require('../src/service');

const config = loadServiceConfig();
const service = createPricingService(config);
service.start({ pollMs: config.pollMs });
console.log(`pricing-service polling every ${config.pollMs}ms`);

process.on('SIGINT', () => {
  service.stop();
  process.exit(0);
});
