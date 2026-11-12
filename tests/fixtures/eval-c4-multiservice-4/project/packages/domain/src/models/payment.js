'use strict';

const {
  requireString,
  requireInteger,
  requireOneOf,
} = require('../validation/validators');

const JOURNAL_ENTRY_TYPES = ['authorization', 'capture', 'decline'];

// One journal entry per gateway action. `attemptId` identifies the payment
// attempt within an order; the (orderId, attemptId) pair is the identity of
// every payment interaction.

function createJournalEntry({
  orderId,
  attemptId,
  type,
  amount,
  currency,
  code,
}) {
  return {
    orderId: requireString(orderId, 'orderId'),
    attemptId: requireString(attemptId, 'attemptId'),
    type: requireOneOf(type, JOURNAL_ENTRY_TYPES, 'type'),
    amount: requireInteger(amount, 'amount'),
    currency: requireString(currency, 'currency'),
    code: code === undefined || code === null ? null : String(code),
  };
}

module.exports = { createJournalEntry, JOURNAL_ENTRY_TYPES };
