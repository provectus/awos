'use strict';

// Tracking records live as one JSON file per shipment under var/tracking/
// (or any directory handed in by the caller). This store is owned by the
// tracking worker; the gateway's order data lives in a separate store.

const fs = require('node:fs');
const path = require('node:path');

function createTrackingStore({ dir }) {
  if (!dir) {
    throw new Error('createTrackingStore requires a dir');
  }
  fs.mkdirSync(dir, { recursive: true });

  const fileFor = (shipmentId) => path.join(dir, `${shipmentId}.json`);

  function save(record) {
    const target = fileFor(record.shipmentId);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
    fs.renameSync(tmp, target);
    return record;
  }

  function get(shipmentId) {
    try {
      return JSON.parse(fs.readFileSync(fileFor(shipmentId), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  function list() {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
  }

  return { save, get, list };
}

module.exports = { createTrackingStore };
