#!/usr/bin/env node
'use strict';

const { loadServiceConfig } = require('../src/config');
const { createPaymentsGateway } = require('../src/service');

const config = loadServiceConfig();
const service = createPaymentsGateway(config);
service.start({ pollMs: config.pollMs });
console.log(`payments-gateway polling every ${config.pollMs}ms`);

process.on('SIGINT', () => {
  service.stop();
  process.exit(0);
});
