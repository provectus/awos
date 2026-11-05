'use strict';

// Display formatting for tariff names and prices. This module knows nothing
// about rate lookup or billing math — that lives in the billing engine's
// tariffs.js. Same filename, different job.

const TARIFF_LABELS = {
  standard: 'Standard variable',
  economy7: 'Economy 7',
  'ev-overnight': 'EV overnight saver',
};

function formatTariffName(tariff) {
  return TARIFF_LABELS[tariff] || tariff;
}

function formatAmount(amountCents) {
  const euros = (amountCents / 100).toFixed(2);
  return `€${euros}`;
}

function formatUsage(usageKwh) {
  return `${usageKwh.toFixed(1)} kWh`;
}

module.exports = { TARIFF_LABELS, formatTariffName, formatAmount, formatUsage };
