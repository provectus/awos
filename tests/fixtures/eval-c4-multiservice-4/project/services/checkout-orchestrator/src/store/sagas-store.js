'use strict';

// In-flight checkout saga state, one record per order. The saga record is
// what event handlers consult to know where a checkout stands and what was
// asked of whom.

const { createJsonFileStore } = require('./json-file');

function createSagasStore({ dir }) {
  if (!dir) throw new Error('createSagasStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'saga' });

  function put(saga) {
    return files.write(saga.orderId, saga);
  }

  function get(orderId) {
    return files.read(orderId);
  }

  return { put, get };
}

module.exports = { createSagasStore };
