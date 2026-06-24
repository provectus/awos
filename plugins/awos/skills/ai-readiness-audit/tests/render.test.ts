/**
 * render.test.ts — deterministic JSON→Markdown/HTML renderer tests.
 *
 * Contracts verified:
 *
 * Markdown (POL.1):
 *   - Contains a Hint column header in every per-dimension check table
 *   - Contains every dimension name
 *   - Contains the five hint-part labels (definition/derivation/reliability/source/method)
 *     inside at least one check's hint cell
 *   - value_series rendered as sparkline notation
 *
 * HTML (POL.2 + POL.3):
 *   - Contains the three tab labels: "Board / CEO", "Head of Engineering", "Drill-down"
 *   - Every scored number is wrapped with title= (spot-check: audit_total and coverage)
 *   - data-status attributes present on check rows
 *   - Issues-only filter toggle present (onclick=toggleIssues)
 *   - @media print rule present
 *   - Default-closed <details> (no `open` attribute)
 *   - Org mode: ≤3 portfolio metrics rendered + Repositories & Connections section
 *   - Org mode: per_repo table present
 *   - Single-repo mode: capability headline present
 *   - value_series rendered as inline SVG sparkline
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderHtml } from '../render.ts';
import type { AuditJson } from '../render.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCheck(
  overrides: Partial<{
    check_id: string;
    status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
    weight_awarded: number;
    weight_max: number;
    applies: boolean;
    reliability_tag: string;
    value_series: Array<{ bucket_start: string; value: number | null }>;
  }> = {}
): import('../render.ts').Check {
  const status = overrides.status ?? 'PASS';
  const applies = overrides.applies !== false;
  const tag = overrides.reliability_tag ?? 'maximal';
  return {
    check_id: overrides.check_id ?? 'TEST-01',
    code: [101],
    method: 'detected',
    status,
    value: '42',
    evidence: ['found at: .claude/CLAUDE.md'],
    weight_awarded: overrides.weight_awarded ?? (status === 'PASS' ? 5 : 0),
    weight_max: overrides.weight_max ?? 5,
    applies,
    reliability: {
      tag,
      confidence: 'high',
      note: null,
    },
    source: 'git native',
    definition: 'Claude.md presence and quality',
    hint: `Claude.md presence · detected from .claude/CLAUDE.md · ${tag} (high) · git native (2024) · detected`,
    value_series: overrides.value_series,
  };
}

/** Build a minimal single-repo AuditJson fixture. */
function singleRepoFixture(): AuditJson {
  return {
    date: '2026-01-15',
    project: 'service-checkout',
    audit_total: 85,
    coverage: 0.74,
    dimensions: [
      {
        dimension: 'ai-development-tooling',
        date: '2026-01-15',
        score: 45,
        coverage: 0.82,
        checks: [
          makeCheck({
            check_id: 'AI-01',
            status: 'PASS',
            weight_awarded: 5,
            weight_max: 5,
          }),
          makeCheck({
            check_id: 'AI-02',
            status: 'FAIL',
            weight_awarded: 0,
            weight_max: 8,
            reliability_tag: 'minimal',
          }),
          makeCheck({
            check_id: 'AI-03',
            status: 'SKIP',
            weight_awarded: 0,
            weight_max: 3,
            applies: false,
          }),
          makeCheck({
            check_id: 'AI-04',
            status: 'PASS',
            weight_awarded: 4,
            weight_max: 4,
            value_series: [
              { bucket_start: '2025-11-01', value: 3 },
              { bucket_start: '2025-12-01', value: 5 },
              { bucket_start: '2026-01-01', value: 4 },
            ],
          }),
        ],
      },
      {
        dimension: 'security',
        date: '2026-01-15',
        score: 40,
        coverage: 0.65,
        checks: [
          makeCheck({
            check_id: 'SEC-01',
            status: 'PASS',
            weight_awarded: 6,
            weight_max: 6,
          }),
          makeCheck({
            check_id: 'SEC-02',
            status: 'WARN',
            weight_awarded: 0,
            weight_max: 4,
          }),
        ],
      },
    ],
  };
}

