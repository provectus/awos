'use strict';

const {
  requireString,
  optionalString,
} = require('../../../../packages/domain/src/validation/validators');
const {
  ValidationError,
} = require('../../../../packages/domain/src/validation/errors');

function validateProductPayload(body) {
  if (!body) throw new ValidationError('request body required');
  return {
    sku: requireString(body.sku, 'sku'),
    name: requireString(body.name, 'name'),
    description: optionalString(body.description, 'description'),
  };
}

module.exports = { validateProductPayload };
