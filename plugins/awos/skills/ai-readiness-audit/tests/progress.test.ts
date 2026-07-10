import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progress } from '../progress.ts';

test('pct and eta midway', () => {
  const r = progress({ elapsed_seconds: 20.0, done: 2, total: 10 });
  assert.equal(r.pct, 0.2);
  assert.ok(Math.abs((r.eta_seconds as number) - 80.0) < 1e-6); // 20/2 * 8
});

test('eta null at zero', () => {
  assert.equal(
    progress({ elapsed_seconds: 0.0, done: 0, total: 10 }).eta_seconds,
    null
  );
});

test('complete', () => {
  const r = progress({ elapsed_seconds: 50.0, done: 10, total: 10 });
  assert.equal(r.pct, 1.0);
  assert.equal(r.eta_seconds, 0.0);
});
