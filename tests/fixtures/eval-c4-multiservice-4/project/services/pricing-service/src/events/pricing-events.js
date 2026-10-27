'use strict';

const SOURCE = 'pricing-service';

function createPricingEvents({ eventQueue }) {
  function priceQuoted({ quote, customerId, cartCurrency }) {
    return eventQueue.publish({
      source: SOURCE,
      event: 'price.quoted',
      payload: {
        quoteId: quote.quoteId,
        cartId: quote.cartId,
        customerId,
        currency: quote.currency,
        cartCurrency,
        lines: quote.lines,
      },
    });
  }

  return { priceQuoted };
}

module.exports = { createPricingEvents, SOURCE };
