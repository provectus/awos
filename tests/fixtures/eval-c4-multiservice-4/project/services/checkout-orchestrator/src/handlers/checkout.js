'use strict';

// checkout { cartId, customerId }
//
// Starts the checkout saga for a quoted cart: creates the pending order from
// the ledger record and asks the payments gateway to authorize the ledger
// total. A cart with no ledger record declines immediately.

const {
  orderId: newOrderId,
  attemptId: newAttemptId,
} = require('../../../../packages/messaging/src/ids');
const { createSaga } = require('../saga/checkout-saga');

function createCheckoutHandler({
  ledgerStore,
  ordersStore,
  sagasStore,
  commandQueue,
  events,
}) {
  function handle(command) {
    const { cartId, customerId } = command.payload;
    const ledger = ledgerStore.get(cartId);
    if (!ledger) {
      events.orderDeclined({
        orderId: null,
        cartId,
        customerId,
        reason: 'not_quoted',
      });
      return;
    }

    const orderId = newOrderId();
    const attemptId = newAttemptId();
    ordersStore.put({
      orderId,
      cartId,
      customerId,
      currency: ledger.currency,
      lines: ledger.lines,
      total: ledger.total,
      status: 'pending',
      promotionIds: ledger.promotionIds,
    });
    ledgerStore.attachOrder(cartId, orderId);
    sagasStore.put(createSaga({ orderId, cartId, customerId, attemptId }));

    commandQueue.publish({
      target: 'payments-gateway',
      command: 'authorize-payment',
      payload: {
        orderId,
        attemptId,
        amount: ledger.total,
        currency: ledger.currency,
      },
    });
  }

  return { handle };
}

module.exports = { createCheckoutHandler };