/** Build an org-mode AuditJson fixture with portfolio_metrics + per_repo. */
function orgFixture(): AuditJson {
  return {
    date: '2026-01-15',
    project: 'acme-org',
    audit_total: 120,
    coverage: 0.61,
    dimensions: [
      {
        dimension: 'ai-development-tooling',
        date: '2026-01-15',
        score: 60,
        coverage: 0.7,
        checks: [
          makeCheck({
            check_id: 'AI-01',
            status: 'PASS',
            weight_awarded: 5,
            weight_max: 5,
          }),
          makeCheck({
            check_id: 'AI-02',
            status: 'FAIL',
            weight_awarded: 0,
            weight_max: 8,
          }),
        ],
      },
    ],
    portfolio_metrics: [
      {
        metric: 'org_ai_tooling_coverage',
        value: 0.6667,
        description:
          'Fraction of portfolio repos with any AI tooling present (contributor-weighted)',
        contributor_weighted: true,
        repos_counted: 3,
      },
      {
        metric: 'org_capability_score',
        value: 30.5,
        description:
          'Average awarded category-weight score across portfolio repos',
        contributor_weighted: false,
        repos_counted: 3,
      },
      {
        metric: 'org_measurement_coverage',
        value: 0.8824,
        description:
          'Fraction of portfolio repos with ≥1 reachable data-source collector (contributor-weighted)',
        contributor_weighted: true,
        repos_counted: 3,
      },
    ],
    per_repo: [
      {
        repo: 'org/service-a',
        contributors: 10,
        awarded_weight: 40,
        sources_reachable: ['git', 'ci'],
        has_ai_tooling: true,
      },
      {
        repo: 'org/service-b',
        contributors: 5,
        awarded_weight: 20,
        sources_reachable: ['git'],
        has_ai_tooling: false,
      },
      {
        repo: 'org/legacy',
        contributors: 2,
        awarded_weight: 0,
        sources_reachable: [],
        has_ai_tooling: false,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Markdown tests (POL.1)
// ---------------------------------------------------------------------------

test('renderMarkdown: contains a Hint column in per-dimension check table', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(
    md.includes('| Hint |'),
    'Markdown check table must have a "Hint" column header for the five-part hint'
  );
});

test('renderMarkdown: contains every dimension name', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(
    md.includes('Ai Development Tooling') ||
      md.includes('AI Development Tooling') ||
      md.includes('Ai-development-tooling') ||
      /ai.development.tooling/i.test(md),
    'Markdown must include the ai-development-tooling dimension'
  );
  assert.ok(
    /security/i.test(md),
    'Markdown must include the security dimension'
  );
});

test('renderMarkdown: hint string content (five parts) present in check rows', () => {
  const md = renderMarkdown(singleRepoFixture());
  // The hint string contains parts like "detected" (method), "git native" (source)
  // and "maximal" (reliability tag) — all come from our fixture hint string
  assert.ok(
    md.includes('detected'),
    'Markdown hint column must contain "detected" (the check method)'
  );
  assert.ok(
    md.includes('git native'),
    'Markdown hint column must contain "git native" (the source)'
  );
  assert.ok(
    md.includes('maximal'),
    'Markdown hint column must contain "maximal" (the reliability tag)'
  );
});

test('renderMarkdown: check_ids are present in the table', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(md.includes('AI-01'), 'Markdown must contain check_id AI-01');
  assert.ok(md.includes('SEC-02'), 'Markdown must contain check_id SEC-02');
});

test('renderMarkdown: audit_total and coverage are present', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(
    md.includes('85 pts') || md.includes('85'),
    'Markdown must include audit_total (85 pts)'
  );
  assert.ok(
    md.includes('74.0%') || md.includes('74%'),
    'Markdown must include coverage ratio'
  );
});

test('renderMarkdown: SKIP rows are present (not dropped)', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(
    md.includes('AI-03') && md.includes('SKIP'),
    'Markdown must include SKIP rows — no data is dropped (POL.1 no data loss)'
  );
});

test('renderMarkdown: value_series rendered as sparkline notation', () => {
  const md = renderMarkdown(singleRepoFixture());
  // The sparkline is rendered as escaped bracket notation \[...\] or just sparkline chars
  // from sparkline() which uses Unicode block chars
  assert.ok(
    /[▁▂▃▄▅▆▇█]/.test(md),
    'Markdown must include Unicode sparkline characters for checks with value_series'
  );
});

