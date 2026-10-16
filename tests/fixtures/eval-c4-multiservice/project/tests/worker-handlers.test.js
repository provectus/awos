'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createWorker } = require('../services/tracking-worker/src/worker');
const { createQueue } = require('../packages/shared/src/queue/in-memory-queue');
const { createShipment } = require('../packages/shared/src/models/shipment');
const { makeTempEnv } = require('./helpers/temp-env');

const silentLogger = { log() {}, warn() {}, error() {} };

function setup(t) {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const queue = createQueue({ dir: env.queueDir });
  const worker = createWorker({
    queueDir: env.queueDir,
    trackingDir: env.trackingDir,
    logger: silentLogger,
  });
  return { env, queue, worker };
}

function enqueueShipment(queue) {
  const shipment = createShipment({
    orderId: 'ord_w1',
    carrier: 'dhl',
    trackingNumber: 'JD014600003',
  });
  queue.publish('shipment.created', { shipment });
  return shipment;
}

test('worker: a shipment.created job opens a tracking record in created status', async (t) => {
  const { queue, worker } = setup(t);
  const shipment = enqueueShipment(queue);

  const processed = await worker.drain();
  assert.equal(processed, 1, 'drain must process the single queued job');

  const record = worker.trackingStore.get(shipment.id);
  assert.ok(
    record,
    'processing shipment.created must create a tracking record keyed by shipment id'
  );
  assert.equal(
    record.status,
    'created',
    'a fresh tracking record must start in created status'
  );
  assert.equal(
    record.events.length,
    1,
    'the tracking record must open with exactly one registration event'
  );
});

test('worker: a status_updated job advances the record and appends an event', async (t) => {
  const { queue, worker } = setup(t);
  const shipment = enqueueShipment(queue);
  queue.publish('shipment.status_updated', {
    shipmentId: shipment.id,
    status: 'in_transit',
    occurredAt: '2026-10-12T09:00:00.000Z',
    location: 'Rotterdam hub',
  });

  await worker.drain();

  const record = worker.trackingStore.get(shipment.id);
  assert.equal(
    record.status,
    'in_transit',
    'a status_updated job must move the tracking record to the carrier-reported status'
  );
  assert.equal(
    record.events.at(-1).location,
    'Rotterdam hub',
    'the appended tracking event must carry the reported location'
  );
});

test('worker: a duplicate status_updated job is a no-op (idempotent redelivery)', async (t) => {
  const { queue, worker } = setup(t);
  const shipment = enqueueShipment(queue);
  const update = {
    shipmentId: shipment.id,
    status: 'in_transit',
    occurredAt: '2026-10-12T09:00:00.000Z',
  };
  queue.publish('shipment.status_updated', update);
  queue.publish('shipment.status_updated', update);

  await worker.drain();

  const record = worker.trackingStore.get(shipment.id);
  assert.equal(
    record.events.length,
    2,
    'a re-sent carrier status must not append a second event for the same status'
  );
});

test('worker: a delivery_exception job parks the shipment in exception with the reason recorded', async (t) => {
  const { queue, worker } = setup(t);
  const shipment = enqueueShipment(queue);
  queue.publish('shipment.status_updated', {
    shipmentId: shipment.id,
    status: 'in_transit',
    occurredAt: '2026-10-12T09:00:00.000Z',
  });
  queue.publish('shipment.delivery_exception', {
    shipmentId: shipment.id,
    reason: 'recipient absent',
    occurredAt: '2026-10-12T15:00:00.000Z',
  });

  await worker.drain();

  const record = worker.trackingStore.get(shipment.id);
  assert.equal(
    record.status,
    'exception',
    'a delivery_exception job must move the record into exception status'
  );
  assert.equal(
    record.events.at(-1).note,
    'recipient absent',
    'the exception event must record the carrier-reported reason'
  );
});

test('worker: a redelivered shipment.created job does not reset an advanced record', async (t) => {
  const { queue, worker } = setup(t);
  const shipment = enqueueShipment(queue);
  queue.publish('shipment.status_updated', {
    shipmentId: shipment.id,
    status: 'in_transit',
    occurredAt: '2026-10-12T09:00:00.000Z',
  });
  await worker.drain();

  queue.publish('shipment.created', { shipment });
  await worker.drain();

  const record = worker.trackingStore.get(shipment.id);
  assert.equal(
    record.status,
    'in_transit',
    'redelivering shipment.created must leave the already-advanced record untouched'
  );
});

test('worker: an unknown job type fails loudly instead of being dropped', async (t) => {
  const { queue, worker } = setup(t);
  queue.publish('shipment.teleported', { shipmentId: 'shp_x' });

  await assert.rejects(
    () => worker.processNextJob(),
    /no handler registered for job type 'shipment.teleported'/,
    'an unregistered job type must raise UnknownJobTypeError, not be silently consumed'
  );
});
