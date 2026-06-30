import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStandards } from './helpers.ts';

test('standards.toml loads and has meta', () => {
  const data = loadStandards();
  assert.equal(data.meta.monthly_bucket_days, undefined);
  assert.equal(data.meta.max_lookback_days, 90);
});
