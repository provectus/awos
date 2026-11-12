'use strict';

// The authoritative stock store: one record per SKU with onHand and
// reserved counters. Availability is always derived (onHand - reserved),
// never stored.

const {
  createStockLevel,
  available,
} = require('../../../../packages/domain/src/models/stock-level');
const { createJsonFileStore } = require('./json-file');

function createStockStore({ dir }) {
  if (!dir) throw new Error('createStockStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'sku' });

  function get(sku) {
    return files.read(sku);
  }

  function put(level) {
    const record = createStockLevel(level);
    return files.write(record.sku, record);
  }

  function adjustReserved(sku, delta) {
    const current = get(sku);
    if (!current) throw new Error(`no stock record for sku ${sku}`);
    return put({ ...current, reserved: current.reserved + delta });
  }

  function availableFor(sku) {
    const current = get(sku);
    return current ? available(current) : 0;
  }

  function list() {
    return files.listKeys().map((sku) => get(sku));
  }

  return { get, put, adjustReserved, availableFor, list };
}

module.exports = { createStockStore };
