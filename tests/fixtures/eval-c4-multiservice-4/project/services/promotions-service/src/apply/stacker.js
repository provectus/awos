'use strict';

// Applies the eligible promotions to a quote, producing one discount line
// per promotion that yields a positive discount. Promotions are applied in
// store listing order.

const { getRule } = require('../rules');
const { toDiscountLine } = require('./discount-line');

function stackPromotions({ promotions, quote }) {
  const discounts = [];
  const appliedPromotionIds = [];
  for (const promotion of promotions) {
    const rule = getRule(promotion.type);
    const result = rule({ promotion, quote });
    if (!result) continue;
    discounts.push(toDiscountLine(result));
    appliedPromotionIds.push(promotion.promotionId);
  }
  return { discounts, appliedPromotionIds };
}

module.exports = { stackPromotions };
