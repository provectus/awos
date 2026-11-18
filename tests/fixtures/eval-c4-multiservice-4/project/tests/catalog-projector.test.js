'use strict';

// The catalog's embedded projector: stock events from the shared log land in
// the stock-level read model the catalog serves over HTTP.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCatalogApi } = require('../services/catalog-api/src/server');
const {
  createEventQueue,
} = require('../packages/messaging/src/queues/event-queue');
const { makeTempEnv } = require('./helpers/temp-env');
const { request, listen, close } = require('./helpers/http');
const { silentLogger } = require('./helpers/world');

const API_KEY = 'test-catalog-key';

test('stock.reserved and stock.released project into the read model exactly', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const catalog = createCatalogApi({
    catalogDir: env.catalogDir,
    eventsDir: env.eventsDir,
    apiKey: API_KEY,
    logger: silentLogger,
    logRequests: false,
  });
  const port = await listen(catalog.server);
  t.after(() => close(catalog.server));
  const events = createEventQueue({ dir: env.eventsDir });

  events.publish({
    source: 'stock-service',
    event: 'stock.reserved',
    payload: {
      orderId: 'ord_1',
      reservationId: 'res_1',
      lines: [
        { sku: 'SKU-A', quantity: 2 },
        { sku: 'SKU-B', quantity: 3 },
      ],
    },
  });
  events.publish({
    source: 'stock-service',
    event: 'stock.released',
    payload: { orderId: 'ord_1', lines: [{ sku: 'SKU-B', quantity: 3 }] },
  });
  await catalog.projector.drain();

  const a = await request({
    port,
    path: '/stock-levels/SKU-A',
    headers: { 'x-api-key': API_KEY },
  });
  assert.equal(
    a.json.stockLevel.reserved,
    2,
    'a reservation must raise the projected reserved count'
  );
  const b = await request({
    port,
    path: '/stock-levels/SKU-B',
    headers: { 'x-api-key': API_KEY },
  });
  assert.equal(
    b.json.stockLevel.reserved,
    0,
    'a release must lower the projected reserved count back to zero'
  );
});

test('events the projector does not care about advance its cursor without touching the model', async (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const catalog = createCatalogApi({
    catalogDir: env.catalogDir,
    eventsDir: env.eventsDir,
    apiKey: API_KEY,
    logger: silentLogger,
    logRequests: false,
  });
  const events = createEventQueue({ dir: env.eventsDir });

  events.publish({
    source: 'payments-gateway',
    event: 'payment.authorized',
    payload: { orderId: 'ord_1' },
  });
  const processed = await catalog.projector.drain();
  assert.equal(
    processed,
    1,
    'the projector must consume (and skip) foreign events instead of stalling on them'
  );
  assert.equal(
    catalog.stockReadModel.get('SKU-A').reserved,
    0,
    'foreign events must not touch the read model'
  );
});
