'use strict';

const { assertMoney } = require('../validation/guards');

// A money value is { amount, currency } where amount is an integer count of
// the currency's minor units (cents, yen). Constructing one validates both.

function createMoney(amount, currency) {
  return assertMoney({ amount, currency });
}

function zeroMoney(currency) {
  return createMoney(0, currency);
}

module.exports = { createMoney, zeroMoney };
