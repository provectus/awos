// _base.test.ts — unit tests for resolveSource() in metrics/_base.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSource } from './_base.ts';

const SAMPLE_STANDARDS: Record<string, unknown> = {
  source: {
    'DORA State of DevOps': {
      url: 'https://dora.dev/dora-report-2025/',
      date: '2025-09',
    },
    'McCabe 1976': {
      url: 'https://doi.org/10.1109/TSE.1976.233837',
      date: '1976-07',
    },
    'No URL Entry': {
      date: '2025-01',
    },
  },
};

test('resolveSource returns url and date for a known source', () => {
  const result = resolveSource(SAMPLE_STANDARDS, 'DORA State of DevOps');
  assert.equal(
    result.url,
    'https://dora.dev/dora-report-2025/',
    'resolveSource must return the correct url for a known source'
  );
  assert.equal(
    result.date,
    '2025-09',
    'resolveSource must return the correct date for a known source'
  );
});

test('resolveSource returns {date:null,url:null} for an unknown source', () => {
  const result = resolveSource(SAMPLE_STANDARDS, 'Unknown Source');
  assert.equal(
    result.url,
    null,
    'resolveSource must return null url for an unknown source'
  );
  assert.equal(
    result.date,
    null,
    'resolveSource must return null date for an unknown source'
  );
});

test('resolveSource returns {date:null,url:null} when standards has no source table', () => {
  const result = resolveSource({}, 'DORA State of DevOps');
  assert.equal(
    result.url,
    null,
    'resolveSource must return null url when source table is absent'
  );
  assert.equal(
    result.date,
    null,
    'resolveSource must return null date when source table is absent'
  );
});

test('resolveSource handles entries without url field (url is null)', () => {
  const result = resolveSource(SAMPLE_STANDARDS, 'No URL Entry');
  assert.equal(
    result.url,
    null,
    'resolveSource must return null url when entry has no url field'
  );
  assert.equal(
    result.date,
    '2025-01',
    'resolveSource must return the date even when url is absent'
  );
});
