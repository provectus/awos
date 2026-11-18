'use strict';

// The currency conversion table: one record per target currency, stating
// how many micro-units of the target one base-currency unit buys. Rates are
// stored as integers (micro-units) so conversion math stays in integers:
// 1 base minor unit -> rateMicros / 1e6 target units at the base exponent.

const { createJsonFileStore } = require('./json-file');

const RATE_SCALE = 1000000;

function createConversionStore({ dir }) {
  if (!dir) throw new Error('createConversionStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'conversion' });

  function putRate({ currency, rateMicros }) {
    if (!Number.isInteger(rateMicros) || rateMicros <= 0) {
      throw new Error('rateMicros must be a positive integer');
    }
    return files.write(currency, { currency, rateMicros });
  }

  function getRate(currency) {
    return files.read(currency);
  }

  function listRates() {
    return files.listKeys().map((currency) => files.read(currency));
  }

  return { putRate, getRate, listRates, RATE_SCALE };
}

module.exports = { createConversionStore, RATE_SCALE };
