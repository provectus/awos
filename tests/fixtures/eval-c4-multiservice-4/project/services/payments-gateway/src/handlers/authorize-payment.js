'use strict';

// authorize-payment { orderId, attemptId, amount, currency }
//
// Runs the deterministic authorization decision, journals the result, and
// reports it as a payment event. A redelivered authorize for an attempt
// already on file re-emits the recorded outcome without journaling twice.

const { simulateAuthorization } = require('../simulation/authorization');

function createAuthorizePaymentHandler({ attemptsStore, journal, events }) {
  function handle(command) {
    const { orderId, attemptId, amount, currency } = command.payload;

    const existing = attemptsStore.get(orderId, attemptId);
    if (existing) {
      emitFor(existing, amount);
      return;
    }

    const result = simulateAuthorization({
      orderId,
      attemptId,
      amount,
      currency,
    });
    journal.append(result.journalEntry);
    attemptsStore.put(result.attempt);
    emitFor(result.attempt, amount, result.journalEntry.code);
  }

  function emitFor(attempt, requestedAmount, code = null) {
    if (attempt.status === 'declined') {
      events.declined({
        orderId: attempt.orderId,
        attemptId: attempt.attemptId,
        amount: requestedAmount,
        currency: attempt.currency,
        code,
      });
      return;
    }
    events.authorized({
      orderId: attempt.orderId,
      attemptId: attempt.attemptId,
      amount: attempt.authorizedAmount,
      currency: attempt.currency,
    });
  }

  return { handle };
}

module.exports = { createAuthorizePaymentHandler };
