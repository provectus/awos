'use strict';

// Picks the unit price for a quantity: the highest tier whose minQuantity
// the ordered quantity reaches, falling back to the base price.

function resolveUnitPrice({ basePrice, tiers, quantity }) {
  let unitPrice = basePrice;
  for (const tier of tiers) {
    if (quantity >= tier.minQuantity) {
      unitPrice = tier.unitPrice;
    }
  }
  return unitPrice;
}

module.exports = { resolveUnitPrice };
