'use strict';

// Public API shape for an order. Keep this the single place that decides
// which order fields leave the service.

function serializeOrder(order) {
  return {
    id: order.id,
    status: order.status,
    customerEmail: order.customerEmail,
    items: order.items.map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
    })),
    shippingAddress: order.shippingAddress,
    createdAt: order.createdAt,
  };
}

module.exports = { serializeOrder };
