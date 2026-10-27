'use strict';

// Registry of implemented promotion rule types. A promotion whose type has
// no entry here is skipped with a warning when quotes are processed.

const { applyPercentage } = require('./percentage');
const { applyFixedAmount } = require('./fixed-amount');

const RULES = {
  percentage: applyPercentage,
  'fixed-amount': applyFixedAmount,
};

function getRule(type) {
  return RULES[type] || null;
}

module.exports = { getRule, RULES };
