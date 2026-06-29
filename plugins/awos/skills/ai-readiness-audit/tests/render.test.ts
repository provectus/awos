/**
 * render.test.ts — deterministic JSON→Markdown/HTML renderer tests.
 *
 * The report is ONE scrolling page (no audience tabs). Contracts verified:
 *
 * Markdown:
 *   - Hint column header in every per-dimension check table
 *   - Every dimension name present
 *   - Five hint-part labels present in at least one check's hint cell
 *   - value_series rendered as sparkline notation
 *   - Insights section rendered from audit.insights
 *   - Recommendations rendered from audit.recommendations (plain detail), with a
 *     mechanical FAIL/WARN fallback when the field is absent
 *
 * HTML:
 *   - Single page: an #overview region + one .dim-page per dimension (drill-down)
 *   - Dimension summary rows link to the hash-routed sub-page (#dim/<key>)
 *   - Hash router + browser-Back affordance (route() + Back link to #)
 *   - Instant plain-first tooltips (.tip/.tipbox) — NOT native title= delay
 *   - Executive band: capability headline + delivery/scale/reach from audit.headline
 *   - Top insights cards + "What to improve" recommendations
 *   - Drill-down check table is fixed-layout with a wide Evidence column
 *   - data-status attributes, issues-only filter, @media print, SVG sparkline
 *   - Graceful degradation when headline/insights/recommendations/plain are absent
 *   - Org mode: ≤3 portfolio metrics + Repositories & Connections + per_repo
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderHtml, labelize } from '../render.ts';
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
    plain: string;
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
    plain: overrides.plain,
    value_series: overrides.value_series,
  };
}

/** Single-repo fixture WITH the plain-language blocks (headline/insights/recs). */
function singleRepoFixture(): AuditJson {
  return {
    date: '2026-01-15',
    project: 'service-checkout',
    audit_total: 85,
    coverage: 0.74,
    headline: {
      delivery: [
        {
          label: 'Deployment frequency',
          display_value: '4.2 / wk',
          band: 'High',
          reliability: 'maximal',
          check_id: 'ADP-G3',
        },
        {
          label: 'Change failure rate',
          display_value: '9%',
          band: 'High',
          reliability: 'minimal',
          check_id: 'ADP-G7',
        },
      ],
      scale: [
        {
          label: 'Source size',
          display_value: '30,058 LOC · 1 language',
          check_id: 'ADP-G11',
        },
        {
          label: 'Avg complexity',
          display_value: 'CCN 1.66 (healthy)',
          check_id: 'ADP-G10',
        },
      ],
      reach: {
        ai_tooling: 'AI agent config present (partial)',
        contributors: '5.3 active contributors / month',
      },
    },
    insights: [
      {
        theme: 'Secrets & supply-chain hygiene',
        severity: 'high',
        weak_areas: ['Security', 'Supply Chain Security'],
        so_what:
          'AI agents can read .env and there is no CVE scan in CI, so a vulnerable dependency could ship unnoticed.',
        improves:
          'A deny-hook plus a pip-audit step closes the biggest low-effort gap.',
      },
    ],
    recommendations: [
      {
        id: 1,
        priority: 'P0',
        title: 'Add AI-agent guardrails that block reading secret files',
        dimension: 'Security',
        check_id: 'SEC-02',
        effort: 'Low',
        detail:
          'Add a permissions.deny entry to .claude/settings.json denying Read access to .env, *.pem, *.key.',
      },
    ],
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
            plain: 'A project guide for AI agents is present.',
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

/** Bare single-repo fixture WITHOUT plain-language blocks — tests graceful degradation. */
function bareFixture(): AuditJson {
  return {
    date: '2026-01-15',
    project: 'bare-repo',
    audit_total: 50,
    coverage: 0.5,
    dimensions: [
      {
        dimension: 'security',
        date: '2026-01-15',
        score: 50,
        coverage: 0.5,
        checks: [
          makeCheck({ check_id: 'SEC-01', status: 'PASS' }),
          makeCheck({
            check_id: 'SEC-02',
            status: 'FAIL',
            weight_awarded: 0,
            weight_max: 8,
          }),
        ],
      },
    ],
  };
}

/** Org-mode fixture with portfolio_metrics + per_repo. */
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
// Markdown tests
// ---------------------------------------------------------------------------

test('renderMarkdown: contains a Hint column in per-dimension check table', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(
    md.includes('| Hint |'),
    'Markdown check table must keep a "Hint" column header for the five-part hint'
  );
});

test('renderMarkdown: contains every dimension name', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(
    /ai.development.tooling/i.test(md),
    'Markdown must include the ai-development-tooling dimension'
  );
  assert.ok(
    /security/i.test(md),
    'Markdown must include the security dimension'
  );
});

