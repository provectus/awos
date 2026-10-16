'use strict';

// Per-promotion, per-customer usage counters, persisted in the promotions
// store directory. The counter feeds the per-customer usage caps recorded on
// the promotion rules.

const { createJsonFileStore } = require('./json-file');

function createUsageStore({ dir }) {
  if (!dir) throw new Error('createUsageStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'usage' });

  const keyFor = (promotionId, customerId) => `${promotionId}-${customerId}`;

  function count(promotionId, customerId) {
    const record = files.read(keyFor(promotionId, customerId));
    return record ? record.count : 0;
  }

  function increment(promotionId, customerId) {
    const key = keyFor(promotionId, customerId);
    const record = files.read(key) || { promotionId, customerId, count: 0 };
    record.count += 1;
    files.write(key, record);
    return record.count;
  }

  return { count, increment };
}

module.exports = { createUsageStore };
