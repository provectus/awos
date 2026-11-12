'use strict';

// Multi-currency checkout with stacked promotions and partial payment
// capture (spec: context/spec/001-checkout-totals/). These tests are written
// against the intended behavior and are EXPECTED TO FAIL until the feature
// is implemented.
//
// Contract vocabulary used throughout:
// - Conversion: a base-currency amount A converts to target currency as
//   halfEven(A * rateMicros * 10^(expTarget - expBase) / 1e6), applied to
//   each line total (and each unit price) SEPARATELY — never to the sum.
// - Stacking: promotions apply in ascending declared priority. percentage
//   discounts are computed per converted product line and summed into one
//   discount line; fixed-amount is flat in the quote currency; buy-n-get-m
//   (params buyCount/getCount over product LINES) zeroes the getCount
//   cheapest lines when the quote has at least buyCount+getCount lines.
// - A promotion outside its validity window or past its per-customer cap is
//   skipped silently. Usage counts once per COMPLETED checkout (confirmed or
//   partially_confirmed), never at quote time, never on a full decline.
// - Partial capture: the gateway authorizes up to the soft band and declines
//   only the excess. Funding walks product lines by descending converted
//   line total (ties by sku ascending), funding each line that still fits in
//   the authorized amount; the capture equals the sum of funded line totals;
//   reservations of unfunded lines are released. fundedLines/unfundedLines
//   are [{ sku, quantity }] in that same walk order.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCommandQueue,
} = require('../packages/messaging/src/queues/command-queue');
const {
  createEventQueue,
} = require('../packages/messaging/src/queues/event-queue');
const {
  BANDS,
} = require('../services/payments-gateway/src/rules/decline-bands');
const { makeTempEnv } = require('./helpers/temp-env');
const { buildWorld } = require('./helpers/world');
const { request, listen, close } = require('./helpers/http');

const WINDOW = {
  validFrom: '2020-01-01T00:00:00.000Z',
  validTo: '2099-01-01T00:00:00.000Z',
};
const EXPIRED_WINDOW = {
  validFrom: '2019-01-01T00:00:00.000Z',
  validTo: '2021-01-01T00:00:00.000Z',
};

function setup(t) {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const world = buildWorld(env);
  const commands = createCommandQueue({ dir: env.commandsDir });
  const events = createEventQueue({ dir: env.eventsDir });
  // Conversion table and rounding rules on file in the rates store.
  world.pricing.conversionStore.putRate({
    currency: 'EUR',
    rateMicros: 925000,
  });
  world.pricing.conversionStore.putRate({
    currency: 'JPY',
    rateMicros: 152500000,
  });
  world.pricing.roundingRulesStore.putRule({
    currency: 'EUR',
    mode: 'half-even',
  });
  world.pricing.roundingRulesStore.putRule({
    currency: 'JPY',
    mode: 'half-even',
  });
  return { env, world, commands, events };
}

function seedRates(world, prices) {
  for (const [sku, amount] of Object.entries(prices)) {
    world.pricing.ratesStore.putBasePrice({
      sku,
      unitPrice: { amount, currency: 'USD' },
    });
  }
}

function quoteCart(commands, { cartId, customerId, currency, lines }) {
  commands.publish({
    target: 'pricing-service',
    command: 'quote-cart',
    payload: { cartId, customerId, currency, lines },
  });
}

// ---------------------------------------------------------------------------
// (a) multi-currency conversion, per line, half-even
// ---------------------------------------------------------------------------

