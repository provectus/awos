'use strict';

// The stock service: all-or-nothing reservations, idempotent re-delivery via
// the per-order ledger, and full release back to availability.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createStockService } = require('../services/stock-service/src/service');
const {
  createCommandQueue,
} = require('../packages/messaging/src/queues/command-queue');
const {
  createEventQueue,
} = require('../packages/messaging/src/queues/event-queue');
const { makeTempEnv } = require('./helpers/temp-env');
const { silentLogger } = require('./helpers/world');

function build(env) {
  const service = createStockService({
    stockDir: env.stockDir,
    commandsDir: env.commandsDir,
    eventsDir: env.eventsDir,
    logger: silentLogger,
  });
  const commands = createCommandQueue({ dir: env.commandsDir });
  const events = createEventQueue({ dir: env.eventsDir });
  return { service, commands, events };
}

test('reserve-stock holds every line of an available order and announces stock.reserved', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, commands, events } = build(env);
  service.stockStore.put({ sku: 'SKU-A', onHand: 10 });
  service.stockStore.put({ sku: 'SKU-B', onHand: 10 });

  commands.publish({
    target: 'stock-service',
    command: 'reserve-stock',
    payload: {
      orderId: 'ord_1',
      lines: [
        { sku: 'SKU-A', quantity: 2 },
        { sku: 'SKU-B', quantity: 3 },
      ],
    },
  });
  await service.drain();

  assert.equal(
    service.stockStore.get('SKU-A').reserved,
    2,
    'SKU-A must carry the reserved count after reservation'
  );
  assert.equal(
    service.stockStore.get('SKU-B').reserved,
    3,
    'SKU-B must carry the reserved count after reservation'
  );
  const reserved = events.peekAll().filter((e) => e.event === 'stock.reserved');
  assert.equal(
    reserved.length,
    1,
    'exactly one stock.reserved event must announce the hold'
  );
  assert.ok(
    reserved[0].payload.reservationId,
    'the reservation must carry an id'
  );
});

test('reserve-stock is all-or-nothing: one short line rejects the whole order', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, commands, events } = build(env);
  service.stockStore.put({ sku: 'SKU-A', onHand: 10 });
  service.stockStore.put({ sku: 'SKU-B', onHand: 1 });

  commands.publish({
    target: 'stock-service',
    command: 'reserve-stock',
    payload: {
      orderId: 'ord_2',
      lines: [
        { sku: 'SKU-A', quantity: 2 },
        { sku: 'SKU-B', quantity: 5 },
      ],
    },
  });
  await service.drain();

  assert.equal(
    service.stockStore.get('SKU-A').reserved,
    0,
    'no line may be held when any line falls short'
  );
  const rejected = events.peekAll().filter((e) => e.event === 'stock.rejected');
  assert.equal(rejected.length, 1, 'the rejection must be announced once');
  assert.deepEqual(
    rejected[0].payload.shortLines,
    [{ sku: 'SKU-B', requested: 5, available: 1 }],
    'the rejection must name the short line with requested and available'
  );
});

test('a redelivered reserve-stock mutates nothing and replays the recorded outcome', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, commands, events } = build(env);
  service.stockStore.put({ sku: 'SKU-A', onHand: 10 });

  const payload = {
    orderId: 'ord_3',
    lines: [{ sku: 'SKU-A', quantity: 4 }],
  };
  commands.publish({
    target: 'stock-service',
    command: 'reserve-stock',
    payload,
  });
  await service.drain();
  commands.publish({
    target: 'stock-service',
    command: 'reserve-stock',
    payload,
  });
  await service.drain();

  assert.equal(
    service.stockStore.get('SKU-A').reserved,
    4,
    'the duplicate must not reserve a second time'
  );
  const reserved = events.peekAll().filter((e) => e.event === 'stock.reserved');
  assert.equal(
    reserved.length,
    2,
    'the duplicate must re-announce the recorded outcome for consumers that missed it'
  );
  assert.equal(
    reserved[0].payload.reservationId,
    reserved[1].payload.reservationId,
    'the replayed announcement must carry the same reservation identity'
  );
});

test('release-stock returns the full recorded reservation to availability, idempotently', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, commands, events } = build(env);
  service.stockStore.put({ sku: 'SKU-A', onHand: 10 });
  service.stockStore.put({ sku: 'SKU-B', onHand: 10 });

  commands.publish({
    target: 'stock-service',
    command: 'reserve-stock',
    payload: {
      orderId: 'ord_4',
      lines: [
        { sku: 'SKU-A', quantity: 2 },
        { sku: 'SKU-B', quantity: 3 },
      ],
    },
  });
  await service.drain();
  commands.publish({
    target: 'stock-service',
    command: 'release-stock',
    payload: { orderId: 'ord_4' },
  });
  commands.publish({
    target: 'stock-service',
    command: 'release-stock',
    payload: { orderId: 'ord_4' },
  });
  await service.drain();

  assert.equal(
    service.stockStore.get('SKU-A').reserved,
    0,
    'the release must restore SKU-A exactly'
  );
  assert.equal(
    service.stockStore.get('SKU-B').reserved,
    0,
    'the release must restore SKU-B exactly'
  );
  const released = events.peekAll().filter((e) => e.event === 'stock.released');
  assert.equal(
    released.length,
    2,
    'the duplicate release must replay the outcome without mutating again'
  );
});

test('release-stock for an order with no reservation on file fails loudly', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, commands } = build(env);
  commands.publish({
    target: 'stock-service',
    command: 'release-stock',
    payload: { orderId: 'ord_ghost' },
  });
  await assert.rejects(
    () => service.drain(),
    /no reservation recorded/,
    'releasing a reservation that was never held must be an error, not a silent no-op'
  );
});

test('set-on-hand lands new stock while preserving the reserved counter', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const { service, commands } = build(env);
  service.stockStore.put({ sku: 'SKU-A', onHand: 10, reserved: 4 });

  commands.publish({
    target: 'stock-service',
    command: 'set-on-hand',
    payload: { sku: 'SKU-A', onHand: 25 },
  });
  await service.drain();

  assert.equal(
    service.stockStore.get('SKU-A').onHand,
    25,
    'receiving must set the on-hand counter'
  );
  assert.equal(
    service.stockStore.get('SKU-A').reserved,
    4,
    'receiving must not touch what is reserved'
  );
});