test('renderMarkdown: five-part hint content present in check rows', () => {
  const md = renderMarkdown(singleRepoFixture());
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

test('renderMarkdown: check_ids present in the table', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(md.includes('AI-01'), 'Markdown must contain check_id AI-01');
  assert.ok(md.includes('SEC-02'), 'Markdown must contain check_id SEC-02');
});

test('renderMarkdown: audit_total and coverage present', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(
    md.includes('85 pts'),
    'Markdown must include audit_total (85 pts)'
  );
  assert.ok(
    md.includes('74.0%'),
    'Markdown must include coverage ratio (74.0%)'
  );
});

test('renderMarkdown: SKIP rows present (no data dropped)', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(
    md.includes('AI-03') && md.includes('SKIP'),
    'Markdown must include SKIP rows — no data is dropped'
  );
});

test('renderMarkdown: value_series rendered as sparkline notation', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(
    /[▁▂▃▄▅▆▇█]/.test(md),
    'Markdown must include Unicode sparkline characters for checks with value_series'
  );
});

test('renderMarkdown: Top Insights section rendered from audit.insights', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(
    md.includes('## Top Insights'),
    'Markdown must render a Top Insights section when audit.insights is present'
  );
  assert.ok(
    md.includes('Secrets & supply-chain hygiene'),
    'Markdown insights must include the authored theme'
  );
  assert.ok(
    md.includes('What improves if fixed'),
    'Markdown insights must surface the "what improves" narrative'
  );
});

test('renderMarkdown: recommendations rendered from audit.recommendations with plain detail', () => {
  const md = renderMarkdown(singleRepoFixture());
  assert.ok(
    md.includes('## Recommendations'),
    'Markdown must have a Recommendations section'
  );
  assert.ok(
    md.includes('Add AI-agent guardrails that block reading secret files'),
    'Recommendations must use the authored plain-language title'
  );
  assert.ok(
    md.includes('permissions.deny'),
    'Recommendations must include the authored plain-language detail paragraph'
  );
});

test('renderMarkdown: recommendations fall back to FAIL/WARN derivation when absent', () => {
  const md = renderMarkdown(bareFixture());
  assert.ok(
    md.includes('## Recommendations') && md.includes('P0'),
    'Without audit.recommendations, Markdown must derive P0 entries from FAIL checks'
  );
});

test('renderMarkdown (org): portfolio metrics present', () => {
  const md = renderMarkdown(orgFixture());
  assert.ok(
    md.includes('Portfolio Metrics'),
    'Org markdown must have a Portfolio Metrics section'
  );
  assert.ok(
    md.includes('AI-tooling coverage'),
    'Org markdown must include the tooling coverage metric'
  );
  assert.ok(
    md.includes('## Repositories'),
    'Org markdown must include a ## Repositories section'
  );
});

// ---------------------------------------------------------------------------
// HTML tests — single page
// ---------------------------------------------------------------------------

test('renderHtml: single page — an #overview region and no audience tabs', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('id="overview"'),
    'HTML must have a single #overview region (one scrolling page)'
  );
  assert.ok(
    !html.includes('Board / CEO') &&
      !html.includes('Head of Engineering') &&
      !html.includes('>Drill-down<'),
    'HTML must NOT contain the old "for whom" audience tabs'
  );
});

test('renderHtml: one drill-down sub-page per dimension, id=page-<key>', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('class="dim-page" id="page-ai-development-tooling"'),
    'HTML must render a drill-down sub-page for ai-development-tooling'
  );
  assert.ok(
    html.includes('class="dim-page" id="page-security"'),
    'HTML must render a drill-down sub-page for security'
  );
});

test('renderHtml: dimension summary rows link to hash-routed sub-pages', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('href="#dim/security"'),
    'Dimension summary must link each dimension to its #dim/<key> sub-page'
  );
});

test('renderHtml: browser-Back affordance — hash router + Back link to overview', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes("addEventListener('hashchange'") &&
      html.includes('function route('),
    'HTML must wire a hashchange router so browser Back/Forward navigate sub-pages'
  );
  assert.ok(
    html.includes('href="#">← Back to overview</a>') ||
      html.includes('Back to overview'),
    'Each sub-page must offer a Back-to-overview link'
  );
});

test('renderHtml: tooltips are instant plain-first (.tip/.tipbox), NOT native title=', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('class="tip"') && html.includes('class="tipbox"'),
    'HTML must use CSS .tip/.tipbox tooltips for instant hover (no native title delay)'
  );
  assert.ok(
    !html.includes(' title="'),
    'HTML must NOT use the native title= attribute for hints (it has a ~1.5s delay)'
  );
});

