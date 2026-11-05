'use strict';

// Presents a ledger reservation entry for logs and diagnostics.

function toReservationView(orderId, outcome) {
  return {
    orderId,
    result: outcome.result,
    reservationId: outcome.reservationId || null,
    lines: (outcome.lines || []).map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
    })),
  };
}

module.exports = { toReservationView };
