'use strict';

// Read-only view over the billing engine's invoices store directory. The
// portal never writes here; invoices are issued exclusively by the engine.

const fs = require('node:fs');
const path = require('node:path');

function openInvoicesView({ dir }) {
  if (!dir) {
    throw new Error('openInvoicesView requires the invoices store dir');
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
      .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')))
      .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  }

  function invoicesForCustomer(customerId) {
    return readAll().filter((invoice) => invoice.customerId === customerId);
  }

  function invoiceById(id) {
    return readAll().find((invoice) => invoice.id === id) || null;
  }

  return { invoicesForCustomer, invoiceById };
}

module.exports = { openInvoicesView };
