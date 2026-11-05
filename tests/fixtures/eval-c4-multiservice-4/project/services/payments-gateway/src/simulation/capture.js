'use strict';

// Pure simulation of a capture against an authorized attempt. The simulated
// processor captures what the platform instructs; making capture requests
// idempotent is the platform's job, not the processor's.

function simulateCapture({ attempt, amount }) {
  return {
    journalEntry: {
      orderId: attempt.orderId,
      attemptId: attempt.attemptId,
      type: 'capture',
      amount,
      currency: attempt.currency,
      code: null,
    },
    attempt: { ...attempt, status: 'captured', capturedAmount: amount },
  };
}

module.exports = { simulateCapture };
