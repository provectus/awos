'use strict';

// Presents a saga record for logs and diagnostics.

function toSagaView(saga) {
  return {
    orderId: saga.orderId,
    cartId: saga.cartId,
    state: saga.state,
    attemptId: saga.attemptId,
    startedAt: saga.startedAt,
    updatedAt: saga.updatedAt || null,
  };
}

module.exports = { toSagaView };
