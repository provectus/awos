'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readingsInWindow,
  meterUsageKwh,
  computeCycleUsage,
} = require('../services/billing-engine/src/cycles');
const {
  rateFor,
  amountCentsFor,
} = require('../services/billing-engine/src/tariffs');
const { UnknownTariffError } = require('../services/billing-engine/src/errors');

const WINDOW = {
  periodStart: '2026-10-01T00:00:00.000Z',
  periodEnd: '2026-10-31T23:59:59.000Z',
};

function r(value, readAt) {
  return { kind: 'reading', meterId: 'mtr_1', value, readAt };
}

test('cycles: readingsInWindow filters to the period and sorts by readAt', () => {
  const out = readingsInWindow(
    [
      r(1030, '2026-10-20T00:00:00.000Z'),
      r(900, '2026-09-15T00:00:00.000Z'),
      r(1000, '2026-10-01T00:00:00.000Z'),
    ],
    WINDOW
  );
  assert.equal(
    out.length,
    2,
    'readings outside the billing window must be excluded'
  );
  assert.equal(
    out[0].value,
    1000,
    'readings inside the window must come back sorted by readAt ascending'
  );
});

test('cycles: meterUsageKwh is last register minus first register in the window', () => {
  const usage = meterUsageKwh(
    [
      r(1000, '2026-10-01T00:00:00.000Z'),
      r(1020, '2026-10-10T00:00:00.000Z'),
      r(1050, '2026-10-30T00:00:00.000Z'),
    ],
    WINDOW
  );
  assert.equal(
    usage,
    50,
    'usage must be computed by differencing cumulative registers, not summing values'
  );
});

test('cycles: a meter with fewer than two readings in the window contributes zero', () => {
  assert.equal(
    meterUsageKwh([r(1000, '2026-10-01T00:00:00.000Z')], WINDOW),
    0,
    'one reading gives no delta, so the meter must contribute zero usage'
  );
});

test('cycles: computeCycleUsage sums usage across a customer`s meters', () => {
  const usage = computeCycleUsage({
    readingsByMeter: {
      mtr_1: [
        r(1000, '2026-10-01T00:00:00.000Z'),
        r(1040, '2026-10-30T00:00:00.000Z'),
      ],
      mtr_2: [
        {
          kind: 'reading',
          meterId: 'mtr_2',
          value: 10,
          readAt: '2026-10-02T00:00:00.000Z',
        },
        {
          kind: 'reading',
          meterId: 'mtr_2',
          value: 25,
          readAt: '2026-10-29T00:00:00.000Z',
        },
      ],
    },
    ...WINDOW,
  });
  assert.equal(
    usage.totalKwh,
    55,
    'total cycle usage must be the sum of per-meter usage'
  );
  assert.equal(
    usage.perMeter.length,
    2,
    'the per-meter breakdown must list every meter that was considered'
  );
});

test('tariffs: rate lookup prices usage and rejects unknown tariff codes', () => {
  assert.equal(
    rateFor('economy7').pricePerKwhCents,
    24,
    'the economy7 rate table entry must price at 24 cents per kWh'
  );
  assert.equal(
    amountCentsFor({ tariff: 'standard', usageKwh: 10 }),
    320,
    'amountCentsFor must multiply usage by the tariff unit rate'
  );
  assert.throws(
    () => rateFor('gold'),
    UnknownTariffError,
    'an unknown tariff code must raise UnknownTariffError, not price at zero'
  );
});
