'use strict';

// Store-level contracts across the services: ownership guards, round-trips,
// and the invariants each store enforces on its records.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRatesStore,
} = require('../services/pricing-service/src/store/rates-store');
const {
  createConversionStore,
} = require('../services/pricing-service/src/store/conversion-store');
const {
  createRoundingRulesStore,
} = require('../services/pricing-service/src/store/rounding-rules-store');
const {
  createPromosStore,
} = require('../services/promotions-service/src/store/promos-store');
const {
  createLedgerStore,
} = require('../services/checkout-orchestrator/src/store/ledger-store');
const {
  createOrdersStore,
} = require('../services/checkout-orchestrator/src/store/orders-store');
const {
  createIdempotencyLedger,
} = require('../services/stock-service/src/store/idempotency-ledger');
const { makeTempEnv } = require('./helpers/temp-env');

test('the rates store refuses base prices in any currency but its base currency', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const rates = createRatesStore({ dir: env.ratesDir });
  assert.equal(
    rates.getBaseCurrency(),
    'USD',
    'the base currency defaults to USD'
  );
  assert.throws(
    () =>
      rates.putBasePrice({
        sku: 'SKU-A',
        unitPrice: { amount: 100, currency: 'EUR' },
      }),
    /base prices must be in USD/,
    'a base price in a foreign currency must be refused'
  );
  rates.putBasePrice({
    sku: 'SKU-A',
    unitPrice: { amount: 100, currency: 'USD' },
  });
  assert.equal(rates.getBasePrice('SKU-A').unitPrice.amount, 100);
});

test('the conversion store holds integer micro-rates per target currency', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const conversions = createConversionStore({ dir: env.ratesDir });
  conversions.putRate({ currency: 'EUR', rateMicros: 925000 });
  assert.equal(
    conversions.getRate('EUR').rateMicros,
    925000,
    'the stored rate must read back exactly'
  );
  assert.throws(
    () => conversions.putRate({ currency: 'EUR', rateMicros: 0.925 }),
    /positive integer/,
    'a fractional rate must be refused: rates are integers in micro-units'
  );
});

test('rounding rules default to half-even and refuse other modes', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const rounding = createRoundingRulesStore({ dir: env.ratesDir });
  assert.equal(
    rounding.getRule('JPY').mode,
    'half-even',
    'a currency without an explicit rule rounds half-even'
  );
  assert.throws(
    () => rounding.putRule({ currency: 'USD', mode: 'half-up' }),
    /unsupported rounding mode/,
    'half-even is the only mode the platform implements'
  );
});

test('the promotions store validates rule records on write', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const promos = createPromosStore({ dir: env.promosDir });
  promos.put({
    promotionId: 'pro_1',
    code: 'TEN',
    type: 'percentage',
    priority: 10,
    params: { bps: 1000 },
    validFrom: '2020-01-01T00:00:00.000Z',
    validTo: '2099-01-01T00:00:00.000Z',
    perCustomerCap: 1,
  });
  assert.equal(promos.list().length, 1);
  assert.throws(
    () =>
      promos.put({
        promotionId: 'pro_2',
        code: 'X',
        type: 'nope',
        priority: 1,
        params: {},
        validFrom: '2020-01-01T00:00:00.000Z',
        validTo: '2099-01-01T00:00:00.000Z',
        perCustomerCap: 0,
      }),
    /type/,
    'an invalid promotion record must not land in the store'
  );
});

test('the pricing ledger records one quote per cart and attaches the order later', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const ledger = createLedgerStore({ dir: env.ledgerDir });
  ledger.putQuote({
    cartId: 'crt_1',
    quoteId: 'qot_1',
    customerId: 'cus_1',
    currency: 'USD',
    cartCurrency: 'USD',
    lines: [],
    discounts: [],
    promotionIds: [],
    total: 0,
  });
  assert.equal(
    ledger.get('crt_1').orderId,
    null,
    'a fresh quote record has no order yet'
  );
  ledger.attachOrder('crt_1', 'ord_1');
  assert.equal(
    ledger.get('crt_1').orderId,
    'ord_1',
    'attaching the order must persist on the same record'
  );
});

test('the orders store finds an order by its cart', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const orders = createOrdersStore({ dir: env.ordersDir });
  orders.put({
    orderId: 'ord_1',
    cartId: 'crt_9',
    customerId: 'cus_1',
    currency: 'USD',
    lines: [],
    total: 100,
    status: 'pending',
  });
  assert.equal(
    orders.getByCartId('crt_9').orderId,
    'ord_1',
    'lookup by cart must find the order'
  );
  assert.equal(orders.getByCartId('crt_none'), null);
});

test('the stock idempotency ledger refuses a duplicate key outright', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const ledger = createIdempotencyLedger({ dir: env.stockDir });
  ledger.record('ord_1', 'reserve:ord_1', { result: 'reserved' });
  assert.deepEqual(
    ledger.find('ord_1', 'reserve:ord_1').outcome,
    { result: 'reserved' },
    'a recorded outcome must be findable by its key'
  );
  assert.throws(
    () => ledger.record('ord_1', 'reserve:ord_1', { result: 'reserved' }),
    /duplicate ledger key/,
    'recording the same key twice must be refused'
  );
});
