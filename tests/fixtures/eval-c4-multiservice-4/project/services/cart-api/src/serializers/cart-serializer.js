'use strict';

function toCartView(cart) {
  return {
    cartId: cart.cartId,
    customerId: cart.customerId,
    currency: cart.currency,
    status: cart.status,
    lines: cart.lines.map((line) => ({
      sku: line.sku,
      variantId: line.variantId,
      quantity: line.quantity,
    })),
  };
}

module.exports = { toCartView };