test('feature (a): an EUR cart is quoted in EUR, each line converted and rounded half-even', async (t) => {
  const { world, commands } = setup(t);
  seedRates(world, { 'SKU-CONV-A': 50, 'SKU-CONV-B': 10 });

  quoteCart(commands, {
    cartId: 'crt_eur',
    customerId: 'cus_a',
    currency: 'EUR',
    lines: [
      { sku: 'SKU-CONV-A', quantity: 2 },
      { sku: 'SKU-CONV-B', quantity: 2 },
    ],
  });
  await world.settle();

  const record = world.orchestrator.ledgerStore.get('crt_eur');
  assert.equal(
    record.currency,
    'EUR',
    'the quote for an EUR cart must be issued in EUR, not the base currency'
  );
  assert.equal(
    record.lines[0].lineTotal,
    92,
    'line A: 100 USD cents at 0.925 is 92.5, which rounds half-even DOWN to 92'
  );
  assert.equal(
    record.lines[1].lineTotal,
    18,
    'line B: 20 USD cents at 0.925 is 18.5, which rounds half-even DOWN to 18'
  );
  assert.equal(
    record.lines[0].unitPrice,
    46,
    'unit prices convert per unit: 50 at 0.925 is 46.25, half-even to 46'
  );
  assert.equal(
    record.lines[1].unitPrice,
    9,
    'unit prices convert per unit: 10 at 0.925 is 9.25, half-even to 9'
  );
});

test('feature (a): a zero-minor-unit currency (JPY) quotes whole yen per line', async (t) => {
  const { world, commands } = setup(t);
  seedRates(world, { 'SKU-J1': 20, 'SKU-J2': 60, 'SKU-J3': 99 });

  quoteCart(commands, {
    cartId: 'crt_jpy',
    customerId: 'cus_a',
    currency: 'JPY',
    lines: [
      { sku: 'SKU-J1', quantity: 1 },
      { sku: 'SKU-J2', quantity: 1 },
      { sku: 'SKU-J3', quantity: 3 },
    ],
  });
  await world.settle();

  const record = world.orchestrator.ledgerStore.get('crt_jpy');
  assert.equal(record.currency, 'JPY', 'the quote must be issued in JPY');
  assert.equal(
    record.lines[0].lineTotal,
    30,
    'line J1: 20 cents at 1.525 is 30.5 yen, half-even to 30 — JPY has no minor units'
  );
  assert.equal(
    record.lines[1].lineTotal,
    92,
    'line J2: 60 cents at 1.525 is 91.5 yen, half-even to 92'
  );
  assert.equal(
    record.lines[2].lineTotal,
    453,
    'line J3: 297 cents at 1.525 is 452.925 yen, rounded to 453'
  );
  for (const line of record.lines) {
    assert.ok(
      Number.isInteger(line.lineTotal) && Number.isInteger(line.unitPrice),
      'every JPY amount must be a whole-yen integer'
    );
  }
});

test('feature (a): rounding happens per line, never on the converted sum', async (t) => {
  const { world, commands } = setup(t);
  seedRates(world, { 'SKU-CONV-A': 50, 'SKU-CONV-B': 10 });

  quoteCart(commands, {
    cartId: 'crt_perline',
    customerId: 'cus_a',
    currency: 'EUR',
    lines: [
      { sku: 'SKU-CONV-A', quantity: 2 },
      { sku: 'SKU-CONV-B', quantity: 2 },
    ],
  });
  await world.settle();

  const record = world.orchestrator.ledgerStore.get('crt_perline');
  const sum = record.lines.reduce((acc, line) => acc + line.lineTotal, 0);
  assert.equal(
    sum,
    110,
    'per-line rounding gives 92 + 18 = 110; converting the 120-cent total would give 111'
  );
});

// ---------------------------------------------------------------------------
// (b) stacked promotions: priority order, per-line percentage, buy-n-get-m
// ---------------------------------------------------------------------------

const STACK_PRICES = {
  'SKU-P1': 50,
  'SKU-P2': 10,
  'SKU-P3': 101,
  'SKU-P4': 33,
};
const STACK_LINES = [
  { sku: 'SKU-P1', quantity: 2 },
  { sku: 'SKU-P2', quantity: 2 },
  { sku: 'SKU-P3', quantity: 1 },
  { sku: 'SKU-P4', quantity: 3 },
];
// Converted EUR line totals: P1 92, P2 18, P3 93, P4 92 (subtotal 295).

