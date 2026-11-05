'use strict';

// Presents a usage counter for logs and diagnostics.

function toUsageView(record) {
  return {
    promotionId: record.promotionId,
    customerId: record.customerId,
    count: record.count,
  };
}

module.exports = { toUsageView };
