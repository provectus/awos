'use strict';

// Consumes payment.authorized events: the saga moves to reserving and the
// stock service is asked to hold the order's lines.

const { advanceSaga } = require('../saga/checkout-saga');

function createPaymentAuthorizedHandler({
  sagasStore,
  ordersStore,
  commandQueue,
  logger,
}) {
  function handle(event) {
    const { orderId } = event.payload;
    const saga = sagasStore.get(orderId);
    if (!saga) {
      logger.warn(`payment.authorized for unknown order ${orderId}; ignored`);
      return;
    }
    const order = ordersStore.get(orderId);
    sagasStore.put(advanceSaga(saga, 'reserving'));
    commandQueue.publish({
      target: 'stock-service',
      command: 'reserve-stock',
      payload: {
        orderId,
        lines: order.lines.map((line) => ({
          sku: line.sku,
          quantity: line.quantity,
        })),
      },
    });
  }

  return { handle };
}

module.exports = { createPaymentAuthorizedHandler };
