'use strict';

const { createCheckoutHandler } = require('./checkout');
const { createPromotionAppliedHandler } = require('./promotion-applied');
const { createPaymentAuthorizedHandler } = require('./payment-authorized');
const { createPaymentDeclinedHandler } = require('./payment-declined');
const { createPaymentCapturedHandler } = require('./payment-captured');
const { createStockReservedHandler } = require('./stock-reserved');
const { createStockRejectedHandler } = require('./stock-rejected');
const { createStockReleasedHandler } = require('./stock-released');

function createHandlers(deps) {
  return {
    commands: {
      checkout: createCheckoutHandler(deps),
    },
    events: {
      'promotion.applied': createPromotionAppliedHandler(deps),
      'payment.authorized': createPaymentAuthorizedHandler(deps),
      'payment.declined': createPaymentDeclinedHandler(deps),
      'payment.captured': createPaymentCapturedHandler(deps),
      'stock.reserved': createStockReservedHandler(deps),
      'stock.rejected': createStockRejectedHandler(deps),
      'stock.released': createStockReleasedHandler(deps),
    },
  };
}

module.exports = { createHandlers };
