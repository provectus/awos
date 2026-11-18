'use strict';

// Read-only view over the billing engine's readings store directory. The
// portal never writes here and never calls the billing engine over HTTP (the
// engine has no HTTP surface): the shared filesystem IS the read path.

const fs = require('node:fs');
const path = require('node:path');

function openReadingsView({ dir }) {
  if (!dir) {
    throw new Error('openReadingsView requires the readings store dir');
  }

  function readAll() {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    return names
      .filter((name) => name.endsWith('.json'))
      .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
  }

  function readingsForCustomer(customerId) {
    return readAll()
      .filter((r) => r.kind === 'reading' && r.customerId === customerId)
      .sort((a, b) => a.readAt.localeCompare(b.readAt));
  }

  function readingsForMeter(meterId) {
    return readAll()
      .filter((r) => r.kind === 'reading' && r.meterId === meterId)
      .sort((a, b) => a.readAt.localeCompare(b.readAt));
  }

  return { readingsForCustomer, readingsForMeter };
}

module.exports = { openReadingsView };
