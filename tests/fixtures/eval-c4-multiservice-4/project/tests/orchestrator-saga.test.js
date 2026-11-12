'use strict';

// The checkout saga, happy path, driven through the real queues without
// HTTP: quote -> ledger -> checkout -> authorize -> reserve -> capture ->
// confirmed.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCommandQueue,
} = require('../packages/messaging/src/queues/command-queue');
const { makeTempEnv } = require('./helpers/temp-env');
const { buildWorld } = require('./helpers/world');

test('a quoted cart checks out: authorized, reserved, captured, confirmed, ledger carries the order', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const world = buildWorld(env);
  const commands = createCommandQueue({ dir: env.commandsDir });

  world.pricing.ratesStore.putBasePrice({
    sku: 'SKU-A',
    unitPrice: { amount: 2500, currency: 'USD' },
  });
  world.stock.stockStore.put({ sku: 'SKU-A', onHand: 10 });

  commands.publish({
    target: 'pricing-service',
    command: 'quote-cart',
    payload: {
      cartId: 'crt_1',
      customerId: 'cus_1',
      currency: 'USD',
      lines: [{ sku: 'SKU-A', quantity: 2 }],
    },
  });
  await world.settle();

  const ledgerRecord = world.orchestrator.ledgerStore.get('crt_1');
  assert.equal(
    ledgerRecord.total,
    5000,
    'the orchestrator must persist the quote total in the pricing ledger'
  );

  commands.publish({
    target: 'checkout-orchestrator',
    command: 'checkout',
    payload: { cartId: 'crt_1', customerId: 'cus_1' },
  });
  await world.settle();

  const order = world.orchestrator.ordersStore.getByCartId('crt_1');
  assert.equal(order.status, 'confirmed', 'the happy path must confirm');
  assert.equal(order.total, 5000, 'the order carries the ledger total');

  const saga = world.orchestrator.sagasStore.get(order.orderId);
  assert.equal(saga.state, 'confirmed', 'the saga must end confirmed');

  assert.equal(
    world.stock.stockStore.get('SKU-A').reserved,
    2,
    'the confirmed order keeps its reservation held'
  );
  assert.equal(
    world.payments.journal.listByType(order.orderId, 'capture').length,
    1,
    'exactly one capture must be journaled'
  );
  assert.equal(
    world.payments.journal.listByType(order.orderId, 'capture')[0].amount,
    5000,
    'the captured amount is the order total'
  );
  assert.equal(
    world.orchestrator.ledgerStore.get('crt_1').orderId,
    order.orderId,
    'the ledger record must point at the order it became'
  );
});

test('checkout of a cart that was never quoted declines with reason not_quoted', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const world = buildWorld(env);
  const commands = createCommandQueue({ dir: env.commandsDir });

  commands.publish({
    target: 'checkout-orchestrator',
    command: 'checkout',
    payload: { cartId: 'crt_unquoted', customerId: 'cus_1' },
  });
  await world.settle();

  const {
    createEventQueue,
  } = require('../packages/messaging/src/queues/event-queue');
  const events = createEventQueue({ dir: env.eventsDir });
  const declined = events.peekAll().filter((e) => e.event === 'order.declined');
  assert.equal(declined.length, 1, 'the decline must be announced');
  assert.equal(
    declined[0].payload.reason,
    'not_quoted',
    'the reason must say the cart had no quote on file'
  );
});
