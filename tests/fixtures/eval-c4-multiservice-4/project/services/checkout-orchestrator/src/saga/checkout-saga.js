'use strict';

// Saga record helpers: create a new saga for an order and advance it through
// legal transitions only.

const { canTransition } = require('./saga-state');
const { IllegalTransitionError } = require('../errors');
const { nowIso } = require('../../../../packages/messaging/src/clock');

function createSaga({ orderId, cartId, customerId, attemptId }) {
  return {
    orderId,
    cartId,
    customerId,
    attemptId,
    state: 'authorizing',
    startedAt: nowIso(),
  };
}

function advanceSaga(saga, to) {
  if (!canTransition(saga.state, to)) {
    throw new IllegalTransitionError(saga.state, to);
  }
  return { ...saga, state: to, updatedAt: nowIso() };
}

module.exports = { createSaga, advanceSaga };