test('renderHtml: tooltip leads with the plain-language explanation', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('A project guide for AI agents is present.'),
    "HTML must surface the check's plain-language sentence in its tooltip"
  );
});

test('renderHtml: executive band — capability headline plus delivery/scale/reach', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('class="exec"') && html.includes('85 pts'),
    'HTML must show the capability headline (85 pts) in the executive band'
  );
  assert.ok(
    html.includes('Delivery (vs DORA bands)') && html.includes('4.2 / wk'),
    'Executive band must render the DORA delivery block from audit.headline'
  );
  assert.ok(
    html.includes('Code scale') && html.includes('30,058 LOC'),
    'Executive band must render the code-scale block from audit.headline'
  );
  assert.ok(
    html.includes('5.3 active contributors / month'),
    'Executive band must render the reach block from audit.headline'
  );
});

test('renderHtml: top insights cards rendered from audit.insights', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('Top insights') &&
      html.includes('Secrets &amp; supply-chain hygiene'),
    'HTML must render insight cards (the narrative READ) from audit.insights'
  );
});

test('renderHtml: "What to improve" recommendations rendered with plain detail', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('What to improve') &&
      html.includes('Add AI-agent guardrails that block reading secret files'),
    'HTML must render a What-to-improve section from audit.recommendations'
  );
  assert.ok(
    html.includes('permissions.deny'),
    'Recommendation cards must include the authored plain-language detail'
  );
});

test('renderHtml: drill-down check table is fixed-layout with a wide Evidence column', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('table class="checks"') && html.includes('<colgroup>'),
    'Check table must use a fixed layout (colgroup) so columns get explicit widths'
  );
  assert.ok(
    html.includes('class="evidence"'),
    'Evidence must be its own wide column, not a cramped equal-width cell'
  );
  assert.ok(
    html.includes('width:32%'),
    'Evidence column must be allocated the widest share of the table'
  );
});

test('renderHtml: data-status attributes present on check rows', () => {
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
    html.includes('toggleIssues') && html.includes('issues-only'),
    'HTML must include the issues-only filter toggle'
  );
  assert.ok(
    html.includes('Show issues only'),
    'HTML must have a "Show issues only" button label'
  );
});

test('renderHtml: @media print rule present', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('@media print'),
    'HTML must include @media print rules to expand sub-pages and hide chrome'
  );
});

test('renderHtml: value_series rendered as inline SVG sparkline', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('<svg') &&
      html.includes('sparkline') &&
      html.includes('<rect'),
    'HTML must render value_series as an inline SVG sparkline'
  );
});

test('renderHtml: graceful degradation — bare audit renders without throwing', () => {
  const html = renderHtml(bareFixture());
  assert.ok(
    html.includes('50 pts') && html.includes('class="exec"'),
    'Without headline/insights/recommendations, HTML must still render the capability headline'
  );
  assert.ok(
    html.includes('What to improve') && html.includes('P0'),
    'Without audit.recommendations, HTML must fall back to derived FAIL/WARN recommendations'
  );
  assert.ok(
    !html.includes('Top insights'),
    'Without audit.insights, HTML must omit the insights section entirely'
  );
});

