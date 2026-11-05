'use strict';

// The decline path shared by every failure handler: mark the order and saga
// declined and announce it. Note on authorizations: a declined checkout
// whose payment was already authorized but never captured leaves the
// authorization to lapse at the simulated processor; there is no void call.

const { advanceSaga } = require('./checkout-saga');

function declineCheckout({ ordersStore, sagasStore, events, saga, reason }) {
  const declined = advanceSaga(saga, 'declined');
  sagasStore.put(declined);
  const order = ordersStore.setStatus(saga.orderId, 'declined');
  events.orderDeclined({
    orderId: order.orderId,
    cartId: order.cartId,
    customerId: order.customerId,
    reason,
  });
  return order;
}

module.exports = { declineCheckout };
