'use strict';

// The cart API's only write path into the rest of the platform: publishing
// addressed commands onto the shared command queue.

const {
  createCommandQueue,
} = require('../../../../packages/messaging/src/queues/command-queue');

function createCommandClient({ commandsDir }) {
  const queue = createCommandQueue({ dir: commandsDir });

  function requestQuote({ cart }) {
    return queue.publish({
      target: 'pricing-service',
      command: 'quote-cart',
      payload: {
        cartId: cart.cartId,
        customerId: cart.customerId,
        currency: cart.currency,
        lines: cart.lines.map((line) => ({
          sku: line.sku,
          quantity: line.quantity,
        })),
      },
    });
  }

  function requestCheckout({ cart }) {
    return queue.publish({
      target: 'checkout-orchestrator',
      command: 'checkout',
      payload: { cartId: cart.cartId, customerId: cart.customerId },
    });
  }

  return { requestQuote, requestCheckout };
}

module.exports = { createCommandClient };
