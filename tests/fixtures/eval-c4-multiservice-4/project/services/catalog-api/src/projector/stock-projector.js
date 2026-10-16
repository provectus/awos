'use strict';

// Pure projection: how one stock event changes the read model. Reservations
// add to the reserved count; releases subtract. Rejections hold nothing, so
// they project to nothing.

function projectStockEvent({ event, stockReadModel }) {
  if (event.event === 'stock.reserved') {
    for (const line of event.payload.lines) {
      stockReadModel.adjustReserved(line.sku, line.quantity);
    }
    return true;
  }
  if (event.event === 'stock.released') {
    for (const line of event.payload.lines) {
      stockReadModel.adjustReserved(line.sku, -line.quantity);
    }
    return true;
  }
  return false;
}

module.exports = { projectStockEvent };
