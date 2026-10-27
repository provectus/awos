'use strict';

// Presents a ledger quote record to API clients. Totals come from the cart
// API's own totals module over the record's lines and discounts.

const { computeTotals } = require('../carts/line-totals');

function toQuoteView(record) {
  const totals = computeTotals({
    lines: record.lines,
    discounts: record.discounts,
  });
  return {
    quoteId: record.quoteId,
    cartId: record.cartId,
    currency: record.currency,
    lines: record.lines,
    discounts: record.discounts,
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    total: totals.total,
    pricedAt: record.pricedAt,
  };
}

module.exports = { toQuoteView };
