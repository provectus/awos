import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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

test('ci collector: .github/workflows present, no runs → available=false + config detected reason', () => {
  const art = collect(repoWithGithubWorkflow(), PERIOD);
  assert.equal(art.source, 'ci');
  assert.equal(art.available, false);
  assert.match(
    art.reason_if_absent as string,
    /config detected/i,
    'reason must mention "config detected"'
  );
  assert.equal((art.raw as any).config_detected, true);
  assert.deepEqual((art.raw as any).runs, []);
});

test('ci collector: connector with actual runs → available=true even with no local CI config', () => {
  const connector = { runs: [{ conclusion: 'success' }] };
  const art = collect(bareRepo(), PERIOD, connector);
  assert.equal(art.available, true);
  assert.equal(art.reason_if_absent, null);
});

// Regression: the gate previously only knew GitHub Actions / GitLab / Jenkins,
// so CircleCI- and Azure-only repos were misreported as "no CI". The canonical
// platform list (ci_platforms.ts) now covers them — these pin that.
function repoWithDir(dir: string): string {
  const r = mkdtempSync(join(tmpdir(), 'ci-'));
  const d = join(r, ...dir.split('/'));
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'config.yml'), 'jobs: {}\n');
  return r;
}

function repoWithFile(name: string): string {
  const r = mkdtempSync(join(tmpdir(), 'ci-'));
  writeFileSync(join(r, name), 'pipeline: {}\n');
  return r;
}

for (const dir of [
  '.circleci',
  '.azure-pipelines',
  '.buildkite',
  '.teamcity',
]) {
  test(`ci collector: ${dir}/ directory → available=false + config detected reason`, () => {
    const art = collect(repoWithDir(dir), PERIOD);
    assert.equal(
      art.available,
      false,
      `${dir} config-only must be available=false (no run history)`
    );
    assert.match(
      art.reason_if_absent as string,
      /config detected/i,
      `${dir} reason must mention "config detected"`
    );
    assert.equal((art.raw as any).config_detected, true);
  });
}

for (const file of [
  'azure-pipelines.yml',
  '.gitlab-ci.yaml',
  '.travis.yml',
  'bitbucket-pipelines.yml',
]) {
  test(`ci collector: ${file} root file → available=false + config detected reason`, () => {
    const art = collect(repoWithFile(file), PERIOD);
    assert.equal(
      art.available,
      false,
      `${file} config-only must be available=false (no run history)`
    );
    assert.match(
      art.reason_if_absent as string,
      /config detected/i,
      `${file} reason must mention "config detected"`
    );
    assert.equal((art.raw as any).config_detected, true);
  });
}

// ---------------------------------------------------------------------------
// TDD-RED: new behaviour — config-only (no runs) must be available:false
// ---------------------------------------------------------------------------

test('ci collector: config-only (no runs, no connector) → available:false + reason contains "config detected"', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-ci-'));
  try {
    mkdirSync(join(repo, '.azure-pipelines'), { recursive: true });
    writeFileSync(join(repo, '.azure-pipelines', 'ci.yml'), 'steps: []\n');
    const art = collect(repo, PERIOD);
    assert.equal(
      art.available,
      false,
      'config-only CI must be available:false'
    );
    assert.match(String(art.reason_if_absent), /config detected/i);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('ci collector: connector with actual run records → available:true', () => {
  const repo = mkdtempSync(join(tmpdir(), 'awos-ci2-'));
  try {
    const art = collect(repo, PERIOD, { runs: [{ conclusion: 'success' }] });
    assert.equal(art.available, true, 'runs present → available:true');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
