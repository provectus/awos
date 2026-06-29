import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectCiConfigPath, CI_DIRS, CI_FILES } from './ci_platforms.ts';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'ci-'));
}

test('detects GitHub Actions workflows dir', () => {
  const d = tmp();
  mkdirSync(join(d, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(d, '.github', 'workflows', 'ci.yml'), 'on: push\n');
  assert.equal(detectCiConfigPath(d), '.github/workflows');
  rmSync(d, { recursive: true });
});

test('detects GitLab CI file', () => {
  const d = tmp();
  writeFileSync(join(d, '.gitlab-ci.yml'), 'stages: [build]\n');
  assert.equal(detectCiConfigPath(d), '.gitlab-ci.yml');
  rmSync(d, { recursive: true });
});

test('detects Woodpecker and Concourse', () => {
  const d1 = tmp();
  writeFileSync(join(d1, '.woodpecker.yml'), 'steps: {}');
  assert.equal(detectCiConfigPath(d1), '.woodpecker.yml');
  rmSync(d1, { recursive: true });

  const d2 = tmp();
  mkdirSync(join(d2, '.concourse'), { recursive: true });
  writeFileSync(join(d2, '.concourse', 'pipeline.yml'), 'jobs: []\n');
  assert.equal(detectCiConfigPath(d2), '.concourse');
  rmSync(d2, { recursive: true });
});

test('returns null when no CI config found', () => {
  const d = tmp();
  writeFileSync(join(d, 'README.md'), '# project\n');
  assert.equal(detectCiConfigPath(d), null);
  rmSync(d, { recursive: true });
});

test('an empty CI directory is not treated as CI', () => {
  const d = tmp();
  mkdirSync(join(d, '.github', 'workflows'), { recursive: true });
  assert.equal(
    detectCiConfigPath(d),
    null,
    'an empty .github/workflows/ must not register as CI'
  );
  rmSync(d, { recursive: true });
});

test('CI_DIRS includes .concourse and .woodpecker', () => {
  assert.ok(CI_DIRS.includes('.concourse'), 'CI_DIRS must include .concourse');
  assert.ok(
    CI_DIRS.includes('.woodpecker'),
    'CI_DIRS must include .woodpecker'
  );
});

test('CI_FILES includes .woodpecker.yml and ci/pipeline.yml', () => {
  assert.ok(
    CI_FILES.includes('.woodpecker.yml'),
    'CI_FILES must include .woodpecker.yml'
  );
  assert.ok(
    CI_FILES.includes('.woodpecker.yaml'),
    'CI_FILES must include .woodpecker.yaml'
  );
  assert.ok(
    CI_FILES.includes('ci/pipeline.yml'),
    'CI_FILES must include ci/pipeline.yml'
  );
  assert.ok(
    CI_FILES.includes('ci/pipeline.yaml'),
    'CI_FILES must include ci/pipeline.yaml'
  );
});
