'use strict';

const {
  assertNonEmptyString,
  assertNonNegativeNumber,
  assertIsoTimestamp,
} = require('../validation');
const { invoiceId } = require('../ids');
const { nowIso } = require('../clock');

function createInvoice(input = {}) {
  return {
    id: input.id || invoiceId(),
    customerId: assertNonEmptyString(input.customerId, 'invoice.customerId'),
    periodStart: assertIsoTimestamp(input.periodStart, 'invoice.periodStart'),
    periodEnd: assertIsoTimestamp(input.periodEnd, 'invoice.periodEnd'),
    usageKwh: assertNonNegativeNumber(input.usageKwh, 'invoice.usageKwh'),
    tariff: assertNonEmptyString(input.tariff, 'invoice.tariff'),
    amountCents: assertNonNegativeNumber(
      input.amountCents,
      'invoice.amountCents'
    ),
    issuedAt: nowIso(),
  };
}

module.exports = { createInvoice };
