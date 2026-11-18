'use strict';

// The currencies Atlas trades in. `minorUnits` is the exponent of the
// currency's minor unit: USD amounts are cents (2), JPY amounts are whole
// yen (0). Every money amount in the platform is an integer count of these
// minor units — floats never represent money.

const CURRENCIES = {
  USD: { minorUnits: 2, name: 'US dollar' },
  EUR: { minorUnits: 2, name: 'Euro' },
  GBP: { minorUnits: 2, name: 'Pound sterling' },
  CHF: { minorUnits: 2, name: 'Swiss franc' },
  JPY: { minorUnits: 0, name: 'Japanese yen' },
};

function isSupportedCurrency(code) {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code);
}

function minorUnits(code) {
  if (!isSupportedCurrency(code)) {
    throw new Error(`unsupported currency: ${code}`);
  }
  return CURRENCIES[code].minorUnits;
}

module.exports = { CURRENCIES, isSupportedCurrency, minorUnits };
