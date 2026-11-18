'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createOrder } = require('../packages/shared/src/models/order');
const { createShipment } = require('../packages/shared/src/models/shipment');
const {
  createAddress,
  formatOneLine,
} = require('../packages/shared/src/models/address');
const {
  createTrackingEvent,
} = require('../packages/shared/src/models/tracking-event');
const { ValidationError } = require('../packages/shared/src/validation');

const validAddress = {
  line1: '12 Harbor Way',
  city: 'Rotterdam',
  postalCode: '3011 AB',
  country: 'nl',
};

test('order model: a valid order gets an id, pending status, and createdAt', () => {
  const order = createOrder({
    customerEmail: 'ops@acme.example',
    items: [{ sku: 'SKU-100', quantity: 2 }],
    shippingAddress: validAddress,
  });
  assert.match(order.id, /^ord_/, 'order ids must carry the ord_ prefix');
  assert.equal(order.status, 'pending', 'new orders must start as pending');
  assert.ok(
    !Number.isNaN(Date.parse(order.createdAt)),
    'order.createdAt must be a parseable ISO timestamp'
  );
});

test('order model: an order without items is rejected', () => {
  assert.throws(
    () =>
      createOrder({
        customerEmail: 'ops@acme.example',
        items: [],
        shippingAddress: validAddress,
      }),
    ValidationError,
    'createOrder must reject an empty items array with a ValidationError'
  );
});

test('order model: an item with a non-positive quantity is rejected', () => {
  assert.throws(
    () =>
      createOrder({
        customerEmail: 'ops@acme.example',
        items: [{ sku: 'SKU-100', quantity: 0 }],
        shippingAddress: validAddress,
      }),
    ValidationError,
    'createOrder must reject quantity 0 with a ValidationError'
  );
});

test('shipment model: a valid shipment starts in created status with a shp_ id', () => {
  const shipment = createShipment({
    orderId: 'ord_abc123',
    carrier: 'DHL',
    trackingNumber: 'JD014600003',
  });
  assert.match(shipment.id, /^shp_/, 'shipment ids must carry the shp_ prefix');
  assert.equal(
    shipment.status,
    'created',
    'new shipments must start in created status'
  );
  assert.equal(
    shipment.carrier,
    'dhl',
    'carrier codes must be normalized to lowercase'
  );
});

test('address model: country is normalized and one-line formatting skips empty parts', () => {
  const address = createAddress(validAddress);
  assert.equal(
    address.country,
    'NL',
    'country codes must be normalized to uppercase'
  );
  assert.equal(
    formatOneLine(address),
    '12 Harbor Way, Rotterdam, 3011 AB, NL',
    'one-line formatting must skip the empty line2'
  );
});

test('tracking-event model: a malformed occurredAt is rejected', () => {
  assert.throws(
    () =>
      createTrackingEvent({
        shipmentId: 'shp_x',
        status: 'in_transit',
        occurredAt: 'yesterday-ish',
      }),
    ValidationError,
    'createTrackingEvent must reject a non-ISO occurredAt with a ValidationError'
  );
});
