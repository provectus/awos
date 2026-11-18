'use strict';

const {
  requireString,
  requireArray,
  requireOneOf,
} = require('../validation/validators');
const { isSupportedCurrency } = require('../money/currencies');
const { ValidationError } = require('../validation/errors');
const { createCartLine } = require('./cart-line');

const CART_STATUSES = ['open', 'checking_out', 'closed'];

function createCart({ cartId, customerId, currency, lines = [], status }) {
  if (!isSupportedCurrency(currency)) {
    throw new ValidationError(`currency must be supported; saw ${currency}`);
  }
  return {
    cartId: requireString(cartId, 'cartId'),
    customerId: requireString(customerId, 'customerId'),
    currency,
    lines: requireArray(lines, 'lines').map((line) => createCartLine(line)),
    status: requireOneOf(status || 'open', CART_STATUSES, 'status'),
  };
}

module.exports = { createCart, CART_STATUSES };
