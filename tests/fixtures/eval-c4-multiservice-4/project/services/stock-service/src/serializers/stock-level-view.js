'use strict';

const {
  available,
} = require('../../../../packages/domain/src/models/stock-level');

function toStockLevelView(level) {
  return {
    sku: level.sku,
    onHand: level.onHand,
    reserved: level.reserved,
    available: available(level),
  };
}

module.exports = { toStockLevelView };
