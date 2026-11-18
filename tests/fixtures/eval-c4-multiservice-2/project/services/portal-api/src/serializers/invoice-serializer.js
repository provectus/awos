'use strict';

const { formatTariffName, formatAmount, formatUsage } = require('../tariffs');

function serializeInvoice(invoice) {
  return {
    id: invoice.id,
    customerId: invoice.customerId,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    usageKwh: invoice.usageKwh,
    amountCents: invoice.amountCents,
    display: {
      tariff: formatTariffName(invoice.tariff),
      amount: formatAmount(invoice.amountCents),
      usage: formatUsage(invoice.usageKwh),
    },
  };
}

module.exports = { serializeInvoice };
