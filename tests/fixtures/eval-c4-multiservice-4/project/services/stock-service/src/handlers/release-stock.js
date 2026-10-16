'use strict';

// release-stock { orderId }
//
// Releases the reservation the ledger recorded for the order: every reserved
// line is returned to availability in full. Guarded by the idempotency
// ledger, so a redelivered release re-emits the recorded outcome without
// touching the counters again.

const { UnknownReservationError } = require('../errors');

function createReleaseStockHandler({ stockStore, ledger, events }) {
  function handle(command) {
    const { orderId } = command.payload;
    const key = `release:${orderId}`;

    const existing = ledger.find(orderId, key);
    if (existing) {
      events.released({ orderId, lines: existing.outcome.lines });
      return;
    }

    const reservation = ledger.find(orderId, `reserve:${orderId}`);
    if (!reservation || reservation.outcome.result !== 'reserved') {
      throw new UnknownReservationError(orderId);
    }

    const lines = reservation.outcome.lines;
    for (const line of lines) {
      stockStore.adjustReserved(line.sku, -line.quantity);
    }
    ledger.record(orderId, key, { result: 'released', lines });
    events.released({ orderId, lines });
  }

  return { handle };
}

module.exports = { createReleaseStockHandler };
