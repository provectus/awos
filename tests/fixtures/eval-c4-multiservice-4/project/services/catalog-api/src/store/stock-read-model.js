'use strict';

// The catalog's stock-level READ MODEL: per-SKU reserved counts projected
// from stock events. This is derived state — the stock service's store is
// authoritative — so the catalog can answer availability questions without
// crossing a service boundary at read time.

const { createJsonFileStore } = require('./json-file');

function createStockReadModel({ dir }) {
  if (!dir) throw new Error('createStockReadModel requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'stocklevel' });

  function get(sku) {
    return files.read(sku) || { sku, reserved: 0 };
  }

  function adjustReserved(sku, delta) {
    const current = get(sku);
    return files.write(sku, { sku, reserved: current.reserved + delta });
  }

  return { get, adjustReserved };
}

module.exports = { createStockReadModel };
