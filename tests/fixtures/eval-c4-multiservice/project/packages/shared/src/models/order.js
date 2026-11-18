'use strict';

const {
  ValidationError,
  assertNonEmptyString,
  assertPositiveInteger,
} = require('../validation');
const { createAddress } = require('./address');
const { orderId } = require('../ids');
const { nowIso } = require('../clock');

const ORDER_STATUSES = ['pending', 'confirmed', 'fulfilled', 'cancelled'];

function createOrder(input = {}) {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ValidationError('order.items must be a non-empty array', 'items');
  }
  return {
    id: input.id || orderId(),
    customerEmail: assertNonEmptyString(
      input.customerEmail,
      'order.customerEmail'
    ),
    items: input.items.map(normalizeItem),
    shippingAddress: createAddress(input.shippingAddress),
    status: 'pending',
    createdAt: nowIso(),
  };
}

function normalizeItem(item, index) {
  return {
    sku: assertNonEmptyString(item?.sku, `order.items[${index}].sku`),
    quantity: assertPositiveInteger(
      item?.quantity,
      `order.items[${index}].quantity`
    ),
  };
}

module.exports = { ORDER_STATUSES, createOrder };
