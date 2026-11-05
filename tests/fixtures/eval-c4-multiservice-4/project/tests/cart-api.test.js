'use strict';

// The cart API: cart and line management over HTTP, quote requests published
// as addressed commands, the quote read back through the ledger view.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCartApi } = require('../services/cart-api/src/server');
const {
  createCommandQueue,
} = require('../packages/messaging/src/queues/command-queue');
const {
  createLedgerStore,
} = require('../services/checkout-orchestrator/src/store/ledger-store');
const { makeTempEnv } = require('./helpers/temp-env');
const { request, listen, close } = require('./helpers/http');
const { silentLogger } = require('./helpers/world');

const API_KEY = 'test-cart-key';

async function start(t) {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const cart = createCartApi({
    cartsDir: env.cartsDir,
    ledgerDir: env.ledgerDir,
    ordersDir: env.ordersDir,
    commandsDir: env.commandsDir,
    apiKey: API_KEY,
    logger: silentLogger,
    logRequests: false,
  });
  const port = await listen(cart.server);
  t.after(() => close(cart.server));
  return { env, cart, port };
}

function authed(extra = {}) {
  return { 'x-api-key': API_KEY, ...extra };
}

test('a cart is created with a currency and accumulates lines, merging repeated SKUs', async (t) => {
  const { port } = await start(t);
  const created = await request({
    port,
    method: 'POST',
    path: '/carts',
    headers: authed(),
    body: { customerId: 'cus_1', currency: 'USD' },
  });
  assert.equal(created.statusCode, 201, 'cart creation must answer 201');
  const cartId = created.json.cart.cartId;

  await request({
    port,
    method: 'POST',
    path: `/carts/${cartId}/lines`,
    headers: authed(),
    body: { sku: 'SKU-A', quantity: 2 },
  });
  const after = await request({
    port,
    method: 'POST',
    path: `/carts/${cartId}/lines`,
    headers: authed(),
    body: { sku: 'SKU-A', quantity: 3 },
  });
  assert.deepEqual(
    after.json.cart.lines,
    [{ sku: 'SKU-A', variantId: null, quantity: 5 }],
    'adding the same SKU twice must merge into one line with the summed quantity'
  );

  const removed = await request({
    port,
    method: 'DELETE',
    path: `/carts/${cartId}/lines/SKU-A`,
    headers: authed(),
  });
  assert.deepEqual(
    removed.json.cart.lines,
    [],
    'deleting a line must remove it from the cart'
  );
});

test('an unsupported cart currency is rejected with a 400', async (t) => {
  const { port } = await start(t);
  const bad = await request({
    port,
    method: 'POST',
    path: '/carts',
    headers: authed(),
    body: { customerId: 'cus_1', currency: 'XXX' },
  });
  assert.equal(bad.statusCode, 400, 'an unsupported currency must be a 400');
});

test('POST /carts/:id/quote publishes a quote-cart command addressed to the pricing service', async (t) => {
  const { env, port } = await start(t);
  const created = await request({
    port,
    method: 'POST',
    path: '/carts',
    headers: authed(),
    body: { customerId: 'cus_1', currency: 'USD' },
  });
  const cartId = created.json.cart.cartId;
  await request({
    port,
    method: 'POST',
    path: `/carts/${cartId}/lines`,
    headers: authed(),
    body: { sku: 'SKU-A', quantity: 2 },
  });

  const accepted = await request({
    port,
    method: 'POST',
    path: `/carts/${cartId}/quote`,
    headers: authed(),
  });
  assert.equal(accepted.statusCode, 202, 'the quote request is asynchronous');

  const commands = createCommandQueue({ dir: env.commandsDir });
  const pending = commands.peekAll();
  assert.equal(pending.length, 1, 'exactly one command must be queued');
  assert.equal(
    pending[0].target,
    'pricing-service',
    'the command must be addressed to the pricing service'
  );
  assert.equal(pending[0].command, 'quote-cart');
  assert.deepEqual(
    pending[0].payload.lines,
    [{ sku: 'SKU-A', quantity: 2 }],
    'the command must carry the cart line snapshot'
  );
});

test('GET /carts/:id/quote surfaces the ledger record with totals', async (t) => {
  const { env, port } = await start(t);
  const created = await request({
    port,
    method: 'POST',
    path: '/carts',
    headers: authed(),
    body: { customerId: 'cus_1', currency: 'USD' },
  });
  const cartId = created.json.cart.cartId;

  const before = await request({
    port,
    path: `/carts/${cartId}/quote`,
    headers: authed(),
  });
  assert.equal(
    before.statusCode,
    404,
    'a cart with no ledger record has no quote to read'
  );

  // Simulate the orchestrator having recorded the quote in the ledger.
  const ledger = createLedgerStore({ dir: env.ledgerDir });
  ledger.putQuote({
    cartId,
    quoteId: 'qot_1',
    customerId: 'cus_1',
    currency: 'USD',
    cartCurrency: 'USD',
    lines: [{ sku: 'SKU-A', quantity: 2, unitPrice: 2500, lineTotal: 5000 }],
    discounts: [
      { promotionId: 'pro_1', code: 'TEN', label: '10% off', amount: 500 },
    ],
    promotionIds: ['pro_1'],
    total: 4500,
  });

  const after = await request({
    port,
    path: `/carts/${cartId}/quote`,
    headers: authed(),
  });
  assert.equal(after.statusCode, 200);
  assert.equal(
    after.json.quote.total,
    4500,
    'the surfaced total must match the ledger record'
  );
  assert.equal(after.json.quote.subtotal, 5000);
  assert.equal(after.json.quote.discountTotal, 500);
});

test('POST /carts/:id/checkout publishes a checkout command and marks the cart checking_out', async (t) => {
  const { env, port } = await start(t);
  const created = await request({
    port,
    method: 'POST',
    path: '/carts',
    headers: authed(),
    body: { customerId: 'cus_1', currency: 'USD' },
  });
  const cartId = created.json.cart.cartId;

  const accepted = await request({
    port,
    method: 'POST',
    path: `/carts/${cartId}/checkout`,
    headers: authed(),
  });
  assert.equal(accepted.statusCode, 202, 'checkout is asynchronous');

  const commands = createCommandQueue({ dir: env.commandsDir });
  const pending = commands.peekAll();
  assert.equal(
    pending[0].target,
    'checkout-orchestrator',
    'the command must be addressed to the orchestrator'
  );

  const read = await request({
    port,
    path: `/carts/${cartId}`,
    headers: authed(),
  });
  assert.equal(
    read.json.cart.status,
    'checking_out',
    'the cart must leave the open state when checkout starts'
  );
});
