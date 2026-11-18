'use strict';

// Consumes promotion.applied events: records the finished quote in the
// pricing ledger, with the order total computed once, here.

const { computeOrderTotal } = require('../totals/order-total');

function createPromotionAppliedHandler({ ledgerStore }) {
  function handle(event) {
    const payload = event.payload;
    ledgerStore.putQuote({
      cartId: payload.cartId,
      quoteId: payload.quoteId,
      customerId: payload.customerId,
      currency: payload.currency,
      cartCurrency: payload.cartCurrency,
      lines: payload.lines,
      discounts: payload.discounts,
      promotionIds: payload.promotionIds,
      total: computeOrderTotal({
        lines: payload.lines,
        discounts: payload.discounts,
      }),
    });
  }

  return { handle };
}

module.exports = { createPromotionAppliedHandler };
