'use strict';

// quote-cart { cartId, customerId, currency, lines: [{ sku, quantity }] }
//
// Prices the cart snapshot carried by the command and reports the quote as a
// price.quoted event. The cart's own currency rides along on the event as
// cartCurrency; the quote itself is issued in the rates store's base
// currency.

function createQuoteCartHandler({ quoteBuilder, events }) {
  function handle(command) {
    const { cartId, customerId, currency, lines } = command.payload;
    const quote = quoteBuilder.buildQuote({ cartId, lines });
    events.priceQuoted({ quote, customerId, cartCurrency: currency });
  }

  return { handle };
}

module.exports = { createQuoteCartHandler };
