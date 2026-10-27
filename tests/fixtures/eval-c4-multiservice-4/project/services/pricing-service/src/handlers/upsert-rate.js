'use strict';

// upsert-rate { sku, unitPrice: { amount, currency } }
//
// Administrative: writes a base price into the rates store.

function createUpsertRateHandler({ ratesStore }) {
  function handle(command) {
    const { sku, unitPrice } = command.payload;
    ratesStore.putBasePrice({ sku, unitPrice });
  }

  return { handle };
}

module.exports = { createUpsertRateHandler };
