'use strict';

function toStockLevelView(level) {
  return {
    sku: level.sku,
    reserved: level.reserved,
  };
}

module.exports = { toStockLevelView };
