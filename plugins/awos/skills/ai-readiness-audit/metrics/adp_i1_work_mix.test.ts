import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compute } from './adp_i1_work_mix.ts';

function makeTrackerArtifact(typeCounts: Record<string, number>): string {
  return JSON.stringify({
    available: true,
    raw: { type_counts: typeCounts },
  });
}

test('adp_i1_work_mix: SKIP when tracker.json is absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i1-'));
  try {
    const res = compute(dir, {}, {});
    assert.equal(res.status, 'SKIP', 'must SKIP when tracker.json absent');
    assert.equal(res.score, 0, 'score must be 0 on SKIP');
    assert.equal(res.confidence, 0, 'confidence must be 0 on SKIP');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i1_work_mix: score=0 when tracker available but type_counts total is 0 (empty tracker)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i1-empty-'));
  try {
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact({}));
    const res = compute(dir, {}, {});
    assert.equal(
      res.status,
      'OK',
      'must be OK (not SKIP) with available tracker'
    );
    assert.equal(
      res.score,
      0,
      'score must be 0 for empty tracker (no growth fraction computable)'
    );
    assert.equal(
      res.confidence,
      1.0,
      'confidence stays 1.0 (tracker was reachable)'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i1_work_mix: score interpolates linearly — 30% growth yields score 0.5', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i1-med-'));
  try {
    // 30 feature tickets, 70 bug tickets = 30% growth → score = 0.30/0.60 = 0.5
    writeFileSync(
      join(dir, 'tracker.json'),
      makeTrackerArtifact({ feature: 30, bug: 70 })
    );
    const res = compute(dir, {}, {});
    assert.equal(res.status, 'OK', 'must be OK with ticket data');
    assert.ok(
      Math.abs((res.score ?? 0) - 0.5) < 1e-6,
      `score must be 0.5 for 30% growth, got ${res.score}`
    );
    assert.equal(
      res.confidence,
      1.0,
      'confidence must be 1.0 when tracker is available'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i1_work_mix: score capped at 1.0 when growth fraction >= 60%', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i1-elite-'));
  try {
    // 80% growth → clamp01(0.8/0.6) = 1.0
    writeFileSync(
      join(dir, 'tracker.json'),
      makeTrackerArtifact({ feature: 80, bug: 20 })
    );
    const res = compute(dir, {}, {});
    assert.ok(
      (res.score ?? 0) >= 1.0,
      `score must be clamped to 1.0 for elite growth fraction, got ${res.score}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
