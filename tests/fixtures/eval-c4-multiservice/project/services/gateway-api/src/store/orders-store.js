'use strict';

// Order records live as one JSON file per order under var/orders/ (or any
// directory handed in by the caller). Writes go through a temp file + rename
// so a crash never leaves a half-written record.

const fs = require('node:fs');
const path = require('node:path');

function createOrdersStore({ dir }) {
  if (!dir) {
    throw new Error('createOrdersStore requires a dir');
  }
  fs.mkdirSync(dir, { recursive: true });

  const fileFor = (id) => path.join(dir, `${id}.json`);

  function save(order) {
    const target = fileFor(order.id);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(order, null, 2));
    fs.renameSync(tmp, target);
    return order;
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
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  return { save, get, list };
}

module.exports = { createOrdersStore };
