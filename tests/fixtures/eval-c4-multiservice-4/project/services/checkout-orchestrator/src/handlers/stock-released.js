'use strict';

// Consumes stock.released events. No saga path today reaches a release, so
// there is no state to update; the release is logged for the audit trail.

function createStockReleasedHandler({ logger }) {
  function handle(event) {
    const { orderId, lines } = event.payload;
    logger.log(
      `stock released for order ${orderId}: ${lines
        .map((line) => `${line.sku} x${line.quantity}`)
        .join(', ')}`
    );
  }

  return { handle };
}

module.exports = { createStockReleasedHandler };
