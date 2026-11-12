'use strict';

const { createCart } = require('../../../../packages/domain/src/models/cart');
const { createJsonFileStore } = require('./json-file');

function createCartsStore({ dir }) {
  if (!dir) throw new Error('createCartsStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'cart' });

  function put(cart) {
    const record = createCart(cart);
    return files.write(record.cartId, record);
  }

  function get(cartId) {
    return files.read(cartId);
  }

  return { put, get };
}

module.exports = { createCartsStore };
