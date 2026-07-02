import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compute } from './adp_i3_mttr.ts';

function mergeRecord(mergedAt: Date, firstCommitAt: Date) {
  return {
    merged_at: mergedAt.toISOString(),
    branch_first_commit_at: firstCommitAt.toISOString(),
  };
}

function makeGitArtifact(mergeRecords: object[]): string {
  return JSON.stringify({
    available: true,
    raw: {
      merge_records: mergeRecords,
      revert_merges: 0,
      total_merges: mergeRecords.length,
    },
  });
}

function makeTrackerArtifact(incidentSource: string | null = null): string {
  return JSON.stringify({
    available: true,
    raw: { incident_source: incidentSource },
  });
}

test('adp_i3_mttr: confidence=0.0 when tracker available but git.json absent (no intervals)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i3-nogit-'));
  try {
    // Tracker present with an incident_source but no git.json
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact('jira'));
    const res = compute(dir, {}, {});
    assert.equal(res.status, 'OK', 'must not SKIP — metric never skips');
    assert.equal(res.score, 0, 'score must be 0 with no intervals');
    assert.equal(
      res.confidence,
      0.0,
      'confidence must be 0.0 when no intervals computed (tracker present but git absent)'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i3_mttr: score interpolates for 1-hour median (elite/high boundary → 0.75)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i3-1h-'));
  try {
    const merged = new Date('2026-01-01T02:00:00Z');
    const first = new Date('2026-01-01T01:00:00Z'); // 1h interval
    writeFileSync(
      join(dir, 'git.json'),
      makeGitArtifact([mergeRecord(merged, first)])
    );
    const res = compute(dir, {}, {});
    assert.equal(res.status, 'OK', 'must be OK with git data');
    assert.ok(
      Math.abs((res.score ?? 0) - 0.75) < 1e-6,
      `score must be ~0.75 at 1h median MTTR (elite/high boundary), got ${res.score}`
    );
    // git-proxy only → confidence = 0.3 (some intervals computed)
    assert.ok(
      Math.abs((res.confidence ?? 0) - 0.3) < 1e-6,
      `confidence must be 0.3 for git-proxy with intervals, got ${res.confidence}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i3_mttr: score=0 and confidence=0 when no merge records in git.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i3-norecords-'));
  try {
    writeFileSync(join(dir, 'git.json'), makeGitArtifact([]));
    const res = compute(dir, {}, {});
    assert.equal(res.status, 'OK', 'must be OK (never SKIP)');
    assert.equal(res.score, 0, 'score must be 0 with no merge records');
    assert.equal(
      res.confidence,
      0.0,
      'confidence must be 0.0 when no intervals computed'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adp_i3_mttr: incident_source does NOT upgrade confidence while the value is the git proxy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-i3-incident-'));
  try {
    const merged = new Date('2026-01-01T02:00:00Z');
    const first = new Date('2026-01-01T01:00:00Z');
    writeFileSync(
      join(dir, 'git.json'),
      makeGitArtifact([mergeRecord(merged, first)])
    );
    writeFileSync(join(dir, 'tracker.json'), makeTrackerArtifact('pagerduty'));
    const res = compute(dir, {}, {});
    // The value is still computed from git branch lifetimes, not incident
    // data, so declaring an incident source must not raise confidence beyond
    // the proxy tier (0.3 when intervals exist).
    assert.ok(
      Math.abs((res.confidence ?? 0) - 0.3) < 1e-6,
      `confidence must stay at the git-proxy tier (0.3) even with incident_source declared, got ${res.confidence}`
    );
    assert.notEqual(
      res.reliability.confidence,
      'HIGH',
      'reliability confidence must not report HIGH for a proxy value'
    );
    assert.match(
      res.reliability.note ?? '',
      /git-proxy/,
      'the git-proxy disclaimer must survive incident_source presence'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
