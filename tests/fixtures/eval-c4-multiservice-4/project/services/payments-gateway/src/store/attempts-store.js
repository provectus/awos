'use strict';

// One record per payment attempt, keyed (orderId, attemptId): the current
// authorization state the capture handler validates against.

const { createJsonFileStore } = require('./json-file');

function createAttemptsStore({ dir }) {
  if (!dir) throw new Error('createAttemptsStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'attempt' });

  const keyFor = (orderId, attemptId) => `${orderId}-${attemptId}`;

  function get(orderId, attemptId) {
    return files.read(keyFor(orderId, attemptId));
  }

  function put(record) {
    return files.write(keyFor(record.orderId, record.attemptId), record);
  }

  return { get, put };
}

module.exports = { createAttemptsStore };
