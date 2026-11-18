'use strict';

// Consumes stock.reserved events: the saga moves to capturing and the
// gateway is asked to capture the authorized amount.

const { advanceSaga } = require('../saga/checkout-saga');

function createStockReservedHandler({
  sagasStore,
  ordersStore,
  commandQueue,
  logger,
}) {
  function handle(event) {
    const { orderId } = event.payload;
    const saga = sagasStore.get(orderId);
    if (!saga) {
      logger.warn(`stock.reserved for unknown order ${orderId}; ignored`);
      return;
    }
    const order = ordersStore.get(orderId);
    sagasStore.put(advanceSaga(saga, 'capturing'));
    commandQueue.publish({
      target: 'payments-gateway',
      command: 'capture-payment',
      payload: {
        orderId,
        attemptId: saga.attemptId,
        amount: order.total,
        currency: order.currency,
      },
    });
  }

  return { handle };
}

module.exports = { createStockReservedHandler };
