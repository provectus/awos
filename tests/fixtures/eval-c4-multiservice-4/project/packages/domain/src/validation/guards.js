'use strict';

// Money guards. These are deliberately strict: a fractional amount means
// someone did float arithmetic on money, and that must fail loudly at the
// first boundary it crosses, not round silently downstream.

const { ValidationError } = require('./errors');
const { isSupportedCurrency } = require('../money/currencies');

function assertMoney(money, field = 'money') {
  if (money === null || typeof money !== 'object') {
    throw new ValidationError(`${field} must be an object`);
  }
  if (!Number.isInteger(money.amount)) {
    throw new ValidationError(
      `${field}.amount must be an integer count of minor units`
    );
  }
  if (!isSupportedCurrency(money.currency)) {
    throw new ValidationError(
      `${field}.currency must be a supported currency code`
    );
  }
  return money;
}

function assertSameCurrency(a, b) {
  assertMoney(a, 'left operand');
  assertMoney(b, 'right operand');
  if (a.currency !== b.currency) {
    throw new ValidationError(
      `currency mismatch: ${a.currency} vs ${b.currency}`
    );
  }
}

module.exports = { assertMoney, assertSameCurrency };
