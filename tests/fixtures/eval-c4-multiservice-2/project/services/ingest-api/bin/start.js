#!/usr/bin/env node
'use strict';

const { load } = require('../../../packages/core/src/config');
const { createIngestServer } = require('../src/server');

const config = load();
const server = createIngestServer({
  metersDir: config.metersDir,
  queueDir: config.queueDir,
  deviceApiKey: config.deviceApiKey,
});

server.listen(config.ingestPort, () => {
  console.log(`meterhub ingest-api listening on :${config.ingestPort}`);
});