test('renderHtml: valid HTML document (doctype, html, head, body)', () => {
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

test('renderHtml (org): ≤3 portfolio metrics in the executive band', () => {
  const html = renderHtml(orgFixture());
  assert.ok(
    html.includes('AI-tooling coverage'),
    'Org HTML must include the org_ai_tooling_coverage metric'
  );
  assert.ok(
    html.includes('Capability score'),
    'Org HTML must include the org_capability_score metric'
  );
  assert.ok(
    html.includes('Measurement coverage'),
    'Org HTML must include the org_measurement_coverage metric'
  );
  const metricCardCount = (html.match(/class="metric-card"/g) ?? []).length;
  assert.ok(
    metricCardCount <= 3,
    `Org HTML must show ≤3 portfolio metric cards, found ${metricCardCount}`
  );
});

test('renderHtml (org): Repositories & Connections section with per-repo rows', () => {
  const html = renderHtml(orgFixture());
  assert.ok(
    html.includes('Repositories') && html.includes('Connections'),
    'Org HTML must include a "Repositories & Connections" section'
  );
  assert.ok(
    html.includes('org/service-a') && html.includes('org/legacy'),
    'Org HTML Repositories section must list each repo'
  );
});

test('labelize uppercases known acronyms', () => {
  assert.equal(labelize('ai-sdlc-adoption'), 'AI SDLC Adoption');
  assert.equal(labelize('ai-development-tooling'), 'AI Development Tooling');
  assert.equal(labelize('code-architecture'), 'Code Architecture');
});

test('html rounds float values to 2dp and labels the Points column', () => {
  const audit = {
    date: '2026-06-26',
    project: 'x',
    audit_total: 1,
    coverage: 1,
    dimensions: [
      {
        dimension: 'quality-assurance',
        date: '2026-06-26',
        score: 0,
        coverage: 0,
        checks: [
          {
            check_id: 'QA-01',
            code: [2500],
            method: 'computed',
            status: 'WARN',
            value: 0.47058823529411764,
            evidence: [],
            weight_awarded: 0,
            weight_max: 8,
            applies: true,
            reliability: { tag: 'maximal', confidence: 'high', note: null },
            source: 'AWOS audit',
            definition: 'coverage',
            hint: 'x',
            expression: '48 test files ÷ 102 modules = 0.47',
            unit: 'ratio',
          },
        ],
      },
    ],
  };
  const html = renderHtml(audit as any);
  assert.ok(
    html.includes('0.47') && !html.includes('0.47058823529411764'),
    'value must be rounded to 2dp'
  );
  assert.ok(html.includes('>Points<'), 'check table header must read "Points"');
  assert.ok(
    html.includes('48 test files ÷ 102 modules = 0.47'),
    'value tooltip must show the expression'
  );
});

test('report renders connections and missed-sources section', () => {
  const audit: AuditJson = {
    date: '2026-01-15',
    project: 'test-repo',
    audit_total: 50,
    coverage: 0.5,
    dimensions: [],
    sources: [
      {
        source: 'git',
        available: true,
        reason_if_absent: null,
        history_available_days: 400,
      },
      {
        source: 'ci',
        available: false,
        reason_if_absent: 'no CI config or connector found',
        history_available_days: null,
      },
      {
        source: 'tracker',
        available: true,
        reason_if_absent: null,
        history_available_days: 14,
      },
    ],
  };
  const md = renderMarkdown(audit);
  assert.match(md, /Connections & Sources/);
  assert.match(md, /no CI config or connector found/);
  assert.match(md, /14 days|limited history/i);
});

test('insights and recommendations render as collapsible accordions; lists have indentation', () => {
  const audit = {
    date: '2026-06-26',
    project: 'x',
    audit_total: 0,
    coverage: 0,
    dimensions: [],
    insights: [
      {
        theme: 'Strong context, weak guardrails',
        severity: 'high',
        weak_areas: ['AI-05', 'SEC-02'],
        so_what: 'risky',
        improves: 'add hooks',
      },
    ],
    recommendations: [
      {
        id: 1,
        priority: 'P0',
        title: 'Add CVE scanning',
        dimension: 'supply-chain-security',
        check_id: 'SCS-06',
        effort: 'S',
        detail: 'use a scanner',
      },
    ],
  };
  const html = renderHtml(audit as any);
  assert.ok(
    html.includes('<details') && html.includes('<summary'),
    'insights/recs use <details>/<summary>'
  );
  assert.ok(
    html.includes('AI-05') && html.includes('SCS-06'),
    'summary shows tags'
  );
  assert.ok(
    /ul\s*\{[^}]*margin/i.test(html) || /ul\s*\{[^}]*padding-left/i.test(html),
    'ul has indentation CSS'
  );
});

test('connections renders Linked repositories even when none, and a Tech Stack section', () => {
  const audit = {
    date: '2026-06-26',
    project: 'x',
    audit_total: 0,
    coverage: 0,
    dimensions: [],
    sources: [
      {
        source: 'git',
        available: true,
        reason_if_absent: null,
        history_available_days: 120,
      },
    ],
    linked_repos: [],
    tech_stack: {
      languages: [{ name: 'Python', evidence: 'src/main.py' }],
      agent_tools: [{ name: 'Claude Code', evidence: '.claude' }],
      ci: [{ name: 'Azure DevOps', evidence: 'azure-pipelines.yml' }],
      frameworks: [{ name: 'FastAPI', evidence: 'pyproject.toml' }],
    },
  };
  const html = renderHtml(audit as any);
  assert.ok(
    html.includes('Linked repositories'),
    'linked-repos heading always present'
  );
  assert.ok(
    /no linked repositories detected/i.test(html),
    'explicit empty state'
  );
  assert.ok(
    html.includes('Tech Stack') && html.includes('FastAPI'),
    'tech stack section present'
  );
});
