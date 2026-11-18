#!/usr/bin/env node
'use strict';

const { load } = require('../../../packages/shared/src/config');
const { createGatewayServer } = require('../src/server');

const config = load();
const server = createGatewayServer({
  ordersDir: config.ordersDir,
  queueDir: config.queueDir,
  apiToken: config.apiToken,
  webhookSecret: config.webhookSecret,
});

server.listen(config.gatewayPort, () => {
  console.log(`[gateway] listening on :${config.gatewayPort}`);
});
