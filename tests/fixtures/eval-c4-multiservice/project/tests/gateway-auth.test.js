'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createGatewayServer } = require('../services/gateway-api/src/server');
const { makeTempEnv } = require('./helpers/temp-env');
const { request, listen, close } = require('./helpers/http');

const API_TOKEN = 'test-token';
const WEBHOOK_SECRET = 'test-secret';

function startGateway(t, env) {
  const server = createGatewayServer({
    ordersDir: env.ordersDir,
    queueDir: env.queueDir,
    apiToken: API_TOKEN,
    webhookSecret: WEBHOOK_SECRET,
    logRequests: false,
  });
  t.after(() => close(server));
  return listen(server);
}

test('auth: API routes reject a request without a bearer token', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startGateway(t, env);

  const res = await request({ port, path: '/orders/ord_x' });
  assert.equal(
    res.statusCode,
    401,
    'API routes must answer 401 when no Authorization header is sent'
  );
  assert.equal(
    res.json.error.code,
    'unauthorized',
    'the 401 body must carry the unauthorized error code'
  );
});

test('auth: API routes reject a wrong bearer token', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startGateway(t, env);

  const res = await request({
    port,
    path: '/orders/ord_x',
    headers: { authorization: 'Bearer wrong-token' },
  });
  assert.equal(
    res.statusCode,
    401,
    'a wrong bearer token must be rejected with 401, never 404'
  );
});

test('auth: webhooks authenticate with the shared secret header, not the bearer token', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startGateway(t, env);

  const withBearer = await request({
    port,
    method: 'POST',
    path: '/webhooks/carrier',
    headers: { authorization: `Bearer ${API_TOKEN}` },
    body: {
      shipmentId: 'shp_x',
      status: 'in_transit',
      occurredAt: '2026-10-12T09:00:00.000Z',
    },
  });
  assert.equal(
    withBearer.statusCode,
    401,
    'a bearer token must not authenticate a carrier webhook'
  );

  const withSecret = await request({
    port,
    method: 'POST',
    path: '/webhooks/carrier',
    headers: { 'x-shiplog-webhook-secret': WEBHOOK_SECRET },
    body: {
      shipmentId: 'shp_x',
      status: 'in_transit',
      occurredAt: '2026-10-12T09:00:00.000Z',
    },
  });
  assert.equal(
    withSecret.statusCode,
    202,
    'the correct x-shiplog-webhook-secret header must authenticate the webhook'
  );
});

test('auth: /health stays reachable while everything else is locked down', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startGateway(t, env);

  const res = await request({ port, path: '/health' });
  assert.equal(
    res.statusCode,
    200,
    '/health must be exempt from authentication for load-balancer probes'
  );
});
