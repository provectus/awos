'use strict';

// The pricing ledger: the record of truth for what a cart's checkout costs.
// One record per cart, written only by the orchestrator. Downstream readers
// (the cart API's views) read these records; they never write them.

const { nowIso } = require('../../../../packages/messaging/src/clock');
const { createJsonFileStore } = require('./json-file');

function createLedgerStore({ dir }) {
  if (!dir) throw new Error('createLedgerStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'ledger' });

  function putQuote({
    cartId,
    quoteId,
    customerId,
    currency,
    cartCurrency,
    lines,
    discounts,
    promotionIds,
    total,
  }) {
    return files.write(cartId, {
      cartId,
      quoteId,
      customerId,
      currency,
      cartCurrency,
      lines,
      discounts,
      promotionIds,
      total,
      orderId: null,
      pricedAt: nowIso(),
    });
  }

  function get(cartId) {
    return files.read(cartId);
  }

  function attachOrder(cartId, orderId) {
    const record = files.read(cartId);
    if (!record) throw new Error(`no ledger record for cart ${cartId}`);
    return files.write(cartId, { ...record, orderId });
  }

  return { putQuote, get, attachOrder };
}

module.exports = { createLedgerStore };
