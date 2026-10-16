#!/usr/bin/env node
'use strict';

const { load } = require('../../../packages/core/src/config');
const { createPortalServer } = require('../src/server');

const config = load();
const server = createPortalServer({
  readingsDir: config.readingsDir,
  invoicesDir: config.invoicesDir,
  portalApiKey: config.portalApiKey,
});

server.listen(config.portalPort, () => {
  console.log(`meterhub portal-api listening on :${config.portalPort}`);
});