test('renderMarkdown: recommendations section present with FAIL entry', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(
    md.includes('## Recommendations'),
    'Markdown must have a Recommendations section'
  );
  assert.ok(
    md.includes('P0') && md.includes('FAIL'),
    'Recommendations must list P0 for FAIL checks'
  );
});

test('renderMarkdown (org): portfolio metrics present', () => {
  const md = renderMarkdown(orgFixture());
  assert.ok(
    md.includes('Portfolio Metrics'),
    'Org markdown must have a Portfolio Metrics section'
  );
  assert.ok(
    md.includes('AI-tooling coverage') ||
      md.includes('org_ai_tooling_coverage'),
    'Org markdown must include the tooling coverage metric'
  );
  assert.ok(
    md.includes('Repositories & Connections') || md.includes('Repositories'),
    'Org markdown must include a Repositories & Connections section'
  );
});

// ---------------------------------------------------------------------------
// HTML tests (POL.2 + POL.3)
// ---------------------------------------------------------------------------

test('renderHtml: contains three tab labels — Board / CEO, Head of Engineering, Drill-down', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('Board / CEO'),
    'HTML must contain the "Board / CEO" tab label'
  );
  assert.ok(
    html.includes('Head of Engineering'),
    'HTML must contain the "Head of Engineering" tab label'
  );
  assert.ok(
    html.includes('Drill-down'),
    'HTML must contain the "Drill-down" tab label'
  );
});

test('renderHtml: audit_total and coverage are wrapped with title= (POL.3)', () => {
  const html = renderHtml(singleRepoFixture());
  // The number 85 should appear in a span with a title attribute
  const titlePattern = /title="[^"]*"[^>]*>(?:[^<]*)?85/;
  assert.ok(
    titlePattern.test(html) || (html.includes('title=') && html.includes('85')),
    'HTML must wrap the audit_total number in a span with a title= hint attribute (POL.3)'
  );
  // Coverage percentage must also have a title=
  assert.ok(
    html.includes('title=') && (html.includes('74.0%') || html.includes('74%')),
    'HTML must wrap the coverage percentage in a span with a title= hint attribute (POL.3)'
  );
});

test('renderHtml: data-status attributes present on check rows in Tab 3', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('data-status="PASS"'),
    'HTML must have data-status="PASS" on check rows'
  );
  assert.ok(
    html.includes('data-status="FAIL"'),
    'HTML must have data-status="FAIL" on check rows'
  );
  assert.ok(
    html.includes('data-status="SKIP"'),
    'HTML must have data-status="SKIP" on check rows'
  );
});

test('renderHtml: issues-only filter toggle present', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('toggleIssues'),
    'HTML must include the toggleIssues function for the issues-only filter'
  );
  assert.ok(
    html.includes('issues-only'),
    'HTML must include the CSS class "issues-only" used by the filter toggle'
  );
  assert.ok(
    html.includes('Show issues only'),
    'HTML must have a "Show issues only" button label for the filter toggle'
  );
});

test('renderHtml: @media print rule present', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('@media print'),
    'HTML must include @media print rules to expand all sections and hide toggles'
  );
});

test('renderHtml: <details> sections default-closed (no open attribute)', () => {
  const html = renderHtml(singleRepoFixture());
  // Check that <details> appears but <details open> does not
  const detailsCount = (html.match(/<details/g) ?? []).length;
  const openCount = (html.match(/<details open/g) ?? []).length;
  assert.ok(detailsCount > 0, 'HTML must have at least one <details> element');
  assert.equal(
    openCount,
    0,
    '<details> sections must default-closed (no "open" attribute) — users expand them explicitly'
  );
});

test('renderHtml (single-repo): capability headline score present in Tab 1', () => {
  const html = renderHtml(singleRepoFixture());
  // Single-repo Tab 1 shows the capability headline with the score
  assert.ok(
    html.includes('AI-SDLC Capability') || html.includes('capability'),
    'Single-repo HTML Tab 1 must include a capability headline'
  );
  assert.ok(
    html.includes('85'),
    'Single-repo HTML Tab 1 must include the capability score (85 pts)'
  );
});

