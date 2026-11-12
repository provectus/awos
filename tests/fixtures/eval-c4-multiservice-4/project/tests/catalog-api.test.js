'use strict';

// The catalog API: products and variants over HTTP, behind an API key.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCatalogApi } = require('../services/catalog-api/src/server');
const { makeTempEnv } = require('./helpers/temp-env');
const { request, listen, close } = require('./helpers/http');
const { silentLogger } = require('./helpers/world');

const API_KEY = 'test-catalog-key';

async function start(t) {
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
  return { catalog, port };
}

test('products round-trip: create, fetch one, list', async (t) => {
  const { port } = await start(t);
  const created = await request({
    port,
    method: 'POST',
    path: '/products',
    headers: { 'x-api-key': API_KEY },
    body: { sku: 'SKU-A', name: 'Alpha Widget', description: 'the first' },
  });
  assert.equal(created.statusCode, 201, 'creation must answer 201');

  const fetched = await request({
    port,
    path: '/products/SKU-A',
    headers: { 'x-api-key': API_KEY },
  });
  assert.equal(
    fetched.json.product.name,
    'Alpha Widget',
    'the stored product must read back by SKU'
  );

  const listed = await request({
    port,
    path: '/products',
    headers: { 'x-api-key': API_KEY },
  });
  assert.equal(
    listed.json.products.length,
    1,
    'the listing must contain the stored product'
  );
});

test('variants attach to a product SKU and list under it', async (t) => {
  const { port } = await start(t);
  await request({
    port,
    method: 'POST',
    path: '/products',
    headers: { 'x-api-key': API_KEY },
    body: { sku: 'SKU-A', name: 'Alpha Widget' },
  });
  await request({
    port,
    method: 'POST',
    path: '/variants',
    headers: { 'x-api-key': API_KEY },
    body: { variantId: 'var_red', sku: 'SKU-A', attributes: { color: 'red' } },
  });
  await request({
    port,
    method: 'POST',
    path: '/variants',
    headers: { 'x-api-key': API_KEY },
    body: { variantId: 'var_blu', sku: 'SKU-B', attributes: { color: 'blue' } },
  });

  const listed = await request({
    port,
    path: '/products/SKU-A/variants',
    headers: { 'x-api-key': API_KEY },
  });
  assert.equal(
    listed.json.variants.length,
    1,
    'only the variants of the asked SKU may list under it'
  );
  assert.equal(listed.json.variants[0].variantId, 'var_red');
});

test('requests without the api key are rejected; health stays open', async (t) => {
  const { port } = await start(t);
  const denied = await request({ port, path: '/products' });
  assert.equal(denied.statusCode, 401, 'a missing api key must be a 401');
  const health = await request({ port, path: '/health' });
  assert.equal(
    health.statusCode,
    200,
    'the health probe must not require a key'
  );
});

test('an unknown product is a 404 with a serialized error body', async (t) => {
  const { port } = await start(t);
  const missing = await request({
    port,
    path: '/products/SKU-GHOST',
    headers: { 'x-api-key': API_KEY },
  });
  assert.equal(missing.statusCode, 404, 'an unknown SKU must be a 404');
  assert.equal(
    missing.json.error,
    'NotFoundError',
    'the error body must name the error kind'
  );
});

test('invalid product payloads are a 400, not a crash', async (t) => {
  const { port } = await start(t);
  const bad = await request({
    port,
    method: 'POST',
    path: '/products',
    headers: { 'x-api-key': API_KEY },
    body: { name: 'No SKU' },
  });
  assert.equal(bad.statusCode, 400, 'a payload missing its SKU must be a 400');
});
