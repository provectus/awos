'use strict';

const { createAuthorizePaymentHandler } = require('./authorize-payment');
const { createCapturePaymentHandler } = require('./capture-payment');

function createHandlers(deps) {
  return {
    'authorize-payment': createAuthorizePaymentHandler(deps),
    'capture-payment': createCapturePaymentHandler(deps),
  };
}

module.exports = { createHandlers };
