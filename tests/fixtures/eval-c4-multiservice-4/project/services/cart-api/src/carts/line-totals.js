'use strict';

// Totals for a ledger quote record as the cart API presents them: product
// subtotal, discount total, and the resulting total, recomputed from the
// record's lines and discount lines.

function computeTotals({ lines, discounts }) {
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const discountTotal = discounts.reduce(
    (sum, discount) => sum + discount.amount,
    0
  );
  return { subtotal, discountTotal, total: subtotal - discountTotal };
}

module.exports = { computeTotals };
