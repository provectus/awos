'use strict';

const path = require('node:path');

// Central configuration for all seven services. Every value can be
// overridden via environment variables so deployments (and tests) can
// relocate state.

function load(env = process.env) {
  const dataDir = env.ATLAS_DATA_DIR || path.resolve(process.cwd(), 'var');
  return {
    dataDir,
    catalogDir: env.ATLAS_CATALOG_DIR || path.join(dataDir, 'catalog'),
    ratesDir: env.ATLAS_RATES_DIR || path.join(dataDir, 'rates'),
    promosDir: env.ATLAS_PROMOS_DIR || path.join(dataDir, 'promos'),
    cartsDir: env.ATLAS_CARTS_DIR || path.join(dataDir, 'carts'),
    ordersDir: env.ATLAS_ORDERS_DIR || path.join(dataDir, 'orders'),
    ledgerDir: env.ATLAS_LEDGER_DIR || path.join(dataDir, 'ledger'),
    paymentsDir: env.ATLAS_PAYMENTS_DIR || path.join(dataDir, 'payments'),
    stockDir: env.ATLAS_STOCK_DIR || path.join(dataDir, 'stock'),
    commandsDir: env.ATLAS_COMMANDS_DIR || path.join(dataDir, 'commands'),
    eventsDir: env.ATLAS_EVENTS_DIR || path.join(dataDir, 'events'),
    catalogPort: Number(env.ATLAS_CATALOG_PORT || 8081),
    cartPort: Number(env.ATLAS_CART_PORT || 8082),
    catalogApiKey: env.ATLAS_CATALOG_API_KEY || 'dev-catalog-key',
    cartApiKey: env.ATLAS_CART_API_KEY || 'dev-cart-key',
    pricingPollMs: Number(env.ATLAS_PRICING_POLL_MS || 250),
    promotionsPollMs: Number(env.ATLAS_PROMOTIONS_POLL_MS || 250),
    orchestratorPollMs: Number(env.ATLAS_ORCHESTRATOR_POLL_MS || 250),
    paymentsPollMs: Number(env.ATLAS_PAYMENTS_POLL_MS || 250),
    stockPollMs: Number(env.ATLAS_STOCK_POLL_MS || 250),
    projectorPollMs: Number(env.ATLAS_PROJECTOR_POLL_MS || 250),
  };
}

module.exports = { load };