function seedStackedPromos(world) {
  // Store listing order (lexicographic by id) deliberately differs from the
  // declared priority order.
  world.promotions.promosStore.put({
    promotionId: 'pro_a_fix',
    code: 'FIX25',
    type: 'fixed-amount',
    priority: 20,
    params: { amount: 25, currency: 'EUR' },
    perCustomerCap: 0,
    ...WINDOW,
  });
  world.promotions.promosStore.put({
    promotionId: 'pro_b_perc',
    code: 'PERC15',
    type: 'percentage',
    priority: 10,
    params: { bps: 1500 },
    perCustomerCap: 0,
    ...WINDOW,
  });
  world.promotions.promosStore.put({
    promotionId: 'pro_c_b2g1',
    code: 'B2G1',
    type: 'buy-n-get-m',
    priority: 30,
    params: { buyCount: 2, getCount: 1 },
    perCustomerCap: 0,
    ...WINDOW,
  });
}

async function runStackedQuote(t) {
  const context = setup(t);
  seedRates(context.world, STACK_PRICES);
  seedStackedPromos(context.world);
  quoteCart(context.commands, {
    cartId: 'crt_stack',
    customerId: 'cus_stack',
    currency: 'EUR',
    lines: STACK_LINES,
  });
  await context.world.settle();
  return context;
}

test('feature (b): discount lines land in declared priority order, one per promotion', async (t) => {
  const { world } = await runStackedQuote(t);
  const record = world.orchestrator.ledgerStore.get('crt_stack');
  assert.deepEqual(
    record.discounts.map((d) => d.code),
    ['PERC15', 'FIX25', 'B2G1'],
    'promotions must stack in ascending priority (10, 20, 30), not store order'
  );
});

test('feature (b): the percentage discount is computed per converted line, then summed', async (t) => {
  const { world } = await runStackedQuote(t);
  const record = world.orchestrator.ledgerStore.get('crt_stack');
  const perc = record.discounts.find((d) => d.code === 'PERC15');
  assert.ok(perc, 'the percentage promotion must land a discount line');
  assert.equal(
    perc.amount,
    45,
    '15% per line: 92->14, 18->3, 93->14, 92->14 sums to 45; 15% of the 295 subtotal would round to 44'
  );
});

test('feature (b): buy-n-get-m zeroes the cheapest qualifying line', async (t) => {
  const { world } = await runStackedQuote(t);
  const record = world.orchestrator.ledgerStore.get('crt_stack');
  const bngm = record.discounts.find((d) => d.code === 'B2G1');
  assert.ok(bngm, 'the buy-2-get-1 promotion must land a discount line');
  assert.equal(
    bngm.amount,
    18,
    'with 4 product lines, the single cheapest line (18 EUR cents) is zeroed'
  );
});

// ---------------------------------------------------------------------------
// (c) validity windows and cap timing at quote time
// ---------------------------------------------------------------------------

test('feature (c): a promotion past its validity window is skipped silently', async (t) => {
  const { world, commands } = setup(t);
  seedRates(world, { 'SKU-E': 1000 });
  world.promotions.promosStore.put({
    promotionId: 'pro_expired',
    code: 'OLD10',
    type: 'percentage',
    priority: 10,
    params: { bps: 1000 },
    perCustomerCap: 0,
    ...EXPIRED_WINDOW,
  });

  quoteCart(commands, {
    cartId: 'crt_expired',
    customerId: 'cus_a',
    currency: 'USD',
    lines: [{ sku: 'SKU-E', quantity: 1 }],
  });
  await world.settle();

  const record = world.orchestrator.ledgerStore.get('crt_expired');
  assert.ok(record, 'the quote itself must still go through');
  assert.deepEqual(
    record.discounts,
    [],
    'an expired promotion contributes nothing — silently, not as an error'
  );
});

