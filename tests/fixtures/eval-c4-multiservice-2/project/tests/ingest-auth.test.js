'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createIngestServer } = require('../services/ingest-api/src/server');
const { makeTempEnv } = require('./helpers/temp-env');
const { request, listen, close } = require('./helpers/http');

const DEVICE_KEY = 'test-device-key';
const silentLogger = { log() {}, warn() {}, error() {} };

test('ingest auth: requests without x-device-key are rejected with 401', async (t) => {
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

  const res = await request({
    port,
    method: 'POST',
    path: '/readings',
    body: { meterId: 'mtr_1', value: 1 },
  });
  assert.equal(
    res.statusCode,
    401,
    'a device call without the x-device-key header must be rejected with 401'
  );
  assert.equal(
    res.json.error.code,
    'unauthorized',
    'the rejection body must carry the unauthorized error code'
  );
});

test('ingest auth: a wrong device key is rejected, the right one accepted', async (t) => {
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

  const wrong = await request({
    port,
    method: 'POST',
    path: '/meters',
    headers: { 'x-device-key': 'nope' },
    body: { customerId: 'cus_1', serial: 'SM-1' },
  });
  assert.equal(
    wrong.statusCode,
    401,
    'a wrong x-device-key must be rejected with 401'
  );

  const right = await request({
    port,
    method: 'POST',
    path: '/meters',
    headers: { 'x-device-key': DEVICE_KEY },
    body: { customerId: 'cus_1', serial: 'SM-1' },
  });
  assert.equal(
    right.statusCode,
    201,
    'the configured device key must be accepted'
  );
});
