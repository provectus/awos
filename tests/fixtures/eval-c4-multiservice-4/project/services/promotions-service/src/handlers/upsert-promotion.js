'use strict';

// upsert-promotion { promotion }
//
// Administrative: validates the rule's type-specific parameters and writes
// it into the promotions store.

const { validateRuleParams } = require('../rules/rule-schema');

function createUpsertPromotionHandler({ promosStore }) {
  function handle(command) {
    const promotion = command.payload.promotion;
    validateRuleParams(promotion.type, promotion.params || {});
    promosStore.put(promotion);
  }

  return { handle };
}

module.exports = { createUpsertPromotionHandler };
