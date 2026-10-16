'use strict';

const path = require('node:path');

// Central configuration for all three services. Every value can be overridden
// via environment variables so deployments (and tests) can relocate state.

function load(env = process.env) {
  const dataDir = env.METERHUB_DATA_DIR || path.resolve(process.cwd(), 'var');
  return {
    dataDir,
    metersDir: env.METERHUB_METERS_DIR || path.join(dataDir, 'meters'),
    readingsDir: env.METERHUB_READINGS_DIR || path.join(dataDir, 'readings'),
    invoicesDir: env.METERHUB_INVOICES_DIR || path.join(dataDir, 'invoices'),
    queueDir: env.METERHUB_QUEUE_DIR || path.join(dataDir, 'queue'),
    ingestPort: Number(env.METERHUB_INGEST_PORT || 8081),
    portalPort: Number(env.METERHUB_PORTAL_PORT || 8082),
    deviceApiKey: env.METERHUB_DEVICE_API_KEY || 'dev-device-key',
    portalApiKey: env.METERHUB_PORTAL_API_KEY || 'dev-portal-key',
    enginePollMs: Number(env.METERHUB_ENGINE_POLL_MS || 250),
    // Outbound webhook for billing notifications. Reserved; no service reads
    // this yet.
    notifyWebhookUrl: env.METERHUB_NOTIFY_WEBHOOK_URL || '',
    // Legacy, unused since the rates service was retired and per-customer
    // rate tables were folded into the billing engine.
    ratesServiceUrl: env.METERHUB_RATES_SERVICE_URL || '',
  };
}

module.exports = { load };
