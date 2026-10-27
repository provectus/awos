#!/usr/bin/env node
'use strict';

const { loadServiceConfig } = require('../src/config');
const { createCatalogApi } = require('../src/server');

const config = loadServiceConfig();
const catalog = createCatalogApi(config);
catalog.server.listen(config.port, () => {
  console.log(`catalog-api listening on :${config.port}`);
});
catalog.projector.start({ pollMs: config.projectorPollMs });

process.on('SIGINT', () => {
  catalog.projector.stop();
  catalog.server.close(() => process.exit(0));
});