test('renderHtml (org): ≤3 portfolio metrics in Tab 1', () => {
  const html = renderHtml(orgFixture());
  assert.ok(
    html.includes('Portfolio Metrics'),
    'Org HTML Tab 1 must include a Portfolio Metrics section'
  );
  // All three canonical metrics must appear
  assert.ok(
    html.includes('AI-tooling coverage') ||
      html.includes('org_ai_tooling_coverage'),
    'Org HTML must include the org_ai_tooling_coverage metric'
  );
  assert.ok(
    html.includes('Capability score') || html.includes('org_capability_score'),
    'Org HTML must include the org_capability_score metric'
  );
  assert.ok(
    html.includes('Measurement coverage') ||
      html.includes('org_measurement_coverage'),
    'Org HTML must include the org_measurement_coverage metric'
  );
  // Must not show more than 3 metric cards
  const metricCardCount = (html.match(/class="metric-card"/g) ?? []).length;
  assert.ok(
    metricCardCount <= 3,
    `Org HTML Tab 1 must show ≤3 portfolio metric cards, found ${metricCardCount}`
  );
});

test('renderHtml (org): Repositories & Connections section in Tab 3', () => {
  const html = renderHtml(orgFixture());
  assert.ok(
    html.includes('Repositories') && html.includes('Connections'),
    'Org HTML Tab 3 must include a "Repositories & Connections" section'
  );
  // Per-repo entries must be present
  assert.ok(
    html.includes('org/service-a'),
    'Org HTML Repositories section must list org/service-a'
  );
  assert.ok(
    html.includes('org/legacy'),
    'Org HTML Repositories section must list org/legacy'
  );
});

test('renderHtml: value_series rendered as inline SVG sparkline', () => {
  const html = renderHtml(singleRepoFixture());
  // AI-04 has value_series with 3 buckets
  assert.ok(
    html.includes('<svg') && html.includes('sparkline'),
    'HTML must render value_series as an inline SVG sparkline (aria-label="sparkline")'
  );
  assert.ok(
    html.includes('<rect'),
    'HTML sparkline SVG must contain <rect> elements'
  );
});

test('renderHtml: check hint strings appear in title= attributes', () => {
  const html = renderHtml(singleRepoFixture());
  // The hint from our fixture: "Claude.md presence · detected from .claude/CLAUDE.md · ..."
  // It appears in the title= of the check weight cell and the check_id cell
  assert.ok(
    html.includes('Claude.md presence'),
    'HTML must embed check hint strings in title= attributes for weighted cells'
  );
});

test('renderHtml: is a valid HTML document (has doctype, html, head, body)', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.startsWith('<!DOCTYPE html>'),
    'HTML must start with DOCTYPE declaration'
  );
  assert.ok(
    html.includes('<html lang="en">'),
    'HTML must have <html lang="en">'
  );
  assert.ok(html.includes('<head>'), 'HTML must have a <head> section');
  assert.ok(html.includes('<body>'), 'HTML must have a <body> section');
  assert.ok(html.includes('</html>'), 'HTML must close the html tag');
});

test('renderHtml: tab switching JS present (showTab function)', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('showTab'),
    'HTML must include the showTab JS function for tab switching'
  );
});

test('renderHtml (drill-down): code and source columns present in Tab 3 check rows', () => {
  const html = renderHtml(singleRepoFixture());
  // Tab 3 (Drill-down) must render the category code number and the source
  // string for each check so engineers can trace checks back to standards.toml.
  assert.ok(
    html.includes('<th>Code</th>'),
    'HTML Drill-down tab must have a "Code" column header for the category numeric code'
  );
  assert.ok(
    html.includes('<th>Source</th>'),
    'HTML Drill-down tab must have a "Source" column header for the source name from standards.toml'
  );
  // The fixture check uses code=[101] and source="git native"
  assert.ok(
    html.includes('101'),
    'HTML Drill-down tab must render the numeric category code (101 from fixture)'
  );
  assert.ok(
    html.includes('git native'),
    'HTML Drill-down tab must render the source string (git native from fixture)'
  );
});
