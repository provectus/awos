'use strict';

const {
  createProduct,
} = require('../../../../packages/domain/src/models/product');
const { createJsonFileStore } = require('./json-file');

function createProductsStore({ dir }) {
  if (!dir) throw new Error('createProductsStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'product' });

  function put(product) {
    const record = createProduct(product);
    return files.write(record.sku, record);
  }

  function get(sku) {
    return files.read(sku);
  }

  function list() {
    return files.listKeys().map((sku) => files.read(sku));
  }

  return { put, get, list };
}

module.exports = { createProductsStore };
