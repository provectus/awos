'use strict';

// Display formatting for logs and serializers. Formatting is the ONLY place
// a decimal point ever appears; the underlying amounts stay integers.

const { minorUnits } = require('./currencies');
const { assertMoney } = require('../validation/guards');

function formatMoney(money) {
  assertMoney(money);
  const exponent = minorUnits(money.currency);
  if (exponent === 0) return `${money.currency} ${money.amount}`;
  const sign = money.amount < 0 ? '-' : '';
  const abs = Math.abs(money.amount);
  const divisor = 10 ** exponent;
  const whole = Math.floor(abs / divisor);
  const fraction = String(abs % divisor).padStart(exponent, '0');
  return `${money.currency} ${sign}${whole}.${fraction}`;
}

module.exports = { formatMoney };
