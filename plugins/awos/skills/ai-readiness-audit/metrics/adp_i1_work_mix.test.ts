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

// ---------------------------------------------------------------------------
// Tracker fetch completeness (raw.fetch_meta) — partial fetches must be
// visible in the reliability note; complete/absent fetch_meta adds nothing.
// ---------------------------------------------------------------------------

test('adp_i1_work_mix: partial tracker fetch (fetch_meta) is appended to the reliability note', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i1-partial-'));
  try {
    writeFileSync(
      join(dir, 'tracker.json'),
      JSON.stringify({
        available: true,
        raw: {
          type_counts: { feature: 60, bug: 40 },
          fetch_meta: { tickets_fetched: 100, tickets_total: 432 },
        },
      })
    );
    const res = compute(dir, {}, {});
    assert.equal(
      res.status,
      'OK',
      'metric must still score on a partial fetch'
    );
    assert.ok(
      (res.reliability.note ?? '').includes(
        'partial tracker fetch: 100 of 432 tickets'
      ),
      `reliability note must disclose the partial fetch; got: ${res.reliability.note}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i1_work_mix: no partial-fetch note when fetch_meta is absent or complete', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i1-complete-'));
  try {
    // fetch_meta absent
    writeFileSync(
      join(dir, 'tracker.json'),
      makeTrackerArtifact({ feature: 60, bug: 40 })
    );
    let res = compute(dir, {}, {});
    assert.ok(
      !(res.reliability.note ?? '').includes('partial tracker fetch'),
      `no fetch_meta → no partial-fetch note; got: ${res.reliability.note}`
    );
    // fetch_meta present and complete
    writeFileSync(
      join(dir, 'tracker.json'),
      JSON.stringify({
        available: true,
        raw: {
          type_counts: { feature: 60, bug: 40 },
          fetch_meta: {
            tickets_fetched: 100,
            tickets_total: 100,
            complete: true,
          },
        },
      })
    );
    res = compute(dir, {}, {});
    assert.ok(
      !(res.reliability.note ?? '').includes('partial tracker fetch'),
      `complete fetch_meta → no partial-fetch note; got: ${res.reliability.note}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
