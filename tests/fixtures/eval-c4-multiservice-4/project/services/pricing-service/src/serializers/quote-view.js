'use strict';

const { formatMoney } = require('../../../../packages/domain/src/money/format');

function toQuoteView(quote) {
  return {
    quoteId: quote.quoteId,
    cartId: quote.cartId,
    currency: quote.currency,
    lines: quote.lines.map((line) => ({
      ...line,
      display: formatMoney({
        amount: line.lineTotal,
        currency: quote.currency,
      }),
    })),
    discounts: quote.discounts,
  };
}

module.exports = { toQuoteView };
