'use strict';

// Model constructors validate at the boundary so bad records never reach a
// store.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCart } = require('../packages/domain/src/models/cart');
const { createQuote } = require('../packages/domain/src/models/quote');
const { createPromotion } = require('../packages/domain/src/models/promotion');
const { createOrder } = require('../packages/domain/src/models/order');
const {
  createStockLevel,
  available,
} = require('../packages/domain/src/models/stock-level');
const {
  createReservation,
} = require('../packages/domain/src/models/reservation');

test('a cart requires a supported currency and positive line quantities', () => {
  const cart = createCart({
    cartId: 'crt_1',
    customerId: 'cus_1',
    currency: 'EUR',
    lines: [{ sku: 'SKU-A', quantity: 2 }],
  });
  assert.equal(cart.status, 'open', 'a new cart must default to open');
  assert.throws(
    () =>
      createCart({
        cartId: 'crt_2',
        customerId: 'cus_1',
        currency: 'XXX',
        lines: [],
      }),
    /currency/,
    'an unsupported cart currency must be rejected'
  );
  assert.throws(
    () =>
      createCart({
        cartId: 'crt_3',
        customerId: 'cus_1',
        currency: 'USD',
        lines: [{ sku: 'SKU-A', quantity: 0 }],
      }),
    /positive/,
    'a zero line quantity must be rejected'
  );
});

test('a quote validates its discount lines: promotion identity and non-negative amount', () => {
  const quote = createQuote({
    quoteId: 'qot_1',
    cartId: 'crt_1',
    currency: 'USD',
    lines: [{ sku: 'SKU-A', quantity: 1, unitPrice: 100, lineTotal: 100 }],
    discounts: [
      { promotionId: 'pro_1', code: 'TEN', label: '10% off', amount: 10 },
    ],
  });
  assert.equal(quote.discounts.length, 1);
  assert.throws(
    () =>
      createQuote({
        quoteId: 'qot_2',
        cartId: 'crt_1',
        currency: 'USD',
        lines: [],
        discounts: [
          { promotionId: 'pro_1', code: 'TEN', label: '10% off', amount: -5 },
        ],
      }),
    /negative/,
    'a negative discount amount must be rejected'
  );
});

test('a promotion requires a known type, a validity window, and a cap', () => {
  const promo = createPromotion({
    promotionId: 'pro_1',
    code: 'TEN',
    type: 'percentage',
    priority: 10,
    params: { bps: 1000 },
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2027-01-01T00:00:00.000Z',
    perCustomerCap: 2,
  });
  assert.equal(promo.perCustomerCap, 2);
  assert.throws(
    () =>
      createPromotion({
        promotionId: 'pro_2',
        code: 'BAD',
        type: 'mystery',
        priority: 1,
        params: {},
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2027-01-01T00:00:00.000Z',
        perCustomerCap: 0,
      }),
    /type/,
    'an unknown promotion type must be rejected'
  );
});

test('an order accepts the four lifecycle statuses and only those', () => {
  for (const status of [
    'pending',
    'confirmed',
    'partially_confirmed',
    'declined',
  ]) {
    const order = createOrder({
      orderId: 'ord_1',
      cartId: 'crt_1',
      customerId: 'cus_1',
      currency: 'USD',
      lines: [],
      total: 0,
      status,
    });
    assert.equal(order.status, status, `status ${status} must be accepted`);
  }
  assert.throws(
    () =>
      createOrder({
        orderId: 'ord_2',
        cartId: 'crt_1',
        customerId: 'cus_1',
        currency: 'USD',
        lines: [],
        total: 0,
        status: 'shipped',
      }),
    /status/,
    'an unknown order status must be rejected'
  );
});

test('stock availability is derived from the two counters, never stored', () => {
  const level = createStockLevel({ sku: 'SKU-A', onHand: 10, reserved: 3 });
  assert.equal(available(level), 7, 'available must be onHand minus reserved');
  assert.equal(
    Object.prototype.hasOwnProperty.call(level, 'available'),
    false,
    'the record must not store a third availability counter'
  );
});

test('a reservation holds positive-quantity lines and a lifecycle status', () => {
  const reservation = createReservation({
    reservationId: 'res_1',
    orderId: 'ord_1',
    lines: [{ sku: 'SKU-A', quantity: 2 }],
  });
  assert.equal(reservation.status, 'held', 'a new reservation must be held');
});
