'use strict';

const SOURCE = 'stock-service';

function createStockEvents({ eventQueue }) {
  function reserved({ orderId, reservationId, lines }) {
    return eventQueue.publish({
      source: SOURCE,
      event: 'stock.reserved',
      payload: { orderId, reservationId, lines },
    });
  }

  function rejected({ orderId, reason, shortLines }) {
    return eventQueue.publish({
      source: SOURCE,
      event: 'stock.rejected',
      payload: { orderId, reason, shortLines },
    });
  }

  function released({ orderId, lines }) {
    return eventQueue.publish({
      source: SOURCE,
      event: 'stock.released',
      payload: { orderId, lines },
    });
  }

  return { reserved, rejected, released };
}

module.exports = { createStockEvents, SOURCE };
