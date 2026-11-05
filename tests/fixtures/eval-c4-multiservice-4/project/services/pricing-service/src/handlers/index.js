'use strict';

const { createQuoteCartHandler } = require('./quote-cart');
const { createUpsertRateHandler } = require('./upsert-rate');
const { createUpsertTierHandler } = require('./upsert-tier');
const {
  createUpsertConversionRateHandler,
} = require('./upsert-conversion-rate');
const { createUpsertRoundingRuleHandler } = require('./upsert-rounding-rule');

function createHandlers(deps) {
  return {
    'quote-cart': createQuoteCartHandler(deps),
    'upsert-rate': createUpsertRateHandler(deps),
    'upsert-tier': createUpsertTierHandler(deps),
    'upsert-conversion-rate': createUpsertConversionRateHandler(deps),
    'upsert-rounding-rule': createUpsertRoundingRuleHandler(deps),
  };
}

module.exports = { createHandlers };
