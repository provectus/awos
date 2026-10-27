'use strict';

// Applies the rounding rule on file for a currency. The only mode the
// platform implements is half-even; this module is the one place that maps
// a stored rule to the arithmetic that enforces it.

const {
  divideRoundedHalfEven,
} = require('../../../../packages/domain/src/money/rounding');

function createRoundingPolicy({ roundingRulesStore }) {
  function roundedDivide({ currency, numerator, denominator }) {
    const rule = roundingRulesStore.getRule(currency);
    if (rule.mode !== 'half-even') {
      throw new Error(`unsupported rounding mode on file: ${rule.mode}`);
    }
    return divideRoundedHalfEven(numerator, denominator);
  }

  return { roundedDivide };
}

module.exports = { createRoundingPolicy };
