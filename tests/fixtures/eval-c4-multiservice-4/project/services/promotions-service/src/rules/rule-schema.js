'use strict';

// Type-specific parameter validation for promotion rules, applied when a
// rule is written through the command surface.

const {
  ValidationError,
} = require('../../../../packages/domain/src/validation/errors');
const {
  isSupportedCurrency,
} = require('../../../../packages/domain/src/money/currencies');

function validateRuleParams(type, params) {
  if (type === 'percentage') {
    if (
      !Number.isInteger(params.bps) ||
      params.bps <= 0 ||
      params.bps > 10000
    ) {
      throw new ValidationError('percentage params.bps must be 1..10000');
    }
    return;
  }
  if (type === 'fixed-amount') {
    if (!Number.isInteger(params.amount) || params.amount <= 0) {
      throw new ValidationError(
        'fixed-amount params.amount must be a positive integer'
      );
    }
    if (!isSupportedCurrency(params.currency)) {
      throw new ValidationError(
        'fixed-amount params.currency must be supported'
      );
    }
    return;
  }
  if (type === 'buy-n-get-m') {
    if (!Number.isInteger(params.buyCount) || params.buyCount <= 0) {
      throw new ValidationError(
        'buy-n-get-m params.buyCount must be a positive integer'
      );
    }
    if (!Number.isInteger(params.getCount) || params.getCount <= 0) {
      throw new ValidationError(
        'buy-n-get-m params.getCount must be a positive integer'
      );
    }
    return;
  }
  throw new ValidationError(`unknown promotion type: ${type}`);
}

module.exports = { validateRuleParams };
