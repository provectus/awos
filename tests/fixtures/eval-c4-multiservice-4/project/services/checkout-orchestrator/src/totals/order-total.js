'use strict';

// The one place the order total is computed: the sum of the quote's line
// totals minus the sum of its discount lines. Integer arithmetic throughout.

const { computeDiscountTotal } = require('./discount-total');

function computeOrderTotal({ lines, discounts }) {
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return subtotal - computeDiscountTotal(discounts);
}

module.exports = { computeOrderTotal };
