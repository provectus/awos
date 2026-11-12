'use strict';

// The promotions store: one record per promotion rule, including its
// validity window, declared stacking priority, and per-customer usage cap.

const {
  createPromotion,
} = require('../../../../packages/domain/src/models/promotion');
const { createJsonFileStore } = require('./json-file');

function createPromosStore({ dir }) {
  if (!dir) throw new Error('createPromosStore requires a dir');
  const files = createJsonFileStore({ dir, prefix: 'promo' });

  function put(promotion) {
    const record = createPromotion(promotion);
    return files.write(record.promotionId, record);
  }

  function get(promotionId) {
    return files.read(promotionId);
  }

  function list() {
    return files.listKeys().map((id) => files.read(id));
  }

  return { put, get, list };
}

module.exports = { createPromosStore };