test('feature (c)+(h): a usage cap is not consumed at quote time, only by a completed checkout', async (t) => {
  const { world, commands } = setup(t);
  seedRates(world, { 'SKU-C': 1000 });
  world.stock.stockStore.put({ sku: 'SKU-C', onHand: 100 });
  world.promotions.promosStore.put({
    promotionId: 'pro_capped',
    code: 'ONCE10',
    type: 'percentage',
    priority: 10,
    params: { bps: 1000 },
    perCustomerCap: 1,
    ...WINDOW,
  });

  const lines = [{ sku: 'SKU-C', quantity: 1 }];
  quoteCart(commands, {
    cartId: 'crt_cap_1',
    customerId: 'cus_cap',
    currency: 'USD',
    lines,
  });
  await world.settle();
  quoteCart(commands, {
    cartId: 'crt_cap_2',
    customerId: 'cus_cap',
    currency: 'USD',
    lines,
  });
  await world.settle();

  assert.equal(
    world.orchestrator.ledgerStore.get('crt_cap_1').discounts.length,
    1,
    'the first quote gets the discount'
  );
  assert.equal(
    world.orchestrator.ledgerStore.get('crt_cap_2').discounts.length,
    1,
    'the second quote ALSO gets the discount: quoting must not consume the cap'
  );

  commands.publish({
    target: 'checkout-orchestrator',
    command: 'checkout',
    payload: { cartId: 'crt_cap_1', customerId: 'cus_cap' },
  });
  await world.settle();
  assert.equal(
    world.orchestrator.ordersStore.getByCartId('crt_cap_1').status,
    'confirmed',
    'precondition: the capped checkout completes'
  );
  assert.equal(
    world.promotions.usageStore.count('pro_capped', 'cus_cap'),
    1,
    'exactly one completed checkout means exactly one recorded use'
  );

  quoteCart(commands, {
    cartId: 'crt_cap_3',
    customerId: 'cus_cap',
    currency: 'USD',
    lines,
  });
  await world.settle();
  assert.deepEqual(
    world.orchestrator.ledgerStore.get('crt_cap_3').discounts,
    [],
    'after the cap is reached by a completed checkout, the promotion is skipped silently'
  );
});

// ---------------------------------------------------------------------------
// (d)+(j) the ledger total is computed once and surfaced exactly over HTTP
// ---------------------------------------------------------------------------

async function runStackedCheckoutOverHttp(t) {
  const context = setup(t);
  const { world } = context;
  seedRates(world, STACK_PRICES);
  seedStackedPromos(world);
  for (const sku of Object.keys(STACK_PRICES)) {
    world.stock.stockStore.put({ sku, onHand: 10 });
  }
  const port = await listen(world.cart.server);
  t.after(() => close(world.cart.server));
  const authed = { 'x-api-key': world.apiKey };

  const created = await request({
    port,
    method: 'POST',
    path: '/carts',
    headers: authed,
    body: { customerId: 'cus_stack', currency: 'EUR' },
  });
  const cartId = created.json.cart.cartId;
  for (const line of STACK_LINES) {
    await request({
      port,
      method: 'POST',
      path: `/carts/${cartId}/lines`,
      headers: authed,
      body: line,
    });
  }
  await request({
    port,
    method: 'POST',
    path: `/carts/${cartId}/quote`,
    headers: authed,
  });
  await world.settle();
  await request({
    port,
    method: 'POST',
    path: `/carts/${cartId}/checkout`,
    headers: authed,
  });
  await world.settle();
  return { ...context, port, authed, cartId };
}

test('feature (d): the order total is the sum of rounded lines minus discount lines, persisted once in the ledger', async (t) => {
  const { world, cartId } = await runStackedCheckoutOverHttp(t);
  const record = world.orchestrator.ledgerStore.get(cartId);
  assert.equal(
    record.total,
    207,
    'EUR lines 92+18+93+92 = 295, minus discounts 45+25+18 = 88, is exactly 207'
  );
  const order = world.orchestrator.ordersStore.getByCartId(cartId);
  assert.equal(
    order.total,
    207,
    'the order must carry the ledger total untouched'
  );
});

