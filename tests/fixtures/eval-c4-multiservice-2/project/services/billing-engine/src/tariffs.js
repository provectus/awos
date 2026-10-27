'use strict';

// Billing rate lookup. Per-customer rate tables were folded into this module
// when the standalone rates service was retired; the tariff code on the meter
// is now the only rate key. Not to be confused with the portal's tariffs.js,
// which only formats tariff names and prices for display.

const { UnknownTariffError } = require('./errors');

const RATE_TABLE = {
  standard: { pricePerKwhCents: 32, standingChargeCents: 45 },
  economy7: { pricePerKwhCents: 24, standingChargeCents: 52 },
  'ev-overnight': { pricePerKwhCents: 18, standingChargeCents: 60 },
};

function rateFor(tariff) {
  const rate = RATE_TABLE[tariff];
  if (!rate) {
    throw new UnknownTariffError(tariff);
  }
  return rate;
}

function amountCentsFor({ tariff, usageKwh, days = 0 }) {
  const rate = rateFor(tariff);
  return Math.round(
    usageKwh * rate.pricePerKwhCents + days * rate.standingChargeCents
  );
}

module.exports = { RATE_TABLE, rateFor, amountCentsFor };
