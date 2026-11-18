'use strict';

const { createHealthRoute } = require('./health');
const { createProductRoutes } = require('./products');
const { createVariantRoutes } = require('./variants');
const { createStockLevelRoutes } = require('./stock-levels');

function buildRoutes(deps) {
  return [
    createHealthRoute(),
    ...createProductRoutes(deps),
    ...createVariantRoutes(deps),
    ...createStockLevelRoutes(deps),
  ];
}

module.exports = { buildRoutes };
