'use strict';

const {
  requireString,
  requirePositiveInteger,
  optionalString,
} = require('../validation/validators');

function createCartLine({ sku, variantId, quantity }) {
  return {
    sku: requireString(sku, 'sku'),
    variantId: optionalString(variantId, 'variantId') || null,
    quantity: requirePositiveInteger(quantity, 'quantity'),
  };
}

module.exports = { createCartLine };
