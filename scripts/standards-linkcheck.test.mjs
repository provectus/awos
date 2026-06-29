/**
 * Unit tests for extractSourceUrls() in standards-linkcheck.mjs.
 *
 * Contract under test: the function parses a standards.toml text and returns
 * the name→url pairs from every [source."<name>"] table. No network I/O.
 *
 * Run:
 *   PATH=/opt/homebrew/bin:$PATH node --test scripts/standards-linkcheck.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSourceUrls } from './standards-linkcheck.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_TWO_SOURCES = `
[meta]
standards_version = "2026.06"

[source."DORA State of DevOps"]
url  = "https://dora.dev/dora-report-2025/"
date = "2025-09"

[source."OWASP ASVS"]
url  = "https://owasp.org/www-project-application-security-verification-standard/"
date = "2025-05-30"
`;

const FIXTURE_SOURCE_WITHOUT_URL = `
[source."No URL here"]
date = "2025-01"
notes = "intentionally missing url"
`;

const FIXTURE_NO_SOURCE_TABLE = `
[meta]
standards_version = "2026.06"

[category.ai_tooling_claude_md]
code = 101
check_id = "ADP-01"
weight = 10
`;

const FIXTURE_EMPTY = '';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('extractSourceUrls returns correct name→url pairs for multiple sources', () => {
  const result = extractSourceUrls(FIXTURE_TWO_SOURCES);
  assert.equal(
    result.length,
    2,
    'must return exactly 2 entries for 2 [source.*] blocks'
  );
  const byName = Object.fromEntries(result.map((e) => [e.name, e.url]));
  assert.equal(
    byName['DORA State of DevOps'],
    'https://dora.dev/dora-report-2025/',
    'DORA State of DevOps url must match the declared value'
  );
  assert.equal(
    byName['OWASP ASVS'],
    'https://owasp.org/www-project-application-security-verification-standard/',
    'OWASP ASVS url must match the declared value'
  );
});

test('extractSourceUrls returns [] when toml has no [source.*] tables', () => {
  const result = extractSourceUrls(FIXTURE_NO_SOURCE_TABLE);
  assert.deepEqual(
    result,
    [],
    'must return empty array when no [source.*] tables are present'
  );
});

test('extractSourceUrls returns [] for empty toml input', () => {
  const result = extractSourceUrls(FIXTURE_EMPTY);
  assert.deepEqual(result, [], 'must return empty array for empty toml text');
});

test('extractSourceUrls skips source entries that have no url key', () => {
  const result = extractSourceUrls(FIXTURE_SOURCE_WITHOUT_URL);
  assert.deepEqual(
    result,
    [],
    'must skip [source.*] entries that have no url key rather than throwing'
  );
});

test('extractSourceUrls preserves the exact name string including spaces and special characters', () => {
  const toml = `
[source."McCabe 1976"]
url  = "https://doi.org/10.1109/TSE.1976.233837"
date = "1976-07"
`;
  const result = extractSourceUrls(toml);
  assert.equal(result.length, 1, 'must return exactly 1 entry');
  assert.equal(
    result[0].name,
    'McCabe 1976',
    'source name must be preserved verbatim including spaces'
  );
  assert.equal(
    result[0].url,
    'https://doi.org/10.1109/TSE.1976.233837',
    'url must be preserved verbatim'
  );
});
