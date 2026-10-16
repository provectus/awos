#!/usr/bin/env node
'use strict';

const { loadServiceConfig } = require('../src/config');
const { createStockService } = require('../src/service');

const config = loadServiceConfig();
const service = createStockService(config);
service.start({ pollMs: config.pollMs });
console.log(`stock-service polling every ${config.pollMs}ms`);

process.on('SIGINT', () => {
  service.stop();
  process.exit(0);
});
