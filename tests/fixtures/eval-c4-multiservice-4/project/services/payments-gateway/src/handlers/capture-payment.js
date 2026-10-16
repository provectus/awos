'use strict';

// capture-payment { orderId, attemptId, amount, currency }
//
// Captures against an authorization on file. The simulated processor
// performs every capture it is instructed to: deduplicating capture
// instructions is the platform's responsibility.

const { MissingAuthorizationError } = require('../errors');
const { simulateCapture } = require('../simulation/capture');

function createCapturePaymentHandler({ attemptsStore, journal, events }) {
  function handle(command) {
    const { orderId, attemptId, amount } = command.payload;

    const attempt = attemptsStore.get(orderId, attemptId);
    if (!attempt || attempt.authorizedAmount <= 0) {
      throw new MissingAuthorizationError(orderId, attemptId);
    }

    const result = simulateCapture({ attempt, amount });
    journal.append(result.journalEntry);
    attemptsStore.put(result.attempt);
    events.captured({
      orderId,
      attemptId,
      amount,
      currency: attempt.currency,
    });
  }

  return { handle };
}

module.exports = { createCapturePaymentHandler };
