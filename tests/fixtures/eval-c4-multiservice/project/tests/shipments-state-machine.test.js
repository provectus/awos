'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  InvalidTransitionError,
  canTransition,
  applyTransition,
  isTerminal,
} = require('../services/tracking-worker/src/shipments');

test('state machine: the happy path created -> in_transit -> out_for_delivery -> delivered is allowed', () => {
  const record = { shipmentId: 'shp_x', status: 'created' };
  for (const next of ['in_transit', 'out_for_delivery', 'delivered']) {
    applyTransition(record, next, '2026-10-12T09:00:00.000Z');
    assert.equal(
      record.status,
      next,
      `applyTransition must advance the record to ${next}`
    );
  }
});

test('state machine: delivered is terminal — no further transitions', () => {
  assert.ok(isTerminal('delivered'), 'delivered must be a terminal status');
  assert.equal(
    canTransition('delivered', 'in_transit'),
    false,
    'a delivered shipment must not move back to in_transit'
  );
  assert.throws(
    () =>
      applyTransition(
        { shipmentId: 'shp_x', status: 'delivered' },
        'in_transit',
        '2026-10-12T09:00:00.000Z'
      ),
    InvalidTransitionError,
    'applying a transition out of delivered must raise InvalidTransitionError'
  );
});

test('state machine: skipping from created straight to delivered is rejected', () => {
  assert.equal(
    canTransition('created', 'delivered'),
    false,
    'a shipment must pass through transit before it can be delivered'
  );
});

test('state machine: an exception can recover back into transit', () => {
  const record = { shipmentId: 'shp_x', status: 'exception' };
  applyTransition(record, 'in_transit', '2026-10-12T10:00:00.000Z');
  assert.equal(
    record.status,
    'in_transit',
    'exception -> in_transit must be a legal recovery transition'
  );
  assert.equal(
    record.statusUpdatedAt,
    '2026-10-12T10:00:00.000Z',
    'applyTransition must stamp statusUpdatedAt with the event time'
  );
});
