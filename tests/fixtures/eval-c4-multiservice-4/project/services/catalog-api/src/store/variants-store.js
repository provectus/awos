'use strict';

const {
  createVariant,
} = require('../../../../packages/domain/src/models/variant');
const { createJsonFileStore } = require('./json-file');

function createVariantsStore({ dir }) {
  if (!dir) throw new Error('createVariantsStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'variant' });

  function put(variant) {
    const record = createVariant(variant);
    return files.write(record.variantId, record);
  }

  function get(variantId) {
    return files.read(variantId);
  }

  function listForSku(sku) {
    return files
      .listKeys()
      .map((variantId) => files.read(variantId))
      .filter((variant) => variant.sku === sku);
  }

  return { put, get, listForSku };
}

module.exports = { createVariantsStore };
