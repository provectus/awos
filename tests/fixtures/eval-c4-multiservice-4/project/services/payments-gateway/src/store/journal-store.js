'use strict';

// The payments journal: an append-only list of entries per order. Every
// authorization, decline, and capture the simulated processor performs lands
// here, in order. The journal records what happened; it never decides.

const {
  createJournalEntry,
} = require('../../../../packages/domain/src/models/payment');
const { nowIso } = require('../../../../packages/messaging/src/clock');
const { createJsonFileStore } = require('./json-file');

function createJournalStore({ dir }) {
  if (!dir) throw new Error('createJournalStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'journal' });

  function append(entry) {
    const record = createJournalEntry(entry);
    const journal = files.read(record.orderId) || {
      orderId: record.orderId,
      entries: [],
    };
    journal.entries.push({ ...record, at: nowIso() });
    files.write(record.orderId, journal);
    return record;
  }

  function listForOrder(orderId) {
    const journal = files.read(orderId);
    return journal ? journal.entries : [];
  }

  function listByType(orderId, type) {
    return listForOrder(orderId).filter((entry) => entry.type === type);
  }

  return { append, listForOrder, listByType };
}

module.exports = { createJournalStore };
