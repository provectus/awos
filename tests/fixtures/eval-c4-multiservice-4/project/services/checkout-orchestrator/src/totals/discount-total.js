'use strict';

// The sum of a quote's discount lines, in integer minor units.

function computeDiscountTotal(discounts) {
  return discounts.reduce((sum, discount) => sum + discount.amount, 0);
}

module.exports = { computeDiscountTotal };
