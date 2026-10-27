'use strict';

// Builds the whole platform against one temp env: both HTTP services and the
// five background workers, all wired to the same queues and stores. settle()
// drains every consumer in rounds until a full round moves nothing, which is
// how tests let the asynchronous choreography finish deterministically.

const { createCatalogApi } = require('../../services/catalog-api/src/server');
const { createCartApi } = require('../../services/cart-api/src/server');
const {
  createPricingService,
} = require('../../services/pricing-service/src/service');
const {
  createPromotionsService,
} = require('../../services/promotions-service/src/service');
const {
  createCheckoutOrchestrator,
} = require('../../services/checkout-orchestrator/src/service');
const {
  createPaymentsGateway,
} = require('../../services/payments-gateway/src/service');
const {
  createStockService,
} = require('../../services/stock-service/src/service');

const silentLogger = { log() {}, warn() {}, error() {} };

function buildWorld(env, { apiKey = 'test-key' } = {}) {
  const catalog = createCatalogApi({
    catalogDir: env.catalogDir,
    eventsDir: env.eventsDir,
    apiKey,
    logger: silentLogger,
    logRequests: false,
  });
  const cart = createCartApi({
    cartsDir: env.cartsDir,
    ledgerDir: env.ledgerDir,
    ordersDir: env.ordersDir,
    commandsDir: env.commandsDir,
    apiKey,
    logger: silentLogger,
    logRequests: false,
  });
  const pricing = createPricingService({
    ratesDir: env.ratesDir,
    commandsDir: env.commandsDir,
    eventsDir: env.eventsDir,
    logger: silentLogger,
  });
  const promotions = createPromotionsService({
    promosDir: env.promosDir,
    commandsDir: env.commandsDir,
    eventsDir: env.eventsDir,
    logger: silentLogger,
  });
  const orchestrator = createCheckoutOrchestrator({
    ordersDir: env.ordersDir,
    ledgerDir: env.ledgerDir,
    commandsDir: env.commandsDir,
    eventsDir: env.eventsDir,
    logger: silentLogger,
  });
  const payments = createPaymentsGateway({
    paymentsDir: env.paymentsDir,
    commandsDir: env.commandsDir,
    eventsDir: env.eventsDir,
    logger: silentLogger,
  });
  const stock = createStockService({
    stockDir: env.stockDir,
    commandsDir: env.commandsDir,
    eventsDir: env.eventsDir,
    logger: silentLogger,
  });

  async function settle({ maxRounds = 50 } = {}) {
    for (let round = 0; round < maxRounds; round += 1) {
      let moved = 0;
      moved += await pricing.drain();
      moved += await promotions.drain();
      moved += await orchestrator.drain();
      moved += await payments.drain();
      moved += await stock.drain();
      moved += await orchestrator.drain();
      moved += await catalog.projector.drain();
      if (moved === 0) return;
    }
    throw new Error('world did not settle within maxRounds');
  }

  return {
    catalog,
    cart,
    pricing,
    promotions,
    orchestrator,
    payments,
    stock,
    settle,
    apiKey,
  };
}

module.exports = { buildWorld, silentLogger };
