'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createOrdersStore,
} = require('../services/gateway-api/src/store/orders-store');
const { makeTempEnv } = require('./helpers/temp-env');

const sampleOrder = (id, createdAt) => ({
  id,
  customerEmail: 'ops@acme.example',
  items: [{ sku: 'SKU-1', quantity: 1 }],
  status: 'pending',
  createdAt,
});

test('orders store: save then get round-trips the full record', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const store = createOrdersStore({ dir: env.ordersDir });
  const order = sampleOrder('ord_round', '2026-10-01T00:00:00.000Z');
  store.save(order);
  assert.deepEqual(
    store.get('ord_round'),
    order,
    'get must return exactly what save persisted'
  );
});

test('orders store: get for an unknown id returns null', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const store = createOrdersStore({ dir: env.ordersDir });
  assert.equal(
    store.get('ord_missing'),
    null,
    'a missing order must read as null, not throw'
  );
});

test('orders store: list returns all orders sorted by createdAt', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const store = createOrdersStore({ dir: env.ordersDir });
  store.save(sampleOrder('ord_b', '2026-10-02T00:00:00.000Z'));
  store.save(sampleOrder('ord_a', '2026-10-01T00:00:00.000Z'));
  assert.deepEqual(
    store.list().map((o) => o.id),
    ['ord_a', 'ord_b'],
    'list must sort orders by creation time, oldest first'
  );
});

test('orders store: writes are atomic — no .tmp leftovers after save', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const store = createOrdersStore({ dir: env.ordersDir });
  store.save(sampleOrder('ord_atomic', '2026-10-01T00:00:00.000Z'));
  const leftovers = fs
    .readdirSync(env.ordersDir)
    .filter((name) => name.endsWith('.tmp'));
  assert.deepEqual(
    leftovers,
    [],
    'save must rename its temp file away, leaving no .tmp files behind'
  );
  assert.ok(
    fs.existsSync(path.join(env.ordersDir, 'ord_atomic.json')),
    'the order must be persisted as <id>.json'
  );
});
