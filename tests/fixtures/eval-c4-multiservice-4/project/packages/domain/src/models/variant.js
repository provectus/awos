'use strict';

const { requireString } = require('../validation/validators');

function createVariant({ variantId, sku, attributes }) {
  const record = {
    variantId: requireString(variantId, 'variantId'),
    sku: requireString(sku, 'sku'),
    attributes: {},
  };
  if (attributes !== undefined && attributes !== null) {
    if (typeof attributes !== 'object' || Array.isArray(attributes)) {
      throw new Error('attributes must be a plain object');
    }
    record.attributes = { ...attributes };
  }
  return record;
}

module.exports = { createVariant };
