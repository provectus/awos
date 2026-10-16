'use strict';

const { createReserveStockHandler } = require('./reserve-stock');
const { createReleaseStockHandler } = require('./release-stock');
const { createSetOnHandHandler } = require('./set-on-hand');

function createHandlers(deps) {
  return {
    'reserve-stock': createReserveStockHandler(deps),
    'release-stock': createReleaseStockHandler(deps),
    'set-on-hand': createSetOnHandHandler(deps),
  };
}

module.exports = { createHandlers };
