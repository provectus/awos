'use strict';

const { createHealthRoute } = require('./health');
const { createCartRoutes } = require('./carts');
const { createLineRoutes } = require('./lines');
const { createQuoteRoutes } = require('./quotes');
const { createCheckoutRoutes } = require('./checkout');

function buildRoutes(deps) {
  return [
    createHealthRoute(),
    ...createCartRoutes(deps),
    ...createLineRoutes(deps),
    ...createQuoteRoutes(deps),
    ...createCheckoutRoutes(deps),
  ];
}

module.exports = { buildRoutes };
