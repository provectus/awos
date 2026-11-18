'use strict';

// Invoices store: one JSON file per invoice under var/invoices/. Owned by the
// billing engine; the portal opens a read-only view on the same directory.

const fs = require('node:fs');
const path = require('node:path');

function createInvoicesStore({ dir }) {
  if (!dir) {
    throw new Error('createInvoicesStore requires a dir');
  }
  fs.mkdirSync(dir, { recursive: true });

  const fileFor = (id) => path.join(dir, `${id}.json`);

  function save(invoice) {
    const target = fileFor(invoice.id);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(invoice, null, 2));
    fs.renameSync(tmp, target);
    return invoice;
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
      .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  }

  function listForCustomer(customerId) {
    return list().filter((invoice) => invoice.customerId === customerId);
  }

  return { save, get, list, listForCustomer, dir };
}

module.exports = { createInvoicesStore };
