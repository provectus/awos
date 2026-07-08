import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReliability,
  loadArtifactOrSkip,
  makeMetricResult,
  readArtifact,
  skipReliability,
  strandedPayloadCount,
} from '../metrics/_base.ts';
import { tmpDir } from './helpers.ts';

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
  const dir = tmpDir('awos-readart-');
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
  const dir = tmpDir('awos-readart-absent-');
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
  const dir = tmpDir('awos-readart-bad-');
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

// ---------------------------------------------------------------------------
// loadArtifactOrSkip — malformed-envelope guard: a data-rich artifact that is
// not marked available must SKIP loudly (naming the stranded records), never
// with the generic "missing sources" note that hides fetched data.
// ---------------------------------------------------------------------------

test('loadArtifactOrSkip flags a data-rich artifact missing available:true as a malformed envelope', () => {
  const dir = tmpDir('awos-malformed-env-');
  // The observed failure shape: payload at the top level, no envelope at all.
  writeFileSync(
    join(dir, 'ci.json'),
    JSON.stringify({
      fetch_meta: { runs_fetched: 3, complete: true },
      period: { lookback_days: 90 },
      runs: [{ conclusion: 'success' }, { conclusion: 'failure' }, {}],
    })
  );
  const loaded = loadArtifactOrSkip(dir, 'ci', {
    metric: 'ci_pass_rate',
    kind: 'banded',
    tag: 'not-reliable',
  });
  assert.ok('skip' in loaded, 'artifact without available:true must SKIP');
  if ('skip' in loaded) {
    const note = loaded.skip.reliability.note ?? '';
    assert.match(
      note,
      /malformed envelope/,
      'the SKIP note must call out the malformed envelope, not a generic missing source'
    );
    assert.match(
      note,
      /ci\.json holds 3 fetched record/,
      'the SKIP note must count the stranded records so the loss is visible'
    );
  }
});

test('loadArtifactOrSkip keeps the plain missing-source note for a genuinely empty unavailable artifact', () => {
  const dir = tmpDir('awos-plain-unavail-');
  writeFileSync(
    join(dir, 'ci.json'),
    JSON.stringify({
      source: 'ci',
      available: false,
      reason_if_absent: 'no CI config detected',
      raw: {},
    })
  );
  const loaded = loadArtifactOrSkip(dir, 'ci', {
    metric: 'ci_pass_rate',
    kind: 'banded',
    tag: 'not-reliable',
  });
  assert.ok('skip' in loaded, 'unavailable artifact must SKIP');
  if ('skip' in loaded) {
    const note = loaded.skip.reliability.note ?? '';
    assert.doesNotMatch(
      note,
      /malformed envelope/,
      'an honestly-empty unavailable artifact is not a malformed envelope'
    );
  }
});

test('strandedPayloadCount counts records at the top level and under raw', () => {
  assert.equal(
    strandedPayloadCount({ runs: [1, 2], raw: { tickets: [1] } }),
    3,
    'payload arrays at both levels must be counted'
  );
  assert.equal(
    strandedPayloadCount({ available: false, raw: {} }),
    0,
    'an artifact with no payload arrays has nothing stranded'
  );
});
