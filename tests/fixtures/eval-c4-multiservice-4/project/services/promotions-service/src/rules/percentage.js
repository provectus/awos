'use strict';

// Percentage promotion: params.bps basis points off the quote's product
// subtotal. The discount is computed on the sum of the product line totals
// and rounded half-even once.

const {
  divideRoundedHalfEven,
} = require('../../../../packages/domain/src/money/rounding');

function applyPercentage({ promotion, quote }) {
  const subtotal = quote.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const amount = divideRoundedHalfEven(subtotal * promotion.params.bps, 10000);
  if (amount <= 0) return null;
  return {
    promotionId: promotion.promotionId,
    code: promotion.code,
    label: `${promotion.params.bps / 100}% off`,
    amount,
  };
}

module.exports = { applyPercentage };
