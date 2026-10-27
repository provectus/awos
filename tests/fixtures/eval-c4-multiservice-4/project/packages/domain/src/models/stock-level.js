'use strict';

const {
  requireString,
  requireNonNegativeInteger,
} = require('../validation/validators');

// A stock level is two stored counters; availability is always derived,
// never stored, so the two writers (on-hand adjustments and reservations)
// cannot race each other into an inconsistent third number.

function createStockLevel({ sku, onHand, reserved = 0 }) {
  return {
    sku: requireString(sku, 'sku'),
    onHand: requireNonNegativeInteger(onHand, 'onHand'),
    reserved: requireNonNegativeInteger(reserved, 'reserved'),
  };
}

function available(stockLevel) {
  return stockLevel.onHand - stockLevel.reserved;
}

module.exports = { createStockLevel, available };
