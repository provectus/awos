'use strict';

// READ-ONLY view over the pricing ledger the checkout orchestrator owns.
// The cart API reads ledger records to surface quoted prices; it never
// writes them.

const fs = require('node:fs');
const path = require('node:path');

function createLedgerView({ ledgerDir }) {
  if (!ledgerDir) throw new Error('createLedgerView requires ledgerDir');

  function getQuote(cartId) {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(ledgerDir, `ledger-${cartId}.json`), 'utf8')
      );
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  return { getQuote };
}

module.exports = { createLedgerView };
