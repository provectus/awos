'use strict';

// upsert-rounding-rule { currency, mode }
//
// Administrative: writes a per-currency rounding rule into the rates store.

function createUpsertRoundingRuleHandler({ roundingRulesStore }) {
  function handle(command) {
    const { currency, mode } = command.payload;
    roundingRulesStore.putRule({ currency, mode });
  }

  return { handle };
}

module.exports = { createUpsertRoundingRuleHandler };
