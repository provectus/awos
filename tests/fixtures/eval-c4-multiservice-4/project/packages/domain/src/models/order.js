'use strict';

const {
  requireString,
  requireArray,
  requireInteger,
  requireOneOf,
} = require('../validation/validators');
const { isSupportedCurrency } = require('../money/currencies');
const { ValidationError } = require('../validation/errors');

const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'partially_confirmed',
  'declined',
];

function createOrder({
  orderId,
  cartId,
  customerId,
  currency,
  lines,
  total,
  status,
  promotionIds = [],
}) {
  if (!isSupportedCurrency(currency)) {
    throw new ValidationError(`order currency unsupported: ${currency}`);
  }
  return {
    orderId: requireString(orderId, 'orderId'),
    cartId: requireString(cartId, 'cartId'),
    customerId: requireString(customerId, 'customerId'),
    currency,
    lines: requireArray(lines, 'lines').map((line) => ({ ...line })),
    total: requireInteger(total, 'total'),
    status: requireOneOf(status || 'pending', ORDER_STATUSES, 'status'),
    promotionIds: requireArray(promotionIds, 'promotionIds').slice(),
  };
}

module.exports = { createOrder, ORDER_STATUSES };
