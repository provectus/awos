'use strict';

// Consumes price.quoted events: applies the promotions on file to the quote
// and reports the result as promotion.applied. Usage is recorded for each
// promotion at the moment its discount lands on a quote.

const { eligiblePromotions } = require('../apply/eligibility');
const { stackPromotions } = require('../apply/stacker');

function createPriceQuotedHandler({ promosStore, usageStore, events, logger }) {
  function handle(event) {
    const quote = event.payload;
    const promotions = eligiblePromotions({
      promotions: promosStore.list(),
      logger,
    });
    const { discounts, appliedPromotionIds } = stackPromotions({
      promotions,
      quote,
    });

    for (const promotionId of appliedPromotionIds) {
      usageStore.increment(promotionId, quote.customerId);
    }

    events.promotionApplied({
      quoteId: quote.quoteId,
      cartId: quote.cartId,
      customerId: quote.customerId,
      currency: quote.currency,
      cartCurrency: quote.cartCurrency,
      lines: quote.lines,
      discounts,
      promotionIds: appliedPromotionIds,
    });
  }

  return { handle };
}

module.exports = { createPriceQuotedHandler };
