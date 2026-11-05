'use strict';

// Fixed-amount promotion: a flat params.amount off, valid only when the
// promotion's currency matches the quote currency; otherwise the promotion
// contributes nothing to this quote.

function applyFixedAmount({ promotion, quote }) {
  if (promotion.params.currency !== quote.currency) return null;
  const amount = promotion.params.amount;
  if (!Number.isInteger(amount) || amount <= 0) return null;
  return {
    promotionId: promotion.promotionId,
    code: promotion.code,
    label: `${amount} ${promotion.params.currency} off`,
    amount,
  };
}

module.exports = { applyFixedAmount };
