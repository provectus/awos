/**
 * Unit tests for extractSourceUrls() in standards-linkcheck.mjs.
 *
 * Contract under test: the function parses a standards.toml text and returns
 * deduplicated url values from every [category.*] block that carries a `url` field.
 * No network I/O.
 *
 * Run:
 *   PATH=/opt/homebrew/bin:$PATH node --test scripts/standards-linkcheck.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSourceUrls,
  findBareRootUrls,
  isRootRedirect,
} from './standards-linkcheck.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_TWO_CATEGORIES_SAME_SOURCE = `
[meta]
standards_version = "2026.06"

[category.merge_frequency]
code = 301
metric = "adp_g3_deploy_frequency"
dimension = "ai-sdlc-adoption"
weight = 5
method = "computed"
source = "DORA State of DevOps"
url = "https://dora.dev/dora-report-2025/"
date = "2025-09"
last_verified = "2026-06-29"

[category.lead_time]
code = 401
metric = "adp_g4_lead_time"
dimension = "ai-sdlc-adoption"
weight = 5
method = "computed"
source = "DORA State of DevOps"
url = "https://dora.dev/dora-report-2025/"
date = "2025-09"
last_verified = "2026-06-29"
`;

const FIXTURE_TWO_DISTINCT_SOURCES = `
[category.merge_frequency]
code = 301
source = "DORA State of DevOps"
url = "https://dora.dev/dora-report-2025/"
date = "2025-09"
last_verified = "2026-06-29"

[category.application_security_as_01]
code = 2600
source = "OWASP ASVS"
url = "https://owasp.org/www-project-application-security-verification-standard/"
date = "2025-05-30"
last_verified = "2026-06-29"
`;

const FIXTURE_CATEGORY_WITHOUT_URL = `
[category.no_url_here]
code = 999
source = "Some Source"
date = "2025-01"
`;

const FIXTURE_NO_CATEGORY_TABLE = `
[meta]
standards_version = "2026.06"
`;

const FIXTURE_EMPTY = '';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('extractSourceUrls deduplicates categories sharing the same url', () => {
  const result = extractSourceUrls(FIXTURE_TWO_CATEGORIES_SAME_SOURCE);
  assert.equal(
    result.length,
    1,
    'must return exactly 1 entry when two categories share the same url'
  );
  assert.equal(
    result[0].url,
    'https://dora.dev/dora-report-2025/',
    'deduped url must be the DORA url'
  );
});

test('extractSourceUrls returns one entry per distinct url', () => {
  const result = extractSourceUrls(FIXTURE_TWO_DISTINCT_SOURCES);
  assert.equal(
    result.length,
    2,
    'must return 2 entries for 2 distinct category urls'
  );
  const urls = result.map((e) => e.url);
  assert.ok(
    urls.includes('https://dora.dev/dora-report-2025/'),
    'must include the DORA url'
  );
  assert.ok(
    urls.includes(
      'https://owasp.org/www-project-application-security-verification-standard/'
    ),
    'must include the OWASP url'
  );
});

test('extractSourceUrls returns [] when no [category.*] blocks have a url field', () => {
  const result = extractSourceUrls(FIXTURE_CATEGORY_WITHOUT_URL);
  assert.deepEqual(
    result,
    [],
    'must return empty array when no category carries a url field'
  );
});

test('extractSourceUrls returns [] when toml has no [category.*] tables', () => {
  const result = extractSourceUrls(FIXTURE_NO_CATEGORY_TABLE);
  assert.deepEqual(
    result,
    [],
    'must return empty array when no [category.*] tables are present'
  );
});

test('extractSourceUrls returns [] for empty toml input', () => {
  const result = extractSourceUrls(FIXTURE_EMPTY);
  assert.deepEqual(result, [], 'must return empty array for empty toml text');
});

test('extractSourceUrls uses the source label as name when available', () => {
  const result = extractSourceUrls(FIXTURE_TWO_DISTINCT_SOURCES);
  const doraEntry = result.find(
    (e) => e.url === 'https://dora.dev/dora-report-2025/'
  );
  assert.equal(
    doraEntry?.name,
    'DORA State of DevOps',
    'name must be the human source label from the category source field'
  );
});

test('extractSourceUrls uses category key as name when source field is absent', () => {
  const toml = `
[category.mccabe_complexity]
code = 500
url = "https://doi.org/10.1109/TSE.1976.233837"
date = "1976-07"
last_verified = "2026-06-29"
`;
  const result = extractSourceUrls(toml);
  assert.equal(result.length, 1, 'must return exactly 1 entry');
  assert.equal(
    result[0].name,
    'mccabe_complexity',
    'name must fall back to the category key when source field is absent'
  );
  assert.equal(
    result[0].url,
    'https://doi.org/10.1109/TSE.1976.233837',
    'url must be preserved verbatim'
  );
});

test('findBareRootUrls flags bare domain roots and passes deep links', () => {
  const toml = `
[category.root_a]
source = "Site A"
url = "https://example.com/"
[category.root_b]
source = "Site B"
url = "https://example.org"
[category.deep]
source = "Deep"
url = "https://example.com/spec/v1/page.html"
`;
  const offenders = findBareRootUrls(toml);
  const urls = offenders.map((o) => o.url).sort();
  assert.deepEqual(
    urls,
    ['https://example.com/', 'https://example.org'],
    'bare domain roots (path "" or "/") must be flagged; deep links must pass'
  );
});

test('isRootRedirect flags a deep link that redirected to the site root', () => {
  assert.equal(
    isRootRedirect(
      'https://example.com/spec/v1/page.html',
      'https://example.com/'
    ),
    true,
    'deep link → bare "/" root must be classified as a root redirect (page likely gone)'
  );
  assert.equal(
    isRootRedirect(
      'https://example.com/spec/v1/page.html',
      'https://example.com'
    ),
    true,
    'deep link → root with empty path must be classified as a root redirect'
  );
});

test('isRootRedirect passes redirects that keep a non-root path', () => {
  assert.equal(
    isRootRedirect(
      'https://example.com/spec/v1/page.html',
      'https://example.com/spec/v2/page.html'
    ),
    false,
    'deep link → another deep page is a legitimate redirect, not a root redirect'
  );
  assert.equal(
    isRootRedirect('https://example.com/page', 'https://www.example.com/page'),
    false,
    'host-only redirect that preserves the path must not be flagged'
  );
});

test('isRootRedirect ignores root→root and unparseable URLs', () => {
  assert.equal(
    isRootRedirect('https://example.com/', 'https://example.com/'),
    false,
    'a URL that was already a bare root is findBareRootUrls territory, not a root redirect'
  );
  assert.equal(
    isRootRedirect('not a url', 'https://example.com/'),
    false,
    'unparseable original URL must return false (reachability check owns that failure)'
  );
});
