'use strict';

// Shared on-disk plumbing for both queues: atomic JSON writes and
// lexicographically ordered file names so a plain sort yields publish order.

const fs = require('node:fs');
const path = require('node:path');

function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function orderedName(prefix, seq, id) {
  const stamp = String(Date.now()).padStart(14, '0');
  const counter = String(seq).padStart(6, '0');
  return `${prefix}-${stamp}-${counter}-${id}.json`;
}

function listOrdered(dir, prefix) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith('.json'))
    .sort();
}

module.exports = { writeJsonAtomic, readJson, orderedName, listOrdered, path };
