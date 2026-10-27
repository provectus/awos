'use strict';

const { createPriceQuotedHandler } = require('./price-quoted');
const { createUpsertPromotionHandler } = require('./upsert-promotion');

function createHandlers(deps) {
  return {
    commands: {
      'upsert-promotion': createUpsertPromotionHandler(deps),
    },
    events: {
      'price.quoted': createPriceQuotedHandler(deps),
    },
  };
}

module.exports = { createHandlers };
