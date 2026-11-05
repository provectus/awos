#!/usr/bin/env node
'use strict';

const { load } = require('../../../packages/shared/src/config');
const { createWorker } = require('../src/worker');

const config = load();
const worker = createWorker({
  queueDir: config.queueDir,
  trackingDir: config.trackingDir,
  pollMs: config.workerPollMs,
});

worker.start();
console.log(`[worker] consuming from ${config.queueDir}`);

process.on('SIGINT', () => {
  worker.stop();
  process.exit(0);
});
