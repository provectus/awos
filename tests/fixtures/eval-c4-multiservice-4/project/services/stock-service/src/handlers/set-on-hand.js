'use strict';

// set-on-hand { sku, onHand }
//
// Administrative: sets a SKU's on-hand counter, preserving whatever is
// currently reserved. This is how receiving lands new stock.

function createSetOnHandHandler({ stockStore }) {
  function handle(command) {
    const { sku, onHand } = command.payload;
    const current = stockStore.get(sku);
    stockStore.put({
      sku,
      onHand,
      reserved: current ? current.reserved : 0,
    });
  }

  return { handle };
}

module.exports = { createSetOnHandHandler };
