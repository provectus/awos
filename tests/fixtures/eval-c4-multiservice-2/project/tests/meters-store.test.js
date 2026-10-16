'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  createMetersStore,
} = require('../services/ingest-api/src/store/meters-store');
const { createMeter } = require('../packages/core/src/models/meter');
const { makeTempEnv } = require('./helpers/temp-env');

test('meters store: save persists one JSON file per meter and get round-trips it', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const store = createMetersStore({ dir: env.metersDir });

  const meter = createMeter({ customerId: 'cus_1', serial: 'SM-1' });
  store.save(meter);

  const files = fs
    .readdirSync(env.metersDir)
    .filter((n) => n.endsWith('.json'));
  assert.equal(
    files.length,
    1,
    'saving a meter must materialize exactly one JSON file in the store dir'
  );
  assert.equal(
    store.get(meter.id).serial,
    'SM-1',
    'get must round-trip the meter that was saved'
  );
});

test('meters store: get returns null for an unknown meter instead of throwing', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const store = createMetersStore({ dir: env.metersDir });
  assert.equal(
    store.get('mtr_ghost'),
    null,
    'an unknown meter id must yield null so callers can 404 cleanly'
  );
});

test('meters store: list returns meters ordered by installedAt', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const store = createMetersStore({ dir: env.metersDir });

  store.save(
    createMeter({
      customerId: 'cus_1',
      serial: 'SM-B',
      installedAt: '2026-02-01T00:00:00.000Z',
    })
  );
  store.save(
    createMeter({
      customerId: 'cus_1',
      serial: 'SM-A',
      installedAt: '2026-01-01T00:00:00.000Z',
    })
  );

  const serials = store.list().map((m) => m.serial);
  assert.deepEqual(
    serials,
    ['SM-A', 'SM-B'],
    'list must order meters by installation date ascending'
  );
});

test('meters store: writes go through a temp file so no .tmp litter survives', (t) => {
  const env = makeTempEnv();
  t.after(env.cleanup);
  const store = createMetersStore({ dir: env.metersDir });
  store.save(createMeter({ customerId: 'cus_1', serial: 'SM-1' }));
  const tmpFiles = fs
    .readdirSync(env.metersDir)
    .filter((n) => n.endsWith('.tmp'));
  assert.equal(
    tmpFiles.length,
    0,
    'the temp-file-plus-rename write protocol must leave no .tmp files behind'
  );
});
