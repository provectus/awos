'use strict';

// reserve-stock { orderId, lines: [{ sku, quantity }] }
//
// All-or-nothing reservation guarded by the idempotency ledger. A
// redelivered reserve for an order the ledger already knows does NOT touch
// the counters again; it re-emits the recorded outcome so a consumer that
// missed the original event still hears it.

const { reservationId } = require('../../../../packages/messaging/src/ids');
const { checkAvailability } = require('../stock/availability');

function createReserveStockHandler({ stockStore, ledger, events }) {
  function handle(command) {
    const { orderId, lines } = command.payload;
    const key = `reserve:${orderId}`;

    const existing = ledger.find(orderId, key);
    if (existing) {
      replay(existing.outcome, orderId);
      return;
    }

    const availability = checkAvailability({ stockStore, lines });
    if (!availability.ok) {
      const outcome = {
        result: 'rejected',
        reason: 'insufficient_stock',
        shortLines: availability.shortLines,
      };
      ledger.record(orderId, key, outcome);
      replay(outcome, orderId);
      return;
    }

    for (const line of lines) {
      stockStore.adjustReserved(line.sku, line.quantity);
    }
    const outcome = {
      result: 'reserved',
      reservationId: reservationId(),
      lines,
    };
    ledger.record(orderId, key, outcome);
    replay(outcome, orderId);
  }

  function replay(outcome, orderId) {
    if (outcome.result === 'reserved') {
      events.reserved({
        orderId,
        reservationId: outcome.reservationId,
        lines: outcome.lines,
      });
    } else {
      events.rejected({
        orderId,
        reason: outcome.reason,
        shortLines: outcome.shortLines,
      });
    }
  }

  return { handle };
}

module.exports = { createReserveStockHandler };
