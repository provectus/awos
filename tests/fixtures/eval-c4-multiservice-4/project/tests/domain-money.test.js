'use strict';

// Money in Atlas is integer minor units plus a currency code. These tests
// pin the arithmetic helpers, the half-even rounding division, and the
// guard that floats never pass as money.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addMoney,
  subtractMoney,
  multiplyByQuantity,
  sumAmounts,
} = require('../packages/domain/src/money/arithmetic');
const {
  divideRoundedHalfEven,
} = require('../packages/domain/src/money/rounding');
const { minorUnits } = require('../packages/domain/src/money/currencies');
const { formatMoney } = require('../packages/domain/src/money/format');
const { createMoney } = require('../packages/domain/src/models/money');
const { compareMoney } = require('../packages/domain/src/money/compare');

test('money amounts must be integers: a float amount is rejected on construction', () => {
  assert.throws(
    () => createMoney(10.5, 'USD'),
    /integer/,
    'a fractional amount must be rejected as a float leaking into money'
  );
});

test('money arithmetic adds, subtracts, and multiplies integer minor units', () => {
  const a = createMoney(1050, 'USD');
  const b = createMoney(275, 'USD');
  assert.deepEqual(
    addMoney(a, b),
    { amount: 1325, currency: 'USD' },
    'addition must sum minor units in the shared currency'
  );
  assert.deepEqual(
    subtractMoney(a, b),
    { amount: 775, currency: 'USD' },
    'subtraction must subtract minor units in the shared currency'
  );
  assert.deepEqual(
    multiplyByQuantity(b, 3),
    { amount: 825, currency: 'USD' },
    'multiplying by a quantity must stay integer'
  );
});

test('mixed-currency arithmetic is refused', () => {
  assert.throws(
    () => addMoney(createMoney(100, 'USD'), createMoney(100, 'EUR')),
    /currency mismatch/,
    'adding USD to EUR must be a currency mismatch error'
  );
  assert.throws(
    () => sumAmounts([createMoney(100, 'EUR')], 'USD'),
    /expected USD/,
    'summing into the wrong currency must be refused'
  );
});

test('divideRoundedHalfEven rounds the exact half to the even neighbour', () => {
  assert.equal(
    divideRoundedHalfEven(25, 10),
    2,
    '2.5 must round to 2 (even), not up to 3'
  );
  assert.equal(
    divideRoundedHalfEven(35, 10),
    4,
    '3.5 must round to 4 (even), not down to 3'
  );
  assert.equal(divideRoundedHalfEven(15, 10), 2, '1.5 must round to 2 (even)');
  assert.equal(
    divideRoundedHalfEven(26, 10),
    3,
    '2.6 is past the half and must round up normally'
  );
  assert.equal(
    divideRoundedHalfEven(24, 10),
    2,
    '2.4 is short of the half and must round down normally'
  );
});

test('divideRoundedHalfEven handles negatives and rejects non-integers', () => {
  assert.equal(
    divideRoundedHalfEven(-25, 10),
    -2,
    '-2.5 must round to -2 (even magnitude)'
  );
  assert.throws(
    () => divideRoundedHalfEven(2.5, 10),
    /integer/,
    'non-integer operands must be rejected'
  );
  assert.throws(
    () => divideRoundedHalfEven(10, 0),
    /zero/,
    'division by zero must be rejected'
  );
});

test('currency minor units: USD has 2, JPY has 0', () => {
  assert.equal(minorUnits('USD'), 2, 'USD amounts are cents');
  assert.equal(minorUnits('JPY'), 0, 'JPY amounts are whole yen');
  assert.throws(
    () => minorUnits('XXX'),
    /unsupported/,
    'unknown currencies must be rejected'
  );
});

test('formatting is the only place a decimal point appears', () => {
  assert.equal(
    formatMoney(createMoney(123456, 'USD')),
    'USD 1234.56',
    'two-minor-unit currencies format with two decimals'
  );
  assert.equal(
    formatMoney(createMoney(641, 'JPY')),
    'JPY 641',
    'zero-minor-unit currencies format with no decimals'
  );
});

test('compareMoney orders amounts within one currency', () => {
  assert.equal(compareMoney(createMoney(1, 'USD'), createMoney(2, 'USD')), -1);
  assert.equal(compareMoney(createMoney(2, 'USD'), createMoney(2, 'USD')), 0);
  assert.equal(compareMoney(createMoney(3, 'USD'), createMoney(2, 'USD')), 1);
});
