#!/usr/bin/env node
'use strict';

const { loadServiceConfig } = require('../src/config');
const { createPromotionsService } = require('../src/service');

const config = loadServiceConfig();
const service = createPromotionsService(config);
service.start({ pollMs: config.pollMs });
console.log(`promotions-service polling every ${config.pollMs}ms`);

process.on('SIGINT', () => {
  service.stop();
  process.exit(0);
});
