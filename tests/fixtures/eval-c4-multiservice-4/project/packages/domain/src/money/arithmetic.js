'use strict';

// Money arithmetic over integer minor units. Every helper validates that it
// is handed integers and matching currencies; a float amount anywhere is a
// bug and throws immediately.

const { assertMoney, assertSameCurrency } = require('../validation/guards');

function addMoney(a, b) {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

function subtractMoney(a, b) {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

function multiplyByQuantity(money, quantity) {
  assertMoney(money);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('multiplyByQuantity requires a non-negative integer');
  }
  return { amount: money.amount * quantity, currency: money.currency };
}

function sumAmounts(moneys, currency) {
  let total = 0;
  for (const money of moneys) {
    assertMoney(money);
    if (money.currency !== currency) {
      throw new Error(
        `sumAmounts: expected ${currency}, saw ${money.currency}`
      );
    }
    total += money.amount;
  }
  return { amount: total, currency };
}

module.exports = { addMoney, subtractMoney, multiplyByQuantity, sumAmounts };
