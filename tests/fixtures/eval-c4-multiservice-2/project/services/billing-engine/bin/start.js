#!/usr/bin/env node
'use strict';

const { load } = require('../../../packages/core/src/config');
const { createEngine } = require('../src/engine');

const config = load();
const engine = createEngine({
  queueDir: config.queueDir,
  readingsDir: config.readingsDir,
  invoicesDir: config.invoicesDir,
});

engine.start({ pollMs: config.enginePollMs });
console.log('meterhub billing-engine consuming from the shared queue');
