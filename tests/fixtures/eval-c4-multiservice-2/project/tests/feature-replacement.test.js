'use strict';

// Meter replacement continuity feature tests
// (spec: context/spec/001-meter-replacement/). These are written against the
// intended behavior and are EXPECTED TO FAIL until the feature is implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createIngestServer } = require('../services/ingest-api/src/server');
const { createEngine } = require('../services/billing-engine/src/engine');
const { createPortalServer } = require('../services/portal-api/src/server');
const { createFileQueue } = require('../packages/core/src/queue/file-queue');
const {
  createReadingsStore,
} = require('../services/billing-engine/src/store/readings-store');
const { createMeter } = require('../packages/core/src/models/meter');
const { createReading } = require('../packages/core/src/models/reading');
const { makeTempEnv } = require('./helpers/temp-env');
const { request, listen, close } = require('./helpers/http');

const DEVICE_KEY = 'test-device-key';
const PORTAL_KEY = 'test-portal-key';
const silentLogger = { log() {}, warn() {}, error() {} };

function tryRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return null;
    throw err;
  }
}

function reading(meterId, customerId, value, readAt) {
  return createReading({ meterId, customerId, value, readAt });
}

test('meter replacement: packages/core exposes a validated ReplacementLink model', () => {
  const linkModel = tryRequire('../packages/core/src/models/replacement-link');
  assert.ok(
    linkModel,
    'packages/core must expose the ReplacementLink model at packages/core/src/models/replacement-link.js'
  );
  assert.equal(
    typeof linkModel.createReplacementLink,
    'function',
    'the ReplacementLink model must export a createReplacementLink factory'
  );

  const link = linkModel.createReplacementLink({
    oldMeterId: 'mtr_old',
    newMeterId: 'mtr_new',
    customerId: 'cus_1',
    swapReadingValue: 1040,
    swappedAt: '2026-10-15T00:00:00.000Z',
  });
  assert.equal(
    link.kind,
    'continuity_link',
    'a replacement link must carry kind=continuity_link so the readings store can distinguish it from readings'
  );
  assert.equal(
    link.swapReadingValue,
    1040,
    'the link must keep the final register value of the old meter at swap time'
  );
});

test('meter replacement: POST /meters/:meterId/replacement records the successor and publishes meter.replaced', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const server = createIngestServer({
    metersDir: env.metersDir,
    queueDir: env.queueDir,
    deviceApiKey: DEVICE_KEY,
    logger: silentLogger,
    logRequests: false,
  });
  const port = await listen(server);
  t.after(() => close(server));

  const oldMeter = createMeter({ customerId: 'cus_1', serial: 'SM-OLD' });
  const newMeter = createMeter({ customerId: 'cus_1', serial: 'SM-NEW' });
  server.metersStore.save(oldMeter);
  server.metersStore.save(newMeter);

  const res = await request({
    port,
    method: 'POST',
    path: `/meters/${oldMeter.id}/replacement`,
    headers: { 'x-device-key': DEVICE_KEY },
    body: { newMeterId: newMeter.id, swapReadingValue: 1040 },
  });

  assert.equal(
    res.statusCode,
    201,
    'POST /meters/:meterId/replacement must exist on the ingest API and answer 201'
  );
  assert.equal(
    server.metersStore.get(oldMeter.id).replacedBy,
    newMeter.id,
    'the meters store must record the successor meter id (replacedBy) on the original meter'
  );

  const queue = createFileQueue({ dir: env.queueDir });
  const replacedJobs = queue
    .peekAll()
    .filter((job) => job.type === 'meter.replaced');
  assert.equal(
    replacedJobs.length,
    1,
    'recording a replacement must publish exactly one meter.replaced event to the shared queue'
  );
  assert.equal(
    replacedJobs[0].payload.swapReadingValue,
    1040,
    'the meter.replaced event must carry the swap reading value for the billing engine'
  );
});

test('meter replacement: the billing engine persists the continuity link in the READINGS store (not invoices, not meters)', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const queue = createFileQueue({ dir: env.queueDir });
  const engine = createEngine({
    queueDir: env.queueDir,
    readingsDir: env.readingsDir,
    invoicesDir: env.invoicesDir,
    logger: silentLogger,
  });

  queue.publish('meter.replaced', {
    oldMeterId: 'mtr_old',
    newMeterId: 'mtr_new',
    customerId: 'cus_1',
    swapReadingValue: 1040,
    swappedAt: '2026-10-15T00:00:00.000Z',
  });
  await engine.drain();

  const links = engine.readingsStore
    .list()
    .filter((record) => record.kind === 'continuity_link');
  assert.equal(
    links.length,
    1,
    'handling meter.replaced must persist one continuity_link record in the billing readings store'
  );
  assert.equal(
    links[0].oldMeterId,
    'mtr_old',
    'the continuity link must reference the original meter'
  );
  assert.equal(
    links[0].newMeterId,
    'mtr_new',
    'the continuity link must reference the successor meter'
  );
  assert.equal(
    engine.invoicesStore.list().length,
    0,
    'continuity links must NOT be written to the invoices store'
  );
});

