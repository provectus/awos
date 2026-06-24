import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect } from '../collectors/docs.ts';

const PERIOD = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 0,
};

function bareRepo(): string {
  return mkdtempSync(join(tmpdir(), 'docs-'));
}

test('docs collector: no connector → available=false', () => {
  const art = collect(bareRepo(), PERIOD);
  assert.equal(art.source, 'docs');
  assert.equal(art.available, false);
  assert.ok(art.reason_if_absent, 'reason_if_absent should be non-empty');
});

test('docs collector: connector provided → available=true', () => {
  const connector = { pages: [] };
  const art = collect(bareRepo(), PERIOD, connector);
  assert.equal(art.source, 'docs');
  assert.equal(art.available, true);
  assert.equal(art.reason_if_absent, null);
});

test('docs collector: connector with pages → raw carries coverage data', () => {
  const connector = {
    pages: [{ title: 'Overview', updated_at: '2025-01-01' }],
  };
  const art = collect(bareRepo(), PERIOD, connector);
  assert.equal(art.available, true);
  assert.ok('pages' in (art.raw as any), 'raw should include pages');
});
