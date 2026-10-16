'use strict';

function toAppliedView(payload) {
  return {
    quoteId: payload.quoteId,
    cartId: payload.cartId,
    currency: payload.currency,
    discounts: payload.discounts.map((discount) => ({
      code: discount.code,
      label: discount.label,
      amount: discount.amount,
    })),
    promotionIds: payload.promotionIds,
  };
}

module.exports = { toAppliedView };
