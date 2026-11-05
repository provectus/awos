'use strict';

// Pure simulation of an authorization: decide, then describe the journal
// entry and attempt record. No IO here; the handler persists and emits.

const { decideAuthorization } = require('../rules/authorization-policy');

function simulateAuthorization({ orderId, attemptId, amount, currency }) {
  const decision = decideAuthorization({ amount, currency });
  if (decision.outcome === 'authorized') {
    return {
      decision,
      journalEntry: {
        orderId,
        attemptId,
        type: 'authorization',
        amount: decision.authorizedAmount,
        currency,
        code: null,
      },
      attempt: {
        orderId,
        attemptId,
        status: 'authorized',
        authorizedAmount: decision.authorizedAmount,
        currency,
      },
    };
  }
  return {
    decision,
    journalEntry: {
      orderId,
      attemptId,
      type: 'decline',
      amount,
      currency,
      code: decision.code,
    },
    attempt: {
      orderId,
      attemptId,
      status: 'declined',
      authorizedAmount: 0,
      currency,
    },
  };
}

module.exports = { simulateAuthorization };
