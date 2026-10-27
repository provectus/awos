'use strict';

// Meter registry: one JSON file per meter under var/meters/ (or any directory
// handed in by the caller). Writes go through a temp file + rename so a crash
// never leaves a half-written record. This is the only store the ingest API
// owns; readings and invoices belong to the billing engine.

const fs = require('node:fs');
const path = require('node:path');

function createMetersStore({ dir }) {
  if (!dir) {
    throw new Error('createMetersStore requires a dir');
  }
  fs.mkdirSync(dir, { recursive: true });

  const fileFor = (id) => path.join(dir, `${id}.json`);

  function save(meter) {
    const target = fileFor(meter.id);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(meter, null, 2));
    fs.renameSync(tmp, target);
    return meter;
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
      .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')))
      .sort((a, b) => a.installedAt.localeCompare(b.installedAt));
  }

  return { save, get, list };
}

module.exports = { createMetersStore };
