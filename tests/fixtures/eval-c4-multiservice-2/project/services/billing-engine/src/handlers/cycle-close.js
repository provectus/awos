'use strict';

const {
  createInvoice,
} = require('../../../../packages/core/src/models/invoice');
const { computeCycleUsage } = require('../cycles');
const { amountCentsFor } = require('../tariffs');
const { HandlerError } = require('../errors');

// Closes a billing cycle for one customer: pulls their readings from the
// readings store, computes usage per meter across the window, prices it with
// the rate table, and writes one invoice to the invoices store.

function createCycleCloseHandler({ readingsStore, invoicesStore }) {
  return async function handleCycleClose(job) {
    const { customerId, periodStart, periodEnd, tariff } = job.payload || {};
    if (!customerId || !periodStart || !periodEnd) {
      throw new HandlerError(
        'cycle.close job requires customerId, periodStart and periodEnd',
        { retryable: false }
      );
    }

    const readings = readingsStore.listForCustomer(customerId);
    const readingsByMeter = {};
    for (const reading of readings) {
      (readingsByMeter[reading.meterId] ||= []).push(reading);
    }

    const usage = computeCycleUsage({
      readingsByMeter,
      periodStart,
      periodEnd,
    });
    const effectiveTariff = tariff || 'standard';
    const invoice = createInvoice({
      customerId,
      periodStart,
      periodEnd,
      usageKwh: usage.totalKwh,
      tariff: effectiveTariff,
      amountCents: amountCentsFor({
        tariff: effectiveTariff,
        usageKwh: usage.totalKwh,
      }),
    });
    invoice.perMeter = usage.perMeter;
    return invoicesStore.save(invoice);
  };
}

module.exports = { createCycleCloseHandler };
