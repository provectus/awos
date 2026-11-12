'use strict';

// Presents an attempt record for logs and diagnostics.

function toAttemptView(attempt) {
  return {
    orderId: attempt.orderId,
    attemptId: attempt.attemptId,
    status: attempt.status,
    authorizedAmount: attempt.authorizedAmount,
    capturedAmount: attempt.capturedAmount ?? null,
    currency: attempt.currency,
  };
}

module.exports = { toAttemptView };
