'use strict';

// Which promotions on file take part in a quote. Today a promotion is
// eligible when its rule type is implemented; the validity window and
// per-customer cap recorded on each promotion are carried on the rule
// records but are not consulted here.

const { getRule } = require('../rules');

function eligiblePromotions({ promotions, logger }) {
  const eligible = [];
  for (const promotion of promotions) {
    if (!getRule(promotion.type)) {
      logger.warn(
        `skipping promotion ${promotion.promotionId}: unimplemented type ${promotion.type}`
      );
      continue;
    }
    eligible.push(promotion);
  }
  return eligible;
}

module.exports = { eligiblePromotions };
