'use strict';

const {
  requireString,
  requireNonNegativeInteger,
} = require('../validation/validators');

// One discount line per applied promotion. `amount` is a positive integer in
// the quote currency's minor units, to be subtracted from the product lines.

function createDiscountLine({ promotionId, code, label, amount }) {
  return {
    promotionId: requireString(promotionId, 'promotionId'),
    code: requireString(code, 'code'),
    label: requireString(label, 'label'),
    amount: requireNonNegativeInteger(amount, 'amount'),
  };
}

module.exports = { createDiscountLine };
