'use strict';

const {
  requireString,
  requirePositiveInteger,
  optionalString,
} = require('../../../../packages/domain/src/validation/validators');
const {
  ValidationError,
} = require('../../../../packages/domain/src/validation/errors');

function validateAddLine(body) {
  if (!body) throw new ValidationError('request body required');
  return {
    sku: requireString(body.sku, 'sku'),
    variantId: optionalString(body.variantId, 'variantId'),
    quantity: requirePositiveInteger(body.quantity, 'quantity'),
  };
}

module.exports = { validateAddLine };
