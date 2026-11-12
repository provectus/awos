'use strict';

// The saga's failure paths: a payment decline and a stock rejection both end
// the checkout declined, with nothing left held that should not be.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCommandQueue,
} = require('../packages/messaging/src/queues/command-queue');
const {
  BANDS,
} = require('../services/payments-gateway/src/rules/decline-bands');
const { makeTempEnv } = require('./helpers/temp-env');
const { buildWorld } = require('./helpers/world');

async function quoteAndCheckout(world, env, { cartId, unitPrice, quantity }) {
  const commands = createCommandQueue({ dir: env.commandsDir });
  world.pricing.ratesStore.putBasePrice({
    sku: 'SKU-A',
    unitPrice: { amount: unitPrice, currency: 'USD' },
  });
  commands.publish({
    target: 'pricing-service',
    command: 'quote-cart',
    payload: {
      cartId,
      customerId: 'cus_1',
      currency: 'USD',
      lines: [{ sku: 'SKU-A', quantity }],
    },
  });
  await world.settle();
  commands.publish({
    target: 'checkout-orchestrator',
    command: 'checkout',
    payload: { cartId, customerId: 'cus_1' },
  });
  await world.settle();
}

test('a declined payment declines the order before any stock is touched', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const world = buildWorld(env);
  world.stock.stockStore.put({ sku: 'SKU-A', onHand: 100 });

  // Two units priced over half the soft ceiling push the total past it.
  await quoteAndCheckout(world, env, {
    cartId: 'crt_declined',
    unitPrice: BANDS.USD.softCeiling,
    quantity: 2,
  });

  const order = world.orchestrator.ordersStore.getByCartId('crt_declined');
  assert.equal(order.status, 'declined', 'the order must decline');
  assert.match(
    world.orchestrator.sagasStore.get(order.orderId).state,
    /declined/,
    'the saga must end declined'
  );
  assert.equal(
    world.stock.stockStore.get('SKU-A').reserved,
    0,
    'no stock may be held for a payment-declined order'
  );
  assert.equal(
    world.payments.journal.listByType(order.orderId, 'capture').length,
    0,
    'nothing may be captured on a declined payment'
  );
});

test('a stock rejection declines the order and captures nothing', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const world = buildWorld(env);
  world.stock.stockStore.put({ sku: 'SKU-A', onHand: 1 });

  await quoteAndCheckout(world, env, {
    cartId: 'crt_short',
    unitPrice: 1000,
    quantity: 5,
  });

  const order = world.orchestrator.ordersStore.getByCartId('crt_short');
  assert.equal(
    order.status,
    'declined',
    'insufficient stock must decline the order'
  );
  assert.equal(
    world.payments.journal.listByType(order.orderId, 'authorization').length,
    1,
    'the authorization happened before the stock rejection'
  );
  assert.equal(
    world.payments.journal.listByType(order.orderId, 'capture').length,
    0,
    'the authorized amount must never be captured after a stock rejection'
  );
  assert.equal(
    world.stock.stockStore.get('SKU-A').reserved,
    0,
    'the rejected reservation must hold nothing'
  );
});
