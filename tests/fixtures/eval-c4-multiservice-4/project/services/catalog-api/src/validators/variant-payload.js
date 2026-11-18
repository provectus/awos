'use strict';

const {
  requireString,
} = require('../../../../packages/domain/src/validation/validators');
const {
  ValidationError,
} = require('../../../../packages/domain/src/validation/errors');

function validateVariantPayload(body) {
  if (!body) throw new ValidationError('request body required');
  return {
    variantId: requireString(body.variantId, 'variantId'),
    sku: requireString(body.sku, 'sku'),
    attributes: body.attributes,
  };
}

module.exports = { validateVariantPayload };
