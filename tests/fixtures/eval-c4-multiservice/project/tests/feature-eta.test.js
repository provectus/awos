'use strict';

// Delivery ETA feature tests (spec: context/spec/001-delivery-eta/).
// These are written against the intended behavior and are EXPECTED TO FAIL
// until the feature is implemented.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createGatewayServer } = require('../services/gateway-api/src/server');
const { createWorker } = require('../services/tracking-worker/src/worker');
const { createQueue } = require('../packages/shared/src/queue/in-memory-queue');
const { createShipment } = require('../packages/shared/src/models/shipment');
const { makeTempEnv } = require('./helpers/temp-env');
const { request, listen, close } = require('./helpers/http');

const API_TOKEN = 'test-token';
const silentLogger = { log() {}, warn() {}, error() {} };

function tryRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return null;
    throw err;
  }
}

test('delivery ETA: packages/shared exposes a validated EtaEstimate model', () => {
  const etaModel = tryRequire('../packages/shared/src/models/eta-estimate');
  assert.ok(
    etaModel,
    'packages/shared must expose the EtaEstimate model at packages/shared/src/models/eta-estimate.js'
  );
  assert.equal(
    typeof etaModel.createEtaEstimate,
    'function',
    'the EtaEstimate model must export a createEtaEstimate factory'
  );

  const estimate = etaModel.createEtaEstimate({
    shipmentId: 'shp_eta',
    etaIso: '2026-10-15T12:00:00.000Z',
    confidence: 0.8,
    computedAt: '2026-10-12T09:00:00.000Z',
  });
  assert.equal(
    estimate.shipmentId,
    'shp_eta',
    'createEtaEstimate must keep the shipmentId it was given'
  );
  assert.ok(
    estimate.confidence >= 0 && estimate.confidence <= 1,
    'EtaEstimate.confidence must be validated into the [0, 1] range'
  );
});

test('delivery ETA: the worker persists an EtaEstimate on the tracking record when a status update arrives', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const queue = createQueue({ dir: env.queueDir });
  const worker = createWorker({
    queueDir: env.queueDir,
    trackingDir: env.trackingDir,
    logger: silentLogger,
  });

  const shipment = createShipment({
    orderId: 'ord_eta',
    carrier: 'dhl',
    trackingNumber: 'JD014600003',
  });
  queue.publish('shipment.created', { shipment });
  queue.publish('shipment.status_updated', {
    shipmentId: shipment.id,
    status: 'in_transit',
    occurredAt: '2026-10-12T09:00:00.000Z',
    location: 'Rotterdam hub',
  });
  await worker.drain();

  const record = worker.trackingStore.get(shipment.id);
  assert.ok(
    record,
    'precondition: the status update must have been applied to a tracking record'
  );
  assert.ok(
    record.etaEstimate,
    'handling status_updated must persist an EtaEstimate onto the shipment tracking record in the tracking store (NOT in the gateway orders store)'
  );
  assert.ok(
    !Number.isNaN(Date.parse(record.etaEstimate.etaIso)),
    'the persisted EtaEstimate must carry a parseable etaIso timestamp'
  );
  assert.equal(
    typeof record.etaEstimate.confidence,
    'number',
    'the persisted EtaEstimate must carry a numeric confidence'
  );
});

test('delivery ETA: GET /orders/:orderId/eta returns { orderId, etaIso, confidence } from tracking data', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  // Gateway and worker share the queue and the tracking data directory, as
  // in production.
  const server = createGatewayServer({
    ordersDir: env.ordersDir,
    queueDir: env.queueDir,
    trackingDir: env.trackingDir,
    apiToken: API_TOKEN,
    webhookSecret: 'test-secret',
    logRequests: false,
  });
  t.after(() => close(server));
  const port = await listen(server);
  const authHeaders = { authorization: `Bearer ${API_TOKEN}` };

  const order = await request({
    port,
    method: 'POST',
    path: '/orders',
    headers: authHeaders,
    body: {
      customerEmail: 'ops@acme.example',
      items: [{ sku: 'SKU-100', quantity: 1 }],
      shippingAddress: {
        line1: '12 Harbor Way',
        city: 'Rotterdam',
        postalCode: '3011 AB',
        country: 'NL',
      },
    },
  });
  const shipment = await request({
    port,
    method: 'POST',
    path: `/orders/${order.json.id}/shipments`,
    headers: authHeaders,
    body: { carrier: 'DHL', trackingNumber: 'JD014600003' },
  });

  const worker = createWorker({
    queueDir: env.queueDir,
    trackingDir: env.trackingDir,
    logger: silentLogger,
  });
  const queue = createQueue({ dir: env.queueDir });
  queue.publish('shipment.status_updated', {
    shipmentId: shipment.json.id,
    status: 'in_transit',
    occurredAt: '2026-10-12T09:00:00.000Z',
  });
  await worker.drain();

  const res = await request({
    port,
    path: `/orders/${order.json.id}/eta`,
    headers: authHeaders,
  });
  assert.equal(
    res.statusCode,
    200,
    `GET /orders/:orderId/eta must be implemented on the gateway and answer 200 (got ${res.statusCode})`
  );
  assert.equal(
    res.json.orderId,
    order.json.id,
    'the ETA payload must echo the orderId it was computed for'
  );
  assert.ok(
    !Number.isNaN(Date.parse(res.json.etaIso)),
    'the ETA payload must carry a parseable etaIso computed from tracking events'
  );
  assert.ok(
    typeof res.json.confidence === 'number' &&
      res.json.confidence >= 0 &&
      res.json.confidence <= 1,
    'the ETA payload must carry a confidence in the [0, 1] range'
  );
});
