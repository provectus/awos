'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createGatewayServer } = require('../services/gateway-api/src/server');
const { createQueue } = require('../packages/shared/src/queue/in-memory-queue');
const { makeTempEnv } = require('./helpers/temp-env');
const { request, listen, close } = require('./helpers/http');

const API_TOKEN = 'test-token';
const WEBHOOK_SECRET = 'test-secret';
const authHeaders = { authorization: `Bearer ${API_TOKEN}` };

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

const validOrderBody = {
  customerEmail: 'ops@acme.example',
  items: [{ sku: 'SKU-100', quantity: 2 }],
  shippingAddress: {
    line1: '12 Harbor Way',
    city: 'Rotterdam',
    postalCode: '3011 AB',
    country: 'NL',
  },
};

test('gateway: GET /health answers 200 without authentication', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startGateway(t, env);

  const res = await request({ port, path: '/health' });
  assert.equal(res.statusCode, 200, '/health must be publicly reachable');
  assert.equal(
    res.json.status,
    'ok',
    '/health must report status ok when the service is up'
  );
});

test('gateway: POST /orders creates an order and GET /orders/:id reads it back', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startGateway(t, env);

  const created = await request({
    port,
    method: 'POST',
    path: '/orders',
    headers: authHeaders,
    body: validOrderBody,
  });
  assert.equal(created.statusCode, 201, 'POST /orders must answer 201 Created');
  assert.match(
    created.json.id,
    /^ord_/,
    'the created order must carry an ord_-prefixed id'
  );

  const fetched = await request({
    port,
    path: `/orders/${created.json.id}`,
    headers: authHeaders,
  });
  assert.equal(
    fetched.statusCode,
    200,
    'GET /orders/:id must find the order that was just created'
  );
  assert.equal(
    fetched.json.customerEmail,
    validOrderBody.customerEmail,
    'the stored order must round-trip its customerEmail'
  );
});

test('gateway: POST /orders with no items answers 400 with a named error code', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startGateway(t, env);

  const res = await request({
    port,
    method: 'POST',
    path: '/orders',
    headers: authHeaders,
    body: { ...validOrderBody, items: [] },
  });
  assert.equal(res.statusCode, 400, 'an invalid order must be rejected as 400');
  assert.equal(
    res.json.error.code,
    'bad_request',
    'validation failures must surface the bad_request error code'
  );
});

test('gateway: GET /orders/:id for an unknown order answers 404', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startGateway(t, env);

  const res = await request({
    port,
    path: '/orders/ord_nope',
    headers: authHeaders,
  });
  assert.equal(res.statusCode, 404, 'unknown orders must answer 404');
  assert.equal(
    res.json.error.code,
    'not_found',
    'unknown orders must surface the not_found error code'
  );
});

test('gateway: POST /orders/:id/shipments publishes a shipment.created job to the queue', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startGateway(t, env);

  const order = await request({
    port,
    method: 'POST',
    path: '/orders',
    headers: authHeaders,
    body: validOrderBody,
  });
  const shipment = await request({
    port,
    method: 'POST',
    path: `/orders/${order.json.id}/shipments`,
    headers: authHeaders,
    body: { carrier: 'DHL', trackingNumber: 'JD014600003' },
  });
  assert.equal(
    shipment.statusCode,
    201,
    'registering a shipment on an existing order must answer 201'
  );

  const queue = createQueue({ dir: env.queueDir });
  const job = queue.take();
  assert.equal(
    job?.type,
    'shipment.created',
    'registering a shipment must enqueue exactly one shipment.created job'
  );
  assert.equal(
    job.payload.shipment.id,
    shipment.json.id,
    'the queued job must carry the shipment the API returned'
  );
  assert.equal(queue.size(), 0, 'no other jobs must be enqueued');
});

test('gateway: POST /webhooks/carrier translates a status callback into a status_updated job', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startGateway(t, env);

  const res = await request({
    port,
    method: 'POST',
    path: '/webhooks/carrier',
    headers: { 'x-shiplog-webhook-secret': WEBHOOK_SECRET },
    body: {
      shipmentId: 'shp_hook',
      status: 'in_transit',
      occurredAt: '2026-10-12T09:00:00.000Z',
      location: 'Rotterdam hub',
    },
  });
  assert.equal(
    res.statusCode,
    202,
    'a valid carrier webhook must be acknowledged with 202'
  );

  const queue = createQueue({ dir: env.queueDir });
  const job = queue.take();
  assert.equal(
    job?.type,
    'shipment.status_updated',
    'a non-exception carrier callback must enqueue a shipment.status_updated job'
  );
  assert.equal(
    job.payload.location,
    'Rotterdam hub',
    'the queued job must preserve the carrier-reported location'
  );
});

test('gateway: an exception webhook enqueues a delivery_exception job instead', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startGateway(t, env);

  await request({
    port,
    method: 'POST',
    path: '/webhooks/carrier',
    headers: { 'x-shiplog-webhook-secret': WEBHOOK_SECRET },
    body: {
      shipmentId: 'shp_hook',
      status: 'exception',
      reason: 'address not found',
      occurredAt: '2026-10-12T09:00:00.000Z',
    },
  });

  const queue = createQueue({ dir: env.queueDir });
  const job = queue.take();
  assert.equal(
    job?.type,
    'shipment.delivery_exception',
    'an exception callback must enqueue a shipment.delivery_exception job'
  );
  assert.equal(
    job.payload.reason,
    'address not found',
    'the queued exception job must carry the carrier-reported reason'
  );
});
