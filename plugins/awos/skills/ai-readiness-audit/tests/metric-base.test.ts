import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  readArtifact,
  skipReliability,
} from '../metrics/_base.ts';

test('reliability HIGH when all present', () => {
  const r = computeReliability('maximal', ['git'], []);
  assert.equal(r.tag, 'maximal');
  assert.equal(r.confidence, 'HIGH');
  assert.ok(r.note === null || r.note === '');
});

test('reliability downgrades on a missing source', () => {
  const r = computeReliability('maximal', ['git'], ['ci']);
  assert.ok(['MED', 'LOW'].includes(r.confidence));
  assert.match(r.note.toLowerCase(), /ci/);
});

test('SKIP when no sources used', () => {
  const res = makeMetricResult(
    'adp_c1',
    null,
    'raw',
    [],
    computeReliability('not-reliable', [], ['ci']),
    [],
    ['ci']
  );
  assert.equal(res.status, 'SKIP');
});

test('OK when at least one source', () => {
  const res = makeMetricResult(
    'adp_g1',
    0.5,
    'coverage',
    [101],
    computeReliability('maximal', ['git'], []),
    ['git'],
    []
  );
  assert.equal(res.status, 'OK');
  assert.deepEqual(res.categories_awarded, [101]);
  assert.equal(res.kind, 'coverage');
});

// ---------------------------------------------------------------------------
// readArtifact / skipReliability — the shared collected-artifact reader
// ---------------------------------------------------------------------------

test('readArtifact returns {artifact} for a parseable collected artifact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-readart-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'git.json'),
    JSON.stringify({ available: true, raw: { total_commits: 3 } })
  );
  const res = readArtifact(dir, 'git');
  assert.ok(
    'artifact' in res,
    'a valid artifact file must yield the parsed {artifact} shape'
  );
  if ('artifact' in res) {
    assert.equal(
      res.artifact.raw.total_commits,
      3,
      'parsed artifact must expose the raw payload unchanged'
    );
  }
});

test('readArtifact returns {error} naming the source when the file is absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-readart-absent-'));
  const res = readArtifact(dir, 'tracker');
  assert.ok('error' in res, 'a missing artifact file must yield {error}');
  if ('error' in res) {
    assert.match(
      res.error,
      /tracker\.json not found/,
      'the error must say which artifact file was not found'
    );
  }
});

test('readArtifact returns {error} instead of throwing on malformed JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awos-readart-bad-'));
  writeFileSync(join(dir, 'ci.json'), '{ truncated');
  const res = readArtifact(dir, 'ci');
  assert.ok(
    'error' in res,
    'a truncated artifact must degrade to {error}, never throw'
  );
  if ('error' in res) {
    assert.match(
      res.error,
      /ci\.json unreadable/,
      'the error must say the artifact was unreadable (parse failure)'
    );
  }
});

test('skipReliability carries the read error into the note', () => {
  const r = skipReliability('minimal', 'git', 'git.json not found');
  assert.equal(r.tag, 'minimal', 'tag must pass through unchanged');
  assert.equal(
    r.confidence,
    'LOW',
    'a SKIP-for-missing-source is LOW confidence'
  );
  assert.match(
    r.note ?? '',
    /missing sources: git \(git\.json not found\)/,
    'note must name the missing source AND the concrete read error'
  );
});
