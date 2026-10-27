'use strict';

const {
  createDiscountLine,
} = require('../../../../packages/domain/src/models/discount-line');

// Normalizes a rule result into a quote discount line.

function toDiscountLine(result) {
  return createDiscountLine(result);
}

module.exports = { toDiscountLine };
