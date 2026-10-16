'use strict';

// Consumes stock.rejected events: the checkout declines. The payment
// authorization already on file is left to lapse (see saga/compensation.js).

const { declineCheckout } = require('../saga/compensation');

function createStockRejectedHandler({
  sagasStore,
  ordersStore,
  events,
  logger,
}) {
  function handle(event) {
    const { orderId, reason } = event.payload;
    const saga = sagasStore.get(orderId);
    if (!saga) {
      logger.warn(`stock.rejected for unknown order ${orderId}; ignored`);
      return;
    }
    declineCheckout({
      ordersStore,
      sagasStore,
      events,
      saga,
      reason: `stock_rejected:${reason}`,
    });
  }

  return { handle };
}

module.exports = { createStockRejectedHandler };
