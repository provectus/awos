'use strict';

// Deterministic per-currency authorization bands, in minor units. The
// simulated processor authorizes amounts up to the soft ceiling. Above the
// hard ceiling nothing is authorized. The bands are data: the gateway's
// policy module decides what happens between them.

const BANDS = {
  USD: { softCeiling: 100000, hardCeiling: 500000 },
  EUR: { softCeiling: 80000, hardCeiling: 400000 },
  GBP: { softCeiling: 60000, hardCeiling: 300000 },
  CHF: { softCeiling: 90000, hardCeiling: 450000 },
  JPY: { softCeiling: 1000000, hardCeiling: 5000000 },
};

function bandsFor(currency) {
  const band = BANDS[currency];
  if (!band) {
    throw new Error(`no authorization bands configured for ${currency}`);
  }
  return band;
}

module.exports = { BANDS, bandsFor };
