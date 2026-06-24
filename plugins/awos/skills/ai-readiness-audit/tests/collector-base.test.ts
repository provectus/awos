import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeArtifact, writeArtifact } from '../collectors/_base.ts';

const PERIOD = {
  bucket_days: 30,
  lookback_days: 730,
  history_available_days: 400,
};

test('makeArtifact shape', () => {
  const a = makeArtifact('git', true, null, PERIOD, { commits: 10 });
  assert.equal(a.source, 'git');
  assert.equal(a.available, true);
  assert.equal(a.reason_if_absent, null);
  assert.equal(a.period.history_available_days, 400);
  assert.equal(a.raw.commits, 10);
});

test('absent artifact records reason', () => {
  const a = makeArtifact(
    'ci',
    false,
    'no CI config found',
    { ...PERIOD, history_available_days: 0 },
    {}
  );
  assert.equal(a.available, false);
  assert.match(a.reason_if_absent, /no CI/);
});

test('writeArtifact writes <source>.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'col-'));
  const a = makeArtifact(
    'docs',
    false,
    'no docs connector',
    { ...PERIOD, history_available_days: 0 },
    {}
  );
  const p = writeArtifact(a, dir);
  assert.match(p, /docs\.json$/);
  assert.equal(JSON.parse(readFileSync(p, 'utf8')).source, 'docs');
});
