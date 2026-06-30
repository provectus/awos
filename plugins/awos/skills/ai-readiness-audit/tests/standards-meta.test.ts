import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStandards } from './helpers.ts';

test('standards.toml [meta] uses 90-day window and has no monthly_bucket_days', () => {
  const data = loadStandards();
  assert.equal(
    data.meta.max_lookback_days,
    90,
    'meta.max_lookback_days must be 90 (single recent window)'
  );
  assert.equal(
    data.meta.monthly_bucket_days,
    undefined,
    'meta.monthly_bucket_days must be removed (bucket machinery is gone)'
  );
});
