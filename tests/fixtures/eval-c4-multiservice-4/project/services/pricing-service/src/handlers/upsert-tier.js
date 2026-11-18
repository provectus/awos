'use strict';

// upsert-tier { sku, tiers: [{ minQuantity, unitPrice }] }
//
// Administrative: writes a SKU's volume tiers into the rates store.

function createUpsertTierHandler({ tiersStore }) {
  function handle(command) {
    const { sku, tiers } = command.payload;
    tiersStore.putTiers({ sku, tiers });
  }

  return { handle };
}

module.exports = { createUpsertTierHandler };
