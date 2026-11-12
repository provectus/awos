'use strict';

const SOURCE = 'payments-gateway';

function createPaymentEvents({ eventQueue }) {
  function authorized({ orderId, attemptId, amount, currency }) {
    return eventQueue.publish({
      source: SOURCE,
      event: 'payment.authorized',
      payload: { orderId, attemptId, amount, currency },
    });
  }

  function declined({ orderId, attemptId, amount, currency, code }) {
    return eventQueue.publish({
      source: SOURCE,
      event: 'payment.declined',
      payload: { orderId, attemptId, amount, currency, code },
    });
  }

  function captured({ orderId, attemptId, amount, currency }) {
    return eventQueue.publish({
      source: SOURCE,
      event: 'payment.captured',
      payload: { orderId, attemptId, amount, currency },
    });
  }

  return { authorized, declined, captured };
}

module.exports = { createPaymentEvents, SOURCE };
