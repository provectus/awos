'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createEngine } = require('../services/billing-engine/src/engine');
const { createFileQueue } = require('../packages/core/src/queue/file-queue');
const { createReading } = require('../packages/core/src/models/reading');
const { makeTempEnv } = require('./helpers/temp-env');

const silentLogger = { log() {}, warn() {}, error() {} };

function makeEngine(env) {
  return createEngine({
    queueDir: env.queueDir,
    readingsDir: env.readingsDir,
    invoicesDir: env.invoicesDir,
    logger: silentLogger,
  });
}

function reading(meterId, customerId, value, readAt) {
  return createReading({ meterId, customerId, value, readAt });
}

test('billing handlers: reading.accepted persists the reading into the readings store', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const queue = createFileQueue({ dir: env.queueDir });
  const engine = makeEngine(env);

  const r = reading('mtr_1', 'cus_1', 1000, '2026-10-01T00:00:00.000Z');
  queue.publish('reading.accepted', { reading: r });
  const processed = await engine.drain();

  assert.equal(processed, 1, 'drain must report one processed job');
  const stored = engine.readingsStore.get(r.id);
  assert.ok(
    stored,
    'handling reading.accepted must write the reading into the billing readings store'
  );
  assert.equal(
    stored.value,
    1000,
    'the persisted reading must keep its register value'
  );
});

test('billing handlers: redelivering the same reading.accepted job is a no-op', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const queue = createFileQueue({ dir: env.queueDir });
  const engine = makeEngine(env);

  const r = reading('mtr_1', 'cus_1', 1000, '2026-10-01T00:00:00.000Z');
  queue.publish('reading.accepted', { reading: r });
  queue.publish('reading.accepted', { reading: r });
  await engine.drain();

  assert.equal(
    engine.readingsStore.listForMeter('mtr_1').length,
    1,
    'a redelivered reading must not create a duplicate record (idempotent handler)'
  );
});

test('billing handlers: cycle.close computes usage from the window and writes one invoice', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const queue = createFileQueue({ dir: env.queueDir });
  const engine = makeEngine(env);

  queue.publish('reading.accepted', {
    reading: reading('mtr_1', 'cus_1', 1000, '2026-10-01T00:00:00.000Z'),
  });
  queue.publish('reading.accepted', {
    reading: reading('mtr_1', 'cus_1', 1050, '2026-10-31T00:00:00.000Z'),
  });
  queue.publish('cycle.close', {
    customerId: 'cus_1',
    periodStart: '2026-10-01T00:00:00.000Z',
    periodEnd: '2026-10-31T23:59:59.000Z',
    tariff: 'standard',
  });
  await engine.drain();

  const invoices = engine.invoicesStore.listForCustomer('cus_1');
  assert.equal(
    invoices.length,
    1,
    'closing a cycle must issue exactly one invoice for the customer'
  );
  assert.equal(
    invoices[0].usageKwh,
    50,
    'cycle usage must be last-register minus first-register inside the window'
  );
  assert.equal(
    invoices[0].amountCents,
    50 * 32,
    'the invoice amount must price usage with the standard tariff rate'
  );
});

test('billing handlers: cycle.close ignores readings outside the billing window', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const queue = createFileQueue({ dir: env.queueDir });
  const engine = makeEngine(env);

  queue.publish('reading.accepted', {
    reading: reading('mtr_1', 'cus_1', 900, '2026-09-15T00:00:00.000Z'),
  });
  queue.publish('reading.accepted', {
    reading: reading('mtr_1', 'cus_1', 1000, '2026-10-01T00:00:00.000Z'),
  });
  queue.publish('reading.accepted', {
    reading: reading('mtr_1', 'cus_1', 1030, '2026-10-20T00:00:00.000Z'),
  });
  queue.publish('cycle.close', {
    customerId: 'cus_1',
    periodStart: '2026-10-01T00:00:00.000Z',
    periodEnd: '2026-10-31T23:59:59.000Z',
  });
  await engine.drain();

  const [invoice] = engine.invoicesStore.listForCustomer('cus_1');
  assert.equal(
    invoice.usageKwh,
    30,
    'the September reading must not leak into the October cycle usage'
  );
});

test('billing handlers: unknown job types are acknowledged without crashing the engine', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const queue = createFileQueue({ dir: env.queueDir });
  const engine = makeEngine(env);

  queue.publish('meter.registered', { meter: { id: 'mtr_1' } });
  const processed = await engine.drain();
  assert.equal(
    processed,
    1,
    'a job type without a handler must still be consumed from the queue'
  );
  assert.equal(
    engine.invoicesStore.list().length,
    0,
    'informational lifecycle events must not produce invoices'
  );
});
