'use strict';

// Order records, one per checkout. Owned and written exclusively by the
// orchestrator.

const { createOrder } = require('../../../../packages/domain/src/models/order');
const { createJsonFileStore } = require('./json-file');

function createOrdersStore({ dir }) {
  if (!dir) throw new Error('createOrdersStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'order' });

  function put(order) {
    const record = createOrder(order);
    return files.write(record.orderId, record);
  }

  function get(orderId) {
    return files.read(orderId);
  }

  function getByCartId(cartId) {
    for (const orderId of files.listKeys()) {
      const order = files.read(orderId);
      if (order.cartId === cartId) return order;
    }
    return null;
  }

  function setStatus(orderId, status) {
    const order = get(orderId);
    if (!order) throw new Error(`no order on file: ${orderId}`);
    return put({ ...order, status });
  }

  return { put, get, getByCartId, setStatus };
}

module.exports = { createOrdersStore };
