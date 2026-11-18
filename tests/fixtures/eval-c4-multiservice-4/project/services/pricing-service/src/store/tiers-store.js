'use strict';

// Volume tiers, one record per SKU: quantity thresholds that override the
// unit price. Tier prices are in the base currency, like base prices.

const { createJsonFileStore } = require('./json-file');

function createTiersStore({ dir }) {
  if (!dir) throw new Error('createTiersStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'tiers' });

  function putTiers({ sku, tiers }) {
    if (!Array.isArray(tiers)) throw new Error('tiers must be an array');
    const sorted = tiers
      .map((tier) => ({ ...tier }))
      .sort((a, b) => a.minQuantity - b.minQuantity);
    return files.write(sku, { sku, tiers: sorted });
  }

  function getTiers(sku) {
    const record = files.read(sku);
    return record ? record.tiers : [];
  }

  return { putTiers, getTiers };
}

module.exports = { createTiersStore };
