'use strict';

// Minimal JSON-per-record persistence used by this service's stores: atomic
// writes via rename, ENOENT reads as null.

const fs = require('node:fs');
const path = require('node:path');

function createJsonFileStore({ dir, prefix }) {
  fs.mkdirSync(dir, { recursive: true });

  const fileFor = (key) => path.join(dir, `${prefix}-${key}.json`);

  function read(key) {
    try {
      return JSON.parse(fs.readFileSync(fileFor(key), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  function write(key, record) {
    const target = fileFor(key);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
    fs.renameSync(tmp, target);
    return record;
  }

  function listKeys() {
    return fs
      .readdirSync(dir)
      .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith('.json'))
      .map((name) => name.slice(prefix.length + 1, -'.json'.length))
      .sort();
  }

  return { read, write, listKeys };
}

module.exports = { createJsonFileStore };
