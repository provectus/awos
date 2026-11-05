'use strict';

const path = require('node:path');

// Central configuration for both services. Every value can be overridden via
// environment variables so deployments (and tests) can relocate state.

function load(env = process.env) {
  const dataDir = env.SHIPLOG_DATA_DIR || path.resolve(process.cwd(), 'var');
  return {
    dataDir,
    ordersDir: env.SHIPLOG_ORDERS_DIR || path.join(dataDir, 'orders'),
    trackingDir: env.SHIPLOG_TRACKING_DIR || path.join(dataDir, 'tracking'),
    queueDir: env.SHIPLOG_QUEUE_DIR || path.join(dataDir, 'queue'),
    gatewayPort: Number(env.SHIPLOG_GATEWAY_PORT || 8080),
    apiToken: env.SHIPLOG_API_TOKEN || 'dev-token',
    webhookSecret: env.SHIPLOG_WEBHOOK_SECRET || 'dev-webhook-secret',
    workerPollMs: Number(env.SHIPLOG_WORKER_POLL_MS || 250),
  };
}

module.exports = { load };
