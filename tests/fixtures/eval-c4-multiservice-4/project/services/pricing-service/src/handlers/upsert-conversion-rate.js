'use strict';

// upsert-conversion-rate { currency, rateMicros }
//
// Administrative: writes a conversion-table entry into the rates store.

function createUpsertConversionRateHandler({ conversionStore }) {
  function handle(command) {
    const { currency, rateMicros } = command.payload;
    conversionStore.putRate({ currency, rateMicros });
  }

  return { handle };
}

module.exports = { createUpsertConversionRateHandler };
