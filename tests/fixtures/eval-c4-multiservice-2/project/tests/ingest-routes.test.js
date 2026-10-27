'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createIngestServer } = require('../services/ingest-api/src/server');
const { createFileQueue } = require('../packages/core/src/queue/file-queue');
const { makeTempEnv } = require('./helpers/temp-env');
const { request, listen, close } = require('./helpers/http');

const DEVICE_KEY = 'test-device-key';
const silentLogger = { log() {}, warn() {}, error() {} };

function startServer(env) {
  return createIngestServer({
    metersDir: env.metersDir,
    queueDir: env.queueDir,
    deviceApiKey: DEVICE_KEY,
    logger: silentLogger,
    logRequests: false,
  });
}

test('ingest routes: POST /meters registers a meter and publishes meter.registered', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const server = startServer(env);
  const port = await listen(server);
  t.after(() => close(server));

  const res = await request({
    port,
    method: 'POST',
    path: '/meters',
    headers: { 'x-device-key': DEVICE_KEY },
    body: { customerId: 'cus_1', serial: 'SM-200', tariff: 'economy7' },
  });

  assert.equal(res.statusCode, 201, 'registering a meter must return 201');
  assert.equal(
    server.metersStore.get(res.json.id).serial,
    'SM-200',
    'the registered meter must be persisted in the meters store'
  );
  const queue = createFileQueue({ dir: env.queueDir });
  const jobs = queue.peekAll();
  assert.equal(
    jobs.length,
    1,
    'registering a meter must publish exactly one queue job'
  );
  assert.equal(
    jobs[0].type,
    'meter.registered',
    'the published job must be a meter.registered event'
  );
});

test('ingest routes: POST /readings validates against the registry and publishes reading.accepted', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const server = startServer(env);
  const port = await listen(server);
  t.after(() => close(server));

  const meterRes = await request({
    port,
    method: 'POST',
    path: '/meters',
    headers: { 'x-device-key': DEVICE_KEY },
    body: { customerId: 'cus_1', serial: 'SM-200' },
  });
  const meterId = meterRes.json.id;

  const res = await request({
    port,
    method: 'POST',
    path: '/readings',
    headers: { 'x-device-key': DEVICE_KEY },
    body: { meterId, value: 1042.5, readAt: '2026-10-01T00:00:00.000Z' },
  });

  assert.equal(
    res.statusCode,
    202,
    'an accepted reading must be acknowledged with 202 (ingest does not persist it)'
  );
  const queue = createFileQueue({ dir: env.queueDir });
  const readingJobs = queue
    .peekAll()
    .filter((job) => job.type === 'reading.accepted');
  assert.equal(
    readingJobs.length,
    1,
    'an accepted reading must publish exactly one reading.accepted job'
  );
  assert.equal(
    readingJobs[0].payload.reading.customerId,
    'cus_1',
    'the published reading must be stamped with the customerId from the meter registry'
  );
});

test('ingest routes: POST /readings for an unregistered meter returns 404 and publishes nothing', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const server = startServer(env);
  const port = await listen(server);
  t.after(() => close(server));

  const res = await request({
    port,
    method: 'POST',
    path: '/readings',
    headers: { 'x-device-key': DEVICE_KEY },
    body: { meterId: 'mtr_ghost', value: 10 },
  });

  assert.equal(
    res.statusCode,
    404,
    'a reading for an unregistered meter must be rejected with 404'
  );
  const queue = createFileQueue({ dir: env.queueDir });
  assert.equal(queue.size(), 0, 'a rejected reading must not reach the queue');
});

test('ingest routes: POST /meters/:meterId/decommission flips status and publishes meter.decommissioned', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const server = startServer(env);
  const port = await listen(server);
  t.after(() => close(server));

  const meterRes = await request({
    port,
    method: 'POST',
    path: '/meters',
    headers: { 'x-device-key': DEVICE_KEY },
    body: { customerId: 'cus_1', serial: 'SM-200' },
  });
  const meterId = meterRes.json.id;

  const res = await request({
    port,
    method: 'POST',
    path: `/meters/${meterId}/decommission`,
    headers: { 'x-device-key': DEVICE_KEY },
  });

  assert.equal(res.statusCode, 200, 'decommissioning must return 200');
  assert.equal(
    server.metersStore.get(meterId).status,
    'decommissioned',
    'the meters store must record the decommissioned status'
  );
  const queue = createFileQueue({ dir: env.queueDir });
  const types = queue.peekAll().map((job) => job.type);
  assert.ok(
    types.includes('meter.decommissioned'),
    'decommissioning must publish a meter.decommissioned event'
  );

  const rejected = await request({
    port,
    method: 'POST',
    path: '/readings',
    headers: { 'x-device-key': DEVICE_KEY },
    body: { meterId, value: 99 },
  });
  assert.equal(
    rejected.statusCode,
    409,
    'readings for a decommissioned meter must be rejected with 409'
  );
});

test('ingest routes: GET /health is open and names the service', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const server = startServer(env);
  const port = await listen(server);
  t.after(() => close(server));

  const res = await request({ port, path: '/health' });
  assert.equal(res.statusCode, 200, 'health must respond 200 without auth');
  assert.equal(
    res.json.service,
    'ingest-api',
    'health must identify the ingest-api service'
  );
});
