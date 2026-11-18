'use strict';

const {
  requireString,
} = require('../../../../packages/domain/src/validation/validators');
const {
  ValidationError,
} = require('../../../../packages/domain/src/validation/errors');
const {
  isSupportedCurrency,
} = require('../../../../packages/domain/src/money/currencies');

function validateCreateCart(body) {
  if (!body) throw new ValidationError('request body required');
  const customerId = requireString(body.customerId, 'customerId');
  const currency = requireString(body.currency, 'currency');
  if (!isSupportedCurrency(currency)) {
    throw new ValidationError(`unsupported currency: ${currency}`);
  }
  return { customerId, currency };
}

module.exports = { validateCreateCart };
