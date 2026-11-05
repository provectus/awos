'use strict';

// The pricing service: base prices and volume tiers from the rates store,
// quotes announced as price.quoted events in the store's base currency.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPricingService,
} = require('../services/pricing-service/src/service');
const {
  createCommandQueue,
} = require('../packages/messaging/src/queues/command-queue');
const {
  createEventQueue,
} = require('../packages/messaging/src/queues/event-queue');
const { makeTempEnv } = require('./helpers/temp-env');
const { silentLogger } = require('./helpers/world');

function build(env) {
  const service = createPricingService({
    ratesDir: env.ratesDir,
    commandsDir: env.commandsDir,
    eventsDir: env.eventsDir,
    logger: silentLogger,
  });
  const commands = createCommandQueue({ dir: env.commandsDir });
  const events = createEventQueue({ dir: env.eventsDir });
  return { service, commands, events };
}

test('quote-cart prices every line from the base price table and announces price.quoted', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, commands, events } = build(env);
  service.ratesStore.putBasePrice({
    sku: 'SKU-A',
    unitPrice: { amount: 2500, currency: 'USD' },
  });
  service.ratesStore.putBasePrice({
    sku: 'SKU-B',
    unitPrice: { amount: 1999, currency: 'USD' },
  });

  commands.publish({
    target: 'pricing-service',
    command: 'quote-cart',
    payload: {
      cartId: 'crt_1',
      customerId: 'cus_1',
      currency: 'USD',
      lines: [
        { sku: 'SKU-A', quantity: 2 },
        { sku: 'SKU-B', quantity: 3 },
      ],
    },
  });
  await service.drain();

  const quoted = events.peekAll().filter((e) => e.event === 'price.quoted');
  assert.equal(quoted.length, 1, 'exactly one quote must be announced');
  assert.equal(
    quoted[0].payload.currency,
    'USD',
    'the quote must carry the rates store base currency'
  );
  assert.deepEqual(
    quoted[0].payload.lines,
    [
      { sku: 'SKU-A', quantity: 2, unitPrice: 2500, lineTotal: 5000 },
      { sku: 'SKU-B', quantity: 3, unitPrice: 1999, lineTotal: 5997 },
    ],
    'each line must carry integer unit price and line total'
  );
});

test('volume tiers override the unit price at their quantity threshold', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, commands, events } = build(env);
  service.ratesStore.putBasePrice({
    sku: 'SKU-A',
    unitPrice: { amount: 1000, currency: 'USD' },
  });
  service.tiersStore.putTiers({
    sku: 'SKU-A',
    tiers: [
      { minQuantity: 5, unitPrice: { amount: 900, currency: 'USD' } },
      { minQuantity: 10, unitPrice: { amount: 800, currency: 'USD' } },
    ],
  });

  commands.publish({
    target: 'pricing-service',
    command: 'quote-cart',
    payload: {
      cartId: 'crt_2',
      customerId: 'cus_1',
      currency: 'USD',
      lines: [{ sku: 'SKU-A', quantity: 10 }],
    },
  });
  commands.publish({
    target: 'pricing-service',
    command: 'quote-cart',
    payload: {
      cartId: 'crt_3',
      customerId: 'cus_1',
      currency: 'USD',
      lines: [{ sku: 'SKU-A', quantity: 4 }],
    },
  });
  await service.drain();

  const quoted = events.peekAll().filter((e) => e.event === 'price.quoted');
  assert.equal(
    quoted[0].payload.lines[0].unitPrice,
    800,
    'ten units must get the deepest tier the quantity reaches'
  );
  assert.equal(
    quoted[1].payload.lines[0].unitPrice,
    1000,
    'four units fall short of every tier and must pay the base price'
  );
});

test('quoting an unpriced SKU fails loudly instead of inventing a price', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, commands } = build(env);
  commands.publish({
    target: 'pricing-service',
    command: 'quote-cart',
    payload: {
      cartId: 'crt_4',
      customerId: 'cus_1',
      currency: 'USD',
      lines: [{ sku: 'SKU-GHOST', quantity: 1 }],
    },
  });
  await assert.rejects(
    () => service.drain(),
    /no base price on file/,
    'an unpriced SKU must be an error, never a zero price'
  );
});

test('upsert-rate and upsert-tier write the rates store through the command surface', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, commands } = build(env);
  commands.publish({
    target: 'pricing-service',
    command: 'upsert-rate',
    payload: { sku: 'SKU-N', unitPrice: { amount: 1234, currency: 'USD' } },
  });
  commands.publish({
    target: 'pricing-service',
    command: 'upsert-tier',
    payload: {
      sku: 'SKU-N',
      tiers: [{ minQuantity: 3, unitPrice: { amount: 1100, currency: 'USD' } }],
    },
  });
  await service.drain();

  assert.equal(
    service.ratesStore.getBasePrice('SKU-N').unitPrice.amount,
    1234,
    'upsert-rate must land the base price in the rates store'
  );
  assert.equal(
    service.tiersStore.getTiers('SKU-N').length,
    1,
    'upsert-tier must land the tiers in the rates store'
  );
});

test('upsert-conversion-rate and upsert-rounding-rule write the rates store through the command surface', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, commands } = build(env);
  commands.publish({
    target: 'pricing-service',
    command: 'upsert-conversion-rate',
    payload: { currency: 'EUR', rateMicros: 925000 },
  });
  commands.publish({
    target: 'pricing-service',
    command: 'upsert-rounding-rule',
    payload: { currency: 'EUR', mode: 'half-even' },
  });
  await service.drain();

  assert.equal(
    service.conversionStore.getRate('EUR').rateMicros,
    925000,
    'the conversion-table entry must land in the rates store'
  );
  assert.equal(
    service.roundingRulesStore.getRule('EUR').mode,
    'half-even',
    'the rounding rule must land in the rates store'
  );
});
