'use strict';

// Builds a quote for a cart snapshot. Quotes are issued in the rates store's
// base currency: every line is priced from the base price table (volume
// tiers applied), and the quote carries the base currency code.

const { quoteId } = require('../../../../packages/messaging/src/ids');
const { createQuote } = require('../../../../packages/domain/src/models/quote');

function createQuoteBuilder({ ratesStore, linePricer }) {
  function buildQuote({ cartId, lines }) {
    const currency = ratesStore.getBaseCurrency();
    const pricedLines = lines.map((line) =>
      linePricer.priceLine({ sku: line.sku, quantity: line.quantity })
    );
    return createQuote({
      quoteId: quoteId(),
      cartId,
      currency,
      lines: pricedLines,
      discounts: [],
    });
  }

  return { buildQuote };
}

module.exports = { createQuoteBuilder };
