'use strict';

// Consumes payment.declined events: the checkout declines.

const { declineCheckout } = require('../saga/compensation');

function createPaymentDeclinedHandler({
  sagasStore,
  ordersStore,
  events,
  logger,
}) {
  function handle(event) {
    const { orderId, code } = event.payload;
    const saga = sagasStore.get(orderId);
    if (!saga) {
      logger.warn(`payment.declined for unknown order ${orderId}; ignored`);
      return;
    }
    declineCheckout({
      ordersStore,
      sagasStore,
      events,
      saga,
      reason: `payment_declined:${code}`,
    });
  }

  return { handle };
}

module.exports = { createPaymentDeclinedHandler };
