// detectors/spec_driven_development_sdd01.test.ts — SDD-01 must not treat the
// audit's own output (a bare context/ dir holding only context/audits/) as
// evidence of a spec workspace (self-pollution, B3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { detectAwosInstalled } from './spec_driven_development.ts';
import { tmpDir } from '../tests/helpers.ts';

test('SDD-01 FAILs when context/ holds only the audit output dir', () => {
  const repo = tmpDir('awos-sdd01-polluted-');
  try {
    mkdirSync(join(repo, 'context', 'audits', '2026-07-02'), {
      recursive: true,
    });
    const res = detectAwosInstalled(repo);
    assert.equal(
      res.status,
      'FAIL',
      `a context/ dir created by the audit itself must not count as a spec workspace; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SDD-01 PASSes with .awos/ plus a real spec workspace (context/product)', () => {
  const repo = tmpDir('awos-sdd01-real-');
  try {
    mkdirSync(join(repo, '.awos'), { recursive: true });
    mkdirSync(join(repo, 'context', 'product'), { recursive: true });
    const res = detectAwosInstalled(repo);
    assert.equal(
      res.status,
      'PASS',
      `.awos/ + context/product must PASS; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('SDD-01 WARNs when only the workspace exists (context/spec, no .awos/)', () => {
  const repo = tmpDir('awos-sdd01-warn-');
  try {
    mkdirSync(join(repo, 'context', 'spec'), { recursive: true });
    const res = detectAwosInstalled(repo);
    assert.equal(
      res.status,
      'WARN',
      `context/spec without .awos/ must WARN; got ${res.status}`
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
