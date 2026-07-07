import { test } from 'node:test';
import assert from 'node:assert/strict';
import {} from 'node:fs';
import { join } from 'node:path';
import { collect } from '../collectors/tracker.ts';
import { tmpDir } from './helpers.ts';

const PERIOD = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 0,
};

function bareRepo(): string {
  return tmpDir('tracker-');
}

test('tracker collector: no connector → available=false', () => {
  const art = collect(bareRepo(), PERIOD);
  assert.equal(art.source, 'tracker');
  assert.equal(art.available, false);
  assert.ok(art.reason_if_absent, 'reason_if_absent should be non-empty');
});

test('tracker collector: stub connector → available=true', () => {
  const connector = { tickets: [] };
  const art = collect(bareRepo(), PERIOD, connector);
  assert.equal(art.source, 'tracker');
  assert.equal(art.available, true);
  assert.equal(art.reason_if_absent, null);
});

test('tracker collector: no incident source → raw.incident_source is null', () => {
  const connector = { tickets: [] };
  const art = collect(bareRepo(), PERIOD, connector);
  assert.equal((art.raw as any).incident_source, null);
});

test('tracker collector: incident source in connector → raw.incident_source is set', () => {
  const connector = { tickets: [], incident_source: 'pagerduty' };
  const art = collect(bareRepo(), PERIOD, connector);
  assert.equal((art.raw as any).incident_source, 'pagerduty');
});