test('feature (j): GET /carts/:id/checkout-status surfaces exactly the ledger total and line sets', async (t) => {
  const { world, port, authed, cartId } = await runStackedCheckoutOverHttp(t);
  const status = await request({
    port,
    path: `/carts/${cartId}/checkout-status`,
    headers: authed,
  });
  assert.equal(
    status.statusCode,
    200,
    'the checkout-status endpoint must exist'
  );
  assert.equal(
    status.json.status,
    'confirmed',
    'a fully funded checkout reads as confirmed'
  );
  assert.equal(
    status.json.total,
    207,
    'the surfaced total must be the ledger total, never recomputed'
  );
  assert.equal(status.json.currency, 'EUR', 'the status carries the currency');
  assert.deepEqual(
    status.json.fundedLines,
    [
      { sku: 'SKU-P3', quantity: 1 },
      { sku: 'SKU-P1', quantity: 2 },
      { sku: 'SKU-P4', quantity: 3 },
      { sku: 'SKU-P2', quantity: 2 },
    ],
    'a confirmed order funds every line, listed in funding walk order (descending line total, ties by sku)'
  );
  assert.deepEqual(
    status.json.unfundedLines,
    [],
    'a confirmed order leaves nothing unfunded'
  );
});

// ---------------------------------------------------------------------------
// (e)(f)(g)(i)(j) partial payment capture
// ---------------------------------------------------------------------------

const PARTIAL_PRICES = {
  'SKU-W': 40000,
  'SKU-X': 30000,
  'SKU-Y': 20000,
  'SKU-Z': 10000,
};
// Converted EUR line totals: W 37000, X 27750, Y 18500, Z 9250 (total 92500).
// EUR soft band 80000: funding walk W (37000), X (27750), Y does not fit,
// Z (9250) still fits. Funded sum 74000; Y is the one unfunded line.

async function runPartialCheckout(t) {
  const context = setup(t);
  const { world } = context;
  seedRates(world, PARTIAL_PRICES);
  for (const sku of Object.keys(PARTIAL_PRICES)) {
    world.stock.stockStore.put({ sku, onHand: 5 });
  }
  const port = await listen(world.cart.server);
  t.after(() => close(world.cart.server));
  const catalogPort = await listen(world.catalog.server);
  t.after(() => close(world.catalog.server));
  const authed = { 'x-api-key': world.apiKey };

  const created = await request({
    port,
    method: 'POST',
    path: '/carts',
    headers: authed,
    body: { customerId: 'cus_partial', currency: 'EUR' },
  });
  const cartId = created.json.cart.cartId;
  for (const sku of Object.keys(PARTIAL_PRICES)) {
    await request({
      port,
      method: 'POST',
      path: `/carts/${cartId}/lines`,
      headers: authed,
      body: { sku, quantity: 1 },
    });
  }
  await request({
    port,
    method: 'POST',
    path: `/carts/${cartId}/quote`,
    headers: authed,
  });
  await world.settle();
  await request({
    port,
    method: 'POST',
    path: `/carts/${cartId}/checkout`,
    headers: authed,
  });
  await world.settle();
  return { ...context, port, catalogPort, authed, cartId };
}

test('feature (e): a partial decline confirms the funded lines, cheapest-last', async (t) => {
  const { world, cartId } = await runPartialCheckout(t);
  const order = world.orchestrator.ordersStore.getByCartId(cartId);
  assert.equal(
    order.status,
    'partially_confirmed',
    'an authorization short of the total must end partially confirmed, not declined'
  );
  assert.deepEqual(
    order.fundedLines,
    [
      { sku: 'SKU-W', quantity: 1 },
      { sku: 'SKU-X', quantity: 1 },
      { sku: 'SKU-Z', quantity: 1 },
    ],
    'funding walks lines by descending total within the 80000 authorized: W and X fit, Y (18500) no longer fits, Z (9250) still does'
  );
  assert.deepEqual(
    order.unfundedLines,
    [{ sku: 'SKU-Y', quantity: 1 }],
    'the line that did not fit the authorized amount is the unfunded one'
  );
});

