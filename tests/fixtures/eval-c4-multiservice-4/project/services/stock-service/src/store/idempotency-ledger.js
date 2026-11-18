'use strict';

// Per-order idempotency ledger: every stock mutation records a key before
// its effect is considered done, so a redelivered instruction finds the key
// and replays its recorded outcome instead of mutating twice.

const { createJsonFileStore } = require('./json-file');
const { nowIso } = require('../../../../packages/messaging/src/clock');

function createIdempotencyLedger({ dir }) {
  if (!dir) throw new Error('createIdempotencyLedger requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'ledger' });

  function loadLedger(orderId) {
    return files.read(orderId) || { orderId, entries: [] };
  }

  function find(orderId, key) {
    return (
      loadLedger(orderId).entries.find((entry) => entry.key === key) || null
    );
  }

  function record(orderId, key, outcome) {
    const ledger = loadLedger(orderId);
    if (ledger.entries.some((entry) => entry.key === key)) {
      throw new Error(`duplicate ledger key ${key} for order ${orderId}`);
    }
    ledger.entries.push({ key, outcome, recordedAt: nowIso() });
    files.write(orderId, ledger);
    return ledger;
  }

  return { find, record, loadLedger };
}

module.exports = { createIdempotencyLedger };
