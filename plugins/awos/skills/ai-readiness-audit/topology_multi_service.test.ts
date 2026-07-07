import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { computeTopology } from './topology.ts';
import { tmpDir } from './tests/helpers.ts';

test('a single FastAPI app with one Dockerfile is NOT multi-service', () => {
  const repo = tmpDir('awos-single-');
  try {
    writeFileSync(
      join(repo, 'main.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );
    writeFileSync(join(repo, 'Dockerfile'), 'FROM python\n');
    assert.equal(computeTopology(repo).is_multi_service, false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a compose file with 2+ services IS multi-service', () => {
  const repo = tmpDir('awos-multi-');
  try {
    writeFileSync(
      join(repo, 'docker-compose.yml'),
      'services:\n  api:\n    image: a\n  worker:\n    image: b\n'
    );
    assert.equal(computeTopology(repo).is_multi_service, true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a compose file with exactly 1 service is NOT multi-service', () => {
  const repo = tmpDir('awos-one-');
  try {
    writeFileSync(
      join(repo, 'docker-compose.yml'),
      'services:\n  api:\n    image: nginx\n'
    );
    assert.equal(
      computeTopology(repo).is_multi_service,
      false,
      'single-service compose must not trigger multi-service (old code returned true because services: key was present)'
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