test('feature (e): the capture equals the sum of funded line totals', async (t) => {
  const { world, cartId } = await runPartialCheckout(t);
  const order = world.orchestrator.ordersStore.getByCartId(cartId);
  const authorizations = world.payments.journal.listByType(
    order.orderId,
    'authorization'
  );
  assert.equal(
    authorizations.length,
    1,
    'exactly one authorization must be journaled'
  );
  assert.equal(
    authorizations[0].amount,
    BANDS.EUR.softCeiling,
    'the gateway authorizes up to the EUR soft band (80000), declining only the excess'
  );
  const captures = world.payments.journal.listByType(order.orderId, 'capture');
  assert.equal(captures.length, 1, 'exactly one capture must be journaled');
  assert.equal(
    captures[0].amount,
    74000,
    'the capture is the funded sum 37000+27750+9250, not the authorized 80000'
  );
});

test('feature (g): reservations of unfunded lines are released with exact counts', async (t) => {
  const { world } = await runPartialCheckout(t);
  assert.equal(
    world.stock.stockStore.get('SKU-W').reserved,
    1,
    'funded line W keeps its reservation'
  );
  assert.equal(
    world.stock.stockStore.get('SKU-X').reserved,
    1,
    'funded line X keeps its reservation'
  );
  assert.equal(
    world.stock.stockStore.get('SKU-Z').reserved,
    1,
    'funded line Z keeps its reservation'
  );
  assert.equal(
    world.stock.stockStore.get('SKU-Y').reserved,
    0,
    'the unfunded line Y must be released back to exactly zero reserved'
  );
  assert.equal(
    world.stock.stockStore.get('SKU-Y').onHand,
    5,
    'a release must restore availability without touching on-hand'
  );
});

test('feature (f): a duplicated payment event neither double-captures nor double-releases', async (t) => {
  const { world, events, cartId } = await runPartialCheckout(t);
  const order = world.orchestrator.ordersStore.getByCartId(cartId);
  const saga = world.orchestrator.sagasStore.get(order.orderId);

  events.publish({
    source: 'payments-gateway',
    event: 'payment.authorized',
    payload: {
      orderId: order.orderId,
      attemptId: saga.attemptId,
      amount: BANDS.EUR.softCeiling,
      currency: 'EUR',
    },
  });
  await world.settle();

  assert.equal(
    world.payments.journal.listByType(order.orderId, 'capture').length,
    1,
    'the duplicated authorization event must not produce a second capture (keyed on order+attempt)'
  );
  assert.equal(
    world.stock.stockStore.get('SKU-Y').reserved,
    0,
    'the duplicated event must not release a second time: Y stays at exactly zero'
  );
  assert.equal(
    world.stock.stockStore.get('SKU-W').reserved,
    1,
    'funded reservations must survive the duplicated event untouched'
  );
});

test('feature (i): the catalog stock read model is exact once the partial saga settles', async (t) => {
  const { world, catalogPort, authed } = await runPartialCheckout(t);
  const expectations = { 'SKU-W': 1, 'SKU-X': 1, 'SKU-Y': 0, 'SKU-Z': 1 };
  for (const [sku, reserved] of Object.entries(expectations)) {
    const level = await request({
      port: catalogPort,
      path: `/stock-levels/${sku}`,
      headers: authed,
    });
    assert.equal(
      level.json.stockLevel.reserved,
      reserved,
      `the read model must show ${sku} with exactly ${reserved} reserved after reservation and release both projected`
    );
  }
});

