import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect } from '../collectors/ci.ts';

const PERIOD = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 0,
};

function bareRepo(): string {
  const r = mkdtempSync(join(tmpdir(), 'ci-'));
  return r;
}

function repoWithGithubWorkflow(): string {
  const r = mkdtempSync(join(tmpdir(), 'ci-'));
  const wfDir = join(r, '.github', 'workflows');
  mkdirSync(wfDir, { recursive: true });
  writeFileSync(
    join(wfDir, 'ci.yml'),
    'name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n'
  );
  return r;
}

test('ci collector: bare repo without connector → available=false with reason', () => {
  const art = collect(bareRepo(), PERIOD);
  assert.equal(art.source, 'ci');
  assert.equal(art.available, false);
  assert.ok(
    art.reason_if_absent,
    'reason_if_absent should be a non-empty string'
  );
  assert.match(art.reason_if_absent as string, /no CI/i);
});

test('ci collector: .github/workflows present, no runs → available=true, config_detected=true, runs=[]', () => {
  const art = collect(repoWithGithubWorkflow(), PERIOD);
  assert.equal(art.source, 'ci');
  assert.equal(art.available, true);
  assert.equal(art.reason_if_absent, null);
  assert.equal((art.raw as any).config_detected, true);
  assert.deepEqual((art.raw as any).runs, []);
});

test('ci collector: connector provided → available=true even with no local CI config', () => {
  const connector = { runs: [] };
  const art = collect(bareRepo(), PERIOD, connector);
  assert.equal(art.available, true);
  assert.equal(art.reason_if_absent, null);
});
