'use strict';

// Availability check across a whole set of requested lines. Reservation is
// all-or-nothing: either every line fits in current availability or the
// request is rejected with the lines that fell short.

function checkAvailability({ stockStore, lines }) {
  const shortLines = [];
  for (const line of lines) {
    const availableUnits = stockStore.availableFor(line.sku);
    if (availableUnits < line.quantity) {
      shortLines.push({
        sku: line.sku,
        requested: line.quantity,
        available: availableUnits,
      });
    }
  }
  return { ok: shortLines.length === 0, shortLines };
}

module.exports = { checkAvailability };
