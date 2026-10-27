'use strict';

// Consumes payment.captured events: the saga completes and the order
// confirms.

const { advanceSaga } = require('../saga/checkout-saga');

function createPaymentCapturedHandler({
  sagasStore,
  ordersStore,
  events,
  logger,
}) {
  function handle(event) {
    const { orderId } = event.payload;
    const saga = sagasStore.get(orderId);
    if (!saga) {
      logger.warn(`payment.captured for unknown order ${orderId}; ignored`);
      return;
    }
    sagasStore.put(advanceSaga(saga, 'confirmed'));
    const order = ordersStore.setStatus(orderId, 'confirmed');
    events.orderConfirmed({
      orderId,
      cartId: order.cartId,
      customerId: order.customerId,
      promotionIds: order.promotionIds,
    });
  }

  return { handle };
}

module.exports = { createPaymentCapturedHandler };
