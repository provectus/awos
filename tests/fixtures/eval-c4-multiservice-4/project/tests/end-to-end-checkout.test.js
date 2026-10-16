'use strict';

// Baseline end-to-end over HTTP: a USD cart with one percentage promotion is
// quoted, read back through the cart API, checked out, confirmed, and the
// catalog's stock read model reflects the reservation.

const test = require('node:test');
const assert = require('node:assert/strict');

const { makeTempEnv } = require('./helpers/temp-env');
const { buildWorld } = require('./helpers/world');
const { request, listen, close } = require('./helpers/http');

const WINDOW = {
  validFrom: '2020-01-01T00:00:00.000Z',
  validTo: '2099-01-01T00:00:00.000Z',
};

test('end to end: single-currency cart with one promotion confirms with consistent totals everywhere', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const world = buildWorld(env);
  const cartPort = await listen(world.cart.server);
  t.after(() => close(world.cart.server));
  const catalogPort = await listen(world.catalog.server);
  t.after(() => close(world.catalog.server));
  const authed = { 'x-api-key': world.apiKey };

  world.pricing.ratesStore.putBasePrice({
    sku: 'SKU-A',
    unitPrice: { amount: 2500, currency: 'USD' },
  });
  world.pricing.ratesStore.putBasePrice({
    sku: 'SKU-B',
    unitPrice: { amount: 1999, currency: 'USD' },
  });
  world.promotions.promosStore.put({
    promotionId: 'pro_ten',
    code: 'TEN',
    type: 'percentage',
    priority: 10,
    params: { bps: 1000 },
    perCustomerCap: 0,
    ...WINDOW,
  });
  world.stock.stockStore.put({ sku: 'SKU-A', onHand: 10 });
  world.stock.stockStore.put({ sku: 'SKU-B', onHand: 10 });

  const created = await request({
    port: cartPort,
    method: 'POST',
    path: '/carts',
    headers: authed,
    body: { customerId: 'cus_1', currency: 'USD' },
  });
  const cartId = created.json.cart.cartId;
  await request({
    port: cartPort,
    method: 'POST',
    path: `/carts/${cartId}/lines`,
    headers: authed,
    body: { sku: 'SKU-A', quantity: 2 },
  });
  await request({
    port: cartPort,
    method: 'POST',
    path: `/carts/${cartId}/lines`,
    headers: authed,
    body: { sku: 'SKU-B', quantity: 3 },
  });

  await request({
    port: cartPort,
    method: 'POST',
    path: `/carts/${cartId}/quote`,
    headers: authed,
  });
  await world.settle();

  const quote = await request({
    port: cartPort,
    path: `/carts/${cartId}/quote`,
    headers: authed,
  });
  assert.equal(
    quote.json.quote.subtotal,
    10997,
    'subtotal must be the sum of the line totals (2x2500 + 3x1999)'
  );
  assert.equal(
    quote.json.quote.discountTotal,
    1100,
    '10% of 10997 rounds half-even to 1100'
  );
  assert.equal(
    quote.json.quote.total,
    9897,
    'the surfaced total must be subtotal minus discounts'
  );

  await request({
    port: cartPort,
    method: 'POST',
    path: `/carts/${cartId}/checkout`,
    headers: authed,
  });
  await world.settle();

  const order = world.orchestrator.ordersStore.getByCartId(cartId);
  assert.equal(order.status, 'confirmed', 'the checkout must confirm');
  assert.equal(order.total, 9897, 'the order total must equal the quote');
  assert.deepEqual(
    order.promotionIds,
    ['pro_ten'],
    'the order must record which promotions priced it'
  );

  assert.equal(
    world.payments.journal.listByType(order.orderId, 'authorization')[0].amount,
    9897,
    'the authorization must be for the ledger total'
  );
  assert.equal(
    world.payments.journal.listByType(order.orderId, 'capture')[0].amount,
    9897,
    'the capture must be for the ledger total'
  );

  const stockA = await request({
    port: catalogPort,
    path: '/stock-levels/SKU-A',
    headers: authed,
  });
  assert.equal(
    stockA.json.stockLevel.reserved,
    2,
    'the catalog read model must reflect the held reservation after settling'
  );
  assert.equal(
    world.stock.stockStore.get('SKU-B').reserved,
    3,
    'the authoritative stock store holds the SKU-B reservation'
  );
});
