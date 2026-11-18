'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createMeter } = require('../packages/core/src/models/meter');
const { createReading } = require('../packages/core/src/models/reading');
const { createInvoice } = require('../packages/core/src/models/invoice');
const { createCustomer } = require('../packages/core/src/models/customer');
const { ValidationError } = require('../packages/core/src/validation');

test('core models: createMeter defaults to an active meter on the standard tariff', () => {
  const meter = createMeter({ customerId: 'cus_1', serial: 'SM-100' });
  assert.equal(
    meter.status,
    'active',
    'a newly created meter must start in status active'
  );
  assert.equal(
    meter.tariff,
    'standard',
    'a meter created without a tariff must default to standard'
  );
  assert.match(
    meter.id,
    /^mtr_/,
    'generated meter ids must carry the mtr_ prefix'
  );
});

test('core models: createMeter rejects an unknown tariff code', () => {
  assert.throws(
    () =>
      createMeter({ customerId: 'cus_1', serial: 'SM-100', tariff: 'gold' }),
    ValidationError,
    'createMeter must reject tariff codes outside the known tariff list'
  );
});

test('core models: createReading keeps the cumulative register value and stamps kWh', () => {
  const reading = createReading({
    meterId: 'mtr_1',
    customerId: 'cus_1',
    value: 1042.5,
    readAt: '2026-10-01T00:00:00.000Z',
  });
  assert.equal(
    reading.value,
    1042.5,
    'createReading must keep the register value it was given'
  );
  assert.equal(
    reading.unit,
    'kWh',
    'readings must always be denominated in kWh'
  );
  assert.equal(
    reading.kind,
    'reading',
    'readings must carry kind=reading so stores can distinguish record types'
  );
});

test('core models: createReading rejects a negative register value', () => {
  assert.throws(
    () =>
      createReading({
        meterId: 'mtr_1',
        customerId: 'cus_1',
        value: -3,
        readAt: '2026-10-01T00:00:00.000Z',
      }),
    ValidationError,
    'createReading must reject negative register values'
  );
});

test('core models: createInvoice requires a parseable billing period', () => {
  assert.throws(
    () =>
      createInvoice({
        customerId: 'cus_1',
        periodStart: 'not-a-date',
        periodEnd: '2026-10-31T23:59:59.000Z',
        usageKwh: 10,
        tariff: 'standard',
        amountCents: 320,
      }),
    ValidationError,
    'createInvoice must reject a periodStart that is not an ISO timestamp'
  );
});

test('core models: createCustomer validates name and email presence', () => {
  const customer = createCustomer({ name: 'Ada', email: 'ada@example.com' });
  assert.match(
    customer.id,
    /^cus_/,
    'generated customer ids must carry the cus_ prefix'
  );
  assert.throws(
    () => createCustomer({ name: 'Ada' }),
    ValidationError,
    'createCustomer must reject a customer without an email'
  );
});
