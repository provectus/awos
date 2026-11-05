'use strict';

// The promotions service: consumes price.quoted, applies the rules on file,
// announces promotion.applied with one discount line per applied promotion.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPromotionsService,
} = require('../services/promotions-service/src/service');
const {
  createEventQueue,
} = require('../packages/messaging/src/queues/event-queue');
const { makeTempEnv } = require('./helpers/temp-env');
const { silentLogger } = require('./helpers/world');

function build(env) {
  const service = createPromotionsService({
    promosDir: env.promosDir,
    commandsDir: env.commandsDir,
    eventsDir: env.eventsDir,
    logger: silentLogger,
  });
  const events = createEventQueue({ dir: env.eventsDir });
  return { service, events };
}

function publishQuote(events, overrides = {}) {
  return events.publish({
    source: 'pricing-service',
    event: 'price.quoted',
    payload: {
      quoteId: 'qot_1',
      cartId: 'crt_1',
      customerId: 'cus_1',
      currency: 'USD',
      cartCurrency: 'USD',
      lines: [
        { sku: 'SKU-A', quantity: 2, unitPrice: 2500, lineTotal: 5000 },
        { sku: 'SKU-B', quantity: 3, unitPrice: 1999, lineTotal: 5997 },
      ],
      ...overrides,
    },
  });
}

const WINDOW = {
  validFrom: '2020-01-01T00:00:00.000Z',
  validTo: '2099-01-01T00:00:00.000Z',
};

test('a percentage promotion lands one discount line computed half-even on the subtotal', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, events } = build(env);
  service.promosStore.put({
    promotionId: 'pro_ten',
    code: 'TEN',
    type: 'percentage',
    priority: 10,
    params: { bps: 1000 },
    perCustomerCap: 0,
    ...WINDOW,
  });

  publishQuote(events);
  await service.drain();

  const applied = events
    .peekAll()
    .filter((e) => e.event === 'promotion.applied');
  assert.equal(applied.length, 1, 'the applied promotions must be announced');
  assert.deepEqual(
    applied[0].payload.discounts,
    [
      {
        promotionId: 'pro_ten',
        code: 'TEN',
        label: '10% off',
        amount: 1100,
      },
    ],
    '10% of the 10997 subtotal must land as a single 1100 discount line (half-even)'
  );
  assert.deepEqual(
    applied[0].payload.promotionIds,
    ['pro_ten'],
    'the applied promotion ids must ride on the event'
  );
});

test('a fixed-amount promotion applies only when its currency matches the quote', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, events } = build(env);
  service.promosStore.put({
    promotionId: 'pro_usd',
    code: 'FIVE-USD',
    type: 'fixed-amount',
    priority: 10,
    params: { amount: 500, currency: 'USD' },
    perCustomerCap: 0,
    ...WINDOW,
  });
  service.promosStore.put({
    promotionId: 'pro_eur',
    code: 'FIVE-EUR',
    type: 'fixed-amount',
    priority: 20,
    params: { amount: 500, currency: 'EUR' },
    perCustomerCap: 0,
    ...WINDOW,
  });

  publishQuote(events);
  await service.drain();

  const applied = events
    .peekAll()
    .filter((e) => e.event === 'promotion.applied');
  assert.equal(
    applied[0].payload.discounts.length,
    1,
    'only the matching-currency fixed promotion may land a discount'
  );
  assert.equal(
    applied[0].payload.discounts[0].code,
    'FIVE-USD',
    'the USD promotion is the one that matches a USD quote'
  );
});

test('a quote with no promotions on file still announces promotion.applied with empty discounts', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, events } = build(env);

  publishQuote(events);
  await service.drain();

  const applied = events
    .peekAll()
    .filter((e) => e.event === 'promotion.applied');
  assert.equal(
    applied.length,
    1,
    'the quote must flow through even with nothing to apply'
  );
  assert.deepEqual(
    applied[0].payload.discounts,
    [],
    'no promotions means no discount lines, not a missing event'
  );
});

test('usage is recorded per promotion and customer when a discount lands', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, events } = build(env);
  service.promosStore.put({
    promotionId: 'pro_ten',
    code: 'TEN',
    type: 'percentage',
    priority: 10,
    params: { bps: 1000 },
    perCustomerCap: 1,
    ...WINDOW,
  });

  publishQuote(events);
  await service.drain();

  assert.equal(
    service.usageStore.count('pro_ten', 'cus_1'),
    1,
    'applying the promotion must record usage for that customer'
  );
  assert.equal(
    service.usageStore.count('pro_ten', 'cus_other'),
    0,
    'other customers are untouched'
  );
});
