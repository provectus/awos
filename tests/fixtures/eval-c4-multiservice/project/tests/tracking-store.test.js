'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createTrackingStore,
} = require('../services/tracking-worker/src/store/tracking-store');
const { makeTempEnv } = require('./helpers/temp-env');

const sampleRecord = (shipmentId) => ({
  shipmentId,
  orderId: 'ord_1',
  carrier: 'dhl',
  trackingNumber: 'JD1',
  status: 'created',
  statusUpdatedAt: '2026-10-01T00:00:00.000Z',
  events: [],
});

test('tracking store: save then get round-trips a tracking record', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const store = createTrackingStore({ dir: env.trackingDir });
  const record = sampleRecord('shp_round');
  store.save(record);
  assert.deepEqual(
    store.get('shp_round'),
    record,
    'get must return exactly the record that save persisted'
  );
});

test('tracking store: get for an unknown shipment returns null', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const store = createTrackingStore({ dir: env.trackingDir });
  assert.equal(
    store.get('shp_missing'),
    null,
    'a missing tracking record must read as null, not throw'
  );
});

test('tracking store: list surfaces every persisted record', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const store = createTrackingStore({ dir: env.trackingDir });
  store.save(sampleRecord('shp_a'));
  store.save(sampleRecord('shp_b'));
  assert.deepEqual(
    store
      .list()
      .map((r) => r.shipmentId)
      .sort(),
    ['shp_a', 'shp_b'],
    'list must return one entry per saved shipment'
  );
});
