'use strict';

// Prices one cart line in the base currency: base price, volume tier
// override, integer multiplication by quantity. No rounding happens here —
// base prices are already integers in base minor units.

const {
  multiplyByQuantity,
} = require('../../../../packages/domain/src/money/arithmetic');
const { UnpricedSkuError } = require('../errors');
const { resolveUnitPrice } = require('./tier-resolver');

function createLinePricer({ ratesStore, tiersStore }) {
  function priceLine({ sku, quantity }) {
    const baseRecord = ratesStore.getBasePrice(sku);
    if (!baseRecord) throw new UnpricedSkuError(sku);
    const unitPrice = resolveUnitPrice({
      basePrice: baseRecord.unitPrice,
      tiers: tiersStore.getTiers(sku),
      quantity,
    });
    const lineTotal = multiplyByQuantity(unitPrice, quantity);
    return {
      sku,
      quantity,
      unitPrice: unitPrice.amount,
      lineTotal: lineTotal.amount,
    };
  }

  return { priceLine };
}

module.exports = { createLinePricer };