test('meter replacement: cycle.close stitches usage across the replacement without double-counting the swap reading', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const queue = createFileQueue({ dir: env.queueDir });
  const engine = createEngine({
    queueDir: env.queueDir,
    readingsDir: env.readingsDir,
    invoicesDir: env.invoicesDir,
    logger: silentLogger,
  });

  // Old meter: registers 1000 -> 1020 in stored readings; final register at
  // swap time is 1040, known only from the replacement link.
  queue.publish('reading.accepted', {
    reading: reading('mtr_old', 'cus_1', 1000, '2026-10-01T00:00:00.000Z'),
  });
  queue.publish('reading.accepted', {
    reading: reading('mtr_old', 'cus_1', 1020, '2026-10-10T00:00:00.000Z'),
  });
  queue.publish('meter.replaced', {
    oldMeterId: 'mtr_old',
    newMeterId: 'mtr_new',
    customerId: 'cus_1',
    swapReadingValue: 1040,
    swappedAt: '2026-10-15T00:00:00.000Z',
  });
  // New meter: registers 10 -> 30 after the swap.
  queue.publish('reading.accepted', {
    reading: reading('mtr_new', 'cus_1', 10, '2026-10-15T01:00:00.000Z'),
  });
  queue.publish('reading.accepted', {
    reading: reading('mtr_new', 'cus_1', 30, '2026-10-29T00:00:00.000Z'),
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
    'the replaced customer must still receive exactly one invoice for the cycle'
  );
  assert.equal(
    invoices[0].usageKwh,
    60,
    'cycle usage must span the replacement: old-meter usage up to swapReadingValue (1040 - 1000 = 40) plus new-meter usage (30 - 10 = 20), with the swap reading counted exactly once'
  );
});

test('meter replacement: GET /usage/:customerId returns one continuous series spanning the replacement', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const readingsStore = createReadingsStore({ dir: env.readingsDir });
  readingsStore.save(
    reading('mtr_old', 'cus_1', 1000, '2026-10-01T00:00:00.000Z')
  );
  readingsStore.save(
    reading('mtr_old', 'cus_1', 1020, '2026-10-10T00:00:00.000Z')
  );
  readingsStore.save({
    id: 'lnk_test',
    kind: 'continuity_link',
    oldMeterId: 'mtr_old',
    newMeterId: 'mtr_new',
    customerId: 'cus_1',
    swapReadingValue: 1040,
    swappedAt: '2026-10-15T00:00:00.000Z',
  });
  readingsStore.save(
    reading('mtr_new', 'cus_1', 10, '2026-10-15T01:00:00.000Z')
  );
  readingsStore.save(
    reading('mtr_new', 'cus_1', 30, '2026-10-29T00:00:00.000Z')
  );

  const server = createPortalServer({
    readingsDir: env.readingsDir,
    invoicesDir: env.invoicesDir,
    portalApiKey: PORTAL_KEY,
  });
  const port = await listen(server);
  t.after(() => close(server));

  const res = await request({
    port,
    path: '/usage/cus_1',
    headers: { 'x-portal-key': PORTAL_KEY },
  });

  assert.equal(res.statusCode, 200, 'usage lookup must still return 200');
  assert.ok(
    Array.isArray(res.json.series),
    'the usage payload must expose a single continuous `series` array once the view resolves the continuity link'
  );
  assert.equal(
    res.json.series.length,
    4,
    'the continuous series must contain every reading from both the old and the new meter'
  );
  const readAts = res.json.series.map((p) => p.readAt);
  assert.deepEqual(
    readAts,
    [...readAts].sort(),
    'the continuous series must be ordered chronologically across the meter swap'
  );
  const meterIds = new Set(res.json.series.map((p) => p.meterId));
  assert.ok(
    meterIds.has('mtr_old') && meterIds.has('mtr_new'),
    'each series point must say which physical meter produced it, spanning both meters'
  );
});
