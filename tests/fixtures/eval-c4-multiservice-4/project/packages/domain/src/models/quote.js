'use strict';

const {
  requireString,
  requireArray,
  requirePositiveInteger,
  requireInteger,
  requireNonNegativeInteger,
} = require('../validation/validators');
const { isSupportedCurrency } = require('../money/currencies');
const { ValidationError } = require('../validation/errors');

// A quote prices one cart at one point in time. Product lines carry integer
// unit prices and line totals in the quote currency; discount lines (one per
// applied promotion) carry a positive amount to subtract.

function createQuoteLine({ sku, quantity, unitPrice, lineTotal }) {
  return {
    sku: requireString(sku, 'sku'),
    quantity: requirePositiveInteger(quantity, 'quantity'),
    unitPrice: requireInteger(unitPrice, 'unitPrice'),
    lineTotal: requireInteger(lineTotal, 'lineTotal'),
  };
}

function createQuote({ quoteId, cartId, currency, lines, discounts = [] }) {
  if (!isSupportedCurrency(currency)) {
    throw new ValidationError(`quote currency unsupported: ${currency}`);
  }
  return {
    quoteId: requireString(quoteId, 'quoteId'),
    cartId: requireString(cartId, 'cartId'),
    currency,
    lines: requireArray(lines, 'lines').map((line) => createQuoteLine(line)),
    discounts: requireArray(discounts, 'discounts').map((d) => ({
      promotionId: requireString(d.promotionId, 'discount.promotionId'),
      code: requireString(d.code, 'discount.code'),
      label: requireString(d.label, 'discount.label'),
      amount: requireNonNegativeInteger(d.amount, 'discount.amount'),
    })),
  };
}

module.exports = { createQuote, createQuoteLine };
