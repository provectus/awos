'use strict';

const SOURCE = 'checkout-orchestrator';

function createOrderEvents({ eventQueue }) {
  function orderConfirmed({ orderId, cartId, customerId, promotionIds }) {
    return eventQueue.publish({
      source: SOURCE,
      event: 'order.confirmed',
      payload: { orderId, cartId, customerId, promotionIds },
    });
  }

  function orderDeclined({ orderId, cartId, customerId, reason }) {
    return eventQueue.publish({
      source: SOURCE,
      event: 'order.declined',
      payload: { orderId, cartId, customerId, reason },
    });
  }

  return { orderConfirmed, orderDeclined };
}

module.exports = { createOrderEvents, SOURCE };
