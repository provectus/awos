'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createPortalServer } = require('../services/portal-api/src/server');
const {
  createReadingsStore,
} = require('../services/billing-engine/src/store/readings-store');
const {
  createInvoicesStore,
} = require('../services/billing-engine/src/store/invoices-store');
const { createReading } = require('../packages/core/src/models/reading');
const { createInvoice } = require('../packages/core/src/models/invoice');
const { makeTempEnv } = require('./helpers/temp-env');
const { request, listen, close } = require('./helpers/http');

const PORTAL_KEY = 'test-portal-key';

// The portal reads the billing engine's store directories directly, so the
// tests seed those stores with the billing-side writers and then query the
// portal over HTTP — exactly the production read path.

async function startPortal(t, env) {
  const server = createPortalServer({
    readingsDir: env.readingsDir,
    invoicesDir: env.invoicesDir,
    portalApiKey: PORTAL_KEY,
  });
  const port = await listen(server);
  t.after(() => close(server));
  return port;
}

test('portal routes: GET /usage/:customerId returns readings grouped per meter from the shared store', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const readingsStore = createReadingsStore({ dir: env.readingsDir });
  readingsStore.save(
    createReading({
      meterId: 'mtr_1',
      customerId: 'cus_1',
      value: 1000,
      readAt: '2026-10-01T00:00:00.000Z',
    })
  );
  readingsStore.save(
    createReading({
      meterId: 'mtr_1',
      customerId: 'cus_1',
      value: 1050,
      readAt: '2026-10-31T00:00:00.000Z',
    })
  );

  const port = await startPortal(t, env);
  const res = await request({
    port,
    path: '/usage/cus_1',
    headers: { 'x-portal-key': PORTAL_KEY },
  });

  assert.equal(res.statusCode, 200, 'usage lookup must return 200');
  assert.equal(res.json.meters.length, 1, 'usage must be grouped per meter');
  assert.equal(
    res.json.meters[0].points.length,
    2,
    'every reading seeded in the billing store must surface as a usage point'
  );
  assert.equal(
    res.json.meters[0].points[0].value,
    1000,
    'usage points must come back in readAt order'
  );
});

test('portal routes: GET /usage/:customerId is 404 when the customer has no readings', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startPortal(t, env);

  const res = await request({
    port,
    path: '/usage/cus_ghost',
    headers: { 'x-portal-key': PORTAL_KEY },
  });
  assert.equal(
    res.statusCode,
    404,
    'a customer with no recorded readings must get a 404, not an empty series'
  );
});

test('portal routes: GET /invoices/:customerId serializes billing invoices with display formatting', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);

  const invoicesStore = createInvoicesStore({ dir: env.invoicesDir });
  invoicesStore.save(
    createInvoice({
      customerId: 'cus_1',
      periodStart: '2026-10-01T00:00:00.000Z',
      periodEnd: '2026-10-31T23:59:59.000Z',
      usageKwh: 50,
      tariff: 'economy7',
      amountCents: 1200,
    })
  );

  const port = await startPortal(t, env);
  const res = await request({
    port,
    path: '/invoices/cus_1',
    headers: { 'x-portal-key': PORTAL_KEY },
  });

  assert.equal(res.statusCode, 200, 'invoice listing must return 200');
  assert.equal(
    res.json.invoices.length,
    1,
    'every invoice the billing engine issued must be listed'
  );
  assert.equal(
    res.json.invoices[0].display.tariff,
    'Economy 7',
    'the portal must format the tariff code into its display name'
  );
  assert.equal(
    res.json.invoices[0].display.amount,
    '€12.00',
    'the portal must format the invoice amount as a currency string'
  );
});

test('portal routes: requests without x-portal-key are rejected with 401', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startPortal(t, env);

  const res = await request({ port, path: '/usage/cus_1' });
  assert.equal(
    res.statusCode,
    401,
    'a portal call without the x-portal-key header must be rejected with 401'
  );
});

test('portal routes: GET /health is open and names the service', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const port = await startPortal(t, env);

  const res = await request({ port, path: '/health' });
  assert.equal(res.statusCode, 200, 'health must respond 200 without auth');
  assert.equal(
    res.json.service,
    'portal-api',
    'health must identify the portal-api service'
  );
});
