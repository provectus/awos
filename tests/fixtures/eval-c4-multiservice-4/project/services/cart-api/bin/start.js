#!/usr/bin/env node
'use strict';

const { loadServiceConfig } = require('../src/config');
const { createCartApi } = require('../src/server');

const config = loadServiceConfig();
const cart = createCartApi(config);
cart.server.listen(config.port, () => {
  console.log(`cart-api listening on :${config.port}`);
});

process.on('SIGINT', () => {
  cart.server.close(() => process.exit(0));
});
