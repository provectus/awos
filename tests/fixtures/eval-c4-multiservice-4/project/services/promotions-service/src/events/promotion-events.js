'use strict';

const SOURCE = 'promotions-service';

function createPromotionEvents({ eventQueue }) {
  function promotionApplied({
    quoteId,
    cartId,
    customerId,
    currency,
    cartCurrency,
    lines,
    discounts,
    promotionIds,
  }) {
    return eventQueue.publish({
      source: SOURCE,
      event: 'promotion.applied',
      payload: {
        quoteId,
        cartId,
        customerId,
        currency,
        cartCurrency,
        lines,
        discounts,
        promotionIds,
      },
    });
  }

  return { promotionApplied };
}

module.exports = { createPromotionEvents, SOURCE };