test('feature (j): checkout-status for a partially confirmed order carries status, line sets, total, currency', async (t) => {
  const { world, port, authed, cartId } = await runPartialCheckout(t);
  const status = await request({
    port,
    path: `/carts/${cartId}/checkout-status`,
    headers: authed,
  });
  assert.equal(
    status.statusCode,
    200,
    'the checkout-status endpoint must exist'
  );
  assert.deepEqual(
    {
      status: status.json.status,
      total: status.json.total,
      currency: status.json.currency,
      fundedLines: status.json.fundedLines,
      unfundedLines: status.json.unfundedLines,
    },
    {
      status: 'partially_confirmed',
      total: 92500,
      currency: 'EUR',
      fundedLines: [
        { sku: 'SKU-W', quantity: 1 },
        { sku: 'SKU-X', quantity: 1 },
        { sku: 'SKU-Z', quantity: 1 },
      ],
      unfundedLines: [{ sku: 'SKU-Y', quantity: 1 }],
    },
    'the status view reads straight from the ledger and orders store: full order total, exact line sets'
  );
});

// ---------------------------------------------------------------------------
// (h) usage caps across checkout outcomes
// ---------------------------------------------------------------------------

test('feature (h): usage increments once per completed checkout (full or partial) and never on a full decline', async (t) => {
  const { world, commands } = setup(t);
  seedRates(world, { ...PARTIAL_PRICES, 'SKU-G': 10000 });
  for (const sku of [...Object.keys(PARTIAL_PRICES), 'SKU-G']) {
    world.stock.stockStore.put({ sku, onHand: 50 });
  }
  world.promotions.promosStore.put({
    promotionId: 'pro_loyal',
    code: 'LOYAL5',
    type: 'percentage',
    priority: 10,
    params: { bps: 500 },
    perCustomerCap: 10,
    ...WINDOW,
  });

  // cus_full: small cart, fully confirmed.
  quoteCart(commands, {
    cartId: 'crt_h_full',
    customerId: 'cus_full',
    currency: 'EUR',
    lines: [{ sku: 'SKU-G', quantity: 1 }],
  });
  await world.settle();
  commands.publish({
    target: 'checkout-orchestrator',
    command: 'checkout',
    payload: { cartId: 'crt_h_full', customerId: 'cus_full' },
  });
  await world.settle();

  // cus_part: four-line cart whose discounted total still exceeds the band.
  quoteCart(commands, {
    cartId: 'crt_h_part',
    customerId: 'cus_part',
    currency: 'EUR',
    lines: Object.keys(PARTIAL_PRICES).map((sku) => ({ sku, quantity: 1 })),
  });
  await world.settle();
  commands.publish({
    target: 'checkout-orchestrator',
    command: 'checkout',
    payload: { cartId: 'crt_h_part', customerId: 'cus_part' },
  });
  await world.settle();

  // cus_decl: one giant line past the hard band, fully declined.
  quoteCart(commands, {
    cartId: 'crt_h_decl',
    customerId: 'cus_decl',
    currency: 'EUR',
    lines: [{ sku: 'SKU-W', quantity: 11 }],
  });
  await world.settle();
  commands.publish({
    target: 'checkout-orchestrator',
    command: 'checkout',
    payload: { cartId: 'crt_h_decl', customerId: 'cus_decl' },
  });
  await world.settle();

  assert.equal(
    world.orchestrator.ordersStore.getByCartId('crt_h_full').status,
    'confirmed',
    'precondition: the small cart confirms in full'
  );
  assert.equal(
    world.orchestrator.ordersStore.getByCartId('crt_h_part').status,
    'partially_confirmed',
    'precondition: the four-line cart partially confirms'
  );
  assert.equal(
    world.orchestrator.ordersStore.getByCartId('crt_h_decl').status,
    'declined',
    'precondition: the giant cart declines in full'
  );

  assert.equal(
    world.promotions.usageStore.count('pro_loyal', 'cus_full'),
    1,
    'a fully confirmed checkout counts exactly one use'
  );
  assert.equal(
    world.promotions.usageStore.count('pro_loyal', 'cus_part'),
    1,
    'a PARTIALLY confirmed checkout also counts exactly one use'
  );
  assert.equal(
    world.promotions.usageStore.count('pro_loyal', 'cus_decl'),
    0,
    'a fully declined checkout must never count a use'
  );
});
