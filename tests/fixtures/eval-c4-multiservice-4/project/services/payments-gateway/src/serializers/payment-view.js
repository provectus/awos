'use strict';

const { formatMoney } = require('../../../../packages/domain/src/money/format');

function toJournalView(entries) {
  return entries.map((entry) => ({
    type: entry.type,
    attemptId: entry.attemptId,
    amount: entry.amount,
    currency: entry.currency,
    display: formatMoney({ amount: entry.amount, currency: entry.currency }),
    code: entry.code,
    at: entry.at,
  }));
}

module.exports = { toJournalView };
