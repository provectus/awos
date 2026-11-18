'use strict';

// Base prices, one record per SKU, always in the store's base currency. The
// base currency itself is a store-level record so every price in the store
// is guaranteed to agree on it.

const {
  assertMoney,
} = require('../../../../packages/domain/src/validation/guards');
const { createJsonFileStore } = require('./json-file');

const DEFAULT_BASE_CURRENCY = 'USD';

function createRatesStore({ dir }) {
  if (!dir) throw new Error('createRatesStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'rate' });
  const meta = createJsonFileStore({ dir, prefix: 'meta' });

  function getBaseCurrency() {
    const record = meta.read('base-currency');
    return record ? record.currency : DEFAULT_BASE_CURRENCY;
  }

  function setBaseCurrency(currency) {
    return meta.write('base-currency', { currency });
  }

  function putBasePrice({ sku, unitPrice }) {
    assertMoney(unitPrice, 'unitPrice');
    if (unitPrice.currency !== getBaseCurrency()) {
      throw new Error(
        `base prices must be in ${getBaseCurrency()}; saw ${unitPrice.currency}`
      );
    }
    return files.write(sku, { sku, unitPrice });
  }

  function getBasePrice(sku) {
    return files.read(sku);
  }

  function listSkus() {
    return files.listKeys();
  }

  return {
    getBaseCurrency,
    setBaseCurrency,
    putBasePrice,
    getBasePrice,
    listSkus,
  };
}

module.exports = { createRatesStore, DEFAULT_BASE_CURRENCY };
