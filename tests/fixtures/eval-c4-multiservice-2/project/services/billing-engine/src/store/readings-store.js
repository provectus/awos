'use strict';

// Readings store: one JSON file per record under var/readings/. Owned by the
// billing engine; the portal opens read-only views on the same directory.
// Records carry a `kind` so the store can hold more than raw readings
// (e.g. billing-continuity metadata) without a second directory.

const fs = require('node:fs');
const path = require('node:path');

function createReadingsStore({ dir }) {
  if (!dir) {
    throw new Error('createReadingsStore requires a dir');
  }
  fs.mkdirSync(dir, { recursive: true });

  const fileFor = (id) => path.join(dir, `${id}.json`);

  function save(record) {
    if (!record || typeof record.id !== 'string') {
      throw new Error('readings store records require a string id');
    }
    const target = fileFor(record.id);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
    fs.renameSync(tmp, target);
    return record;
  }

  function get(id) {
    try {
      return JSON.parse(fs.readFileSync(fileFor(id), 'utf8'));
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

  function listForMeter(meterId) {
    return list()
      .filter((r) => r.kind === 'reading' && r.meterId === meterId)
      .sort((a, b) => a.readAt.localeCompare(b.readAt));
  }

  function listForCustomer(customerId) {
    return list()
      .filter((r) => r.kind === 'reading' && r.customerId === customerId)
      .sort((a, b) => a.readAt.localeCompare(b.readAt));
  }

  return { save, get, list, listForMeter, listForCustomer, dir };
}

module.exports = { createReadingsStore };
