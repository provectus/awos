'use strict';

const { assertSameCurrency } = require('../validation/guards');

function compareMoney(a, b) {
  assertSameCurrency(a, b);
  if (a.amount < b.amount) return -1;
  if (a.amount > b.amount) return 1;
  return 0;
}

function equalMoney(a, b) {
  return compareMoney(a, b) === 0;
}

function minMoney(a, b) {
  return compareMoney(a, b) <= 0 ? a : b;
}

function maxMoney(a, b) {
  return compareMoney(a, b) >= 0 ? a : b;
}

module.exports = { compareMoney, equalMoney, minMoney, maxMoney };
