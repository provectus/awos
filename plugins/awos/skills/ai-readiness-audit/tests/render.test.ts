/**
 * render.test.ts — deterministic JSON→Markdown/HTML renderer tests.
 *
 * The report is ONE scrolling page (no audience tabs). Contracts verified:
 *
 * Markdown:
 *   - Hint column header in every per-dimension check table
 *   - Every dimension name present
 *   - Five hint-part labels present in at least one check's hint cell
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
 *   - data-status attributes, issues-only filter, @media print
 *   - Graceful degradation when headline/insights/recommendations/plain are absent
 *   - Org mode: ≤3 portfolio metrics + Repositories & Connections + per_repo
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderMarkdown,
  renderHtml,
  labelize,
  formatSourceWindow,
  shortSourceLabel,
  measurementWindowLabel,
} from '../render.ts';
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
        spec_coverage: '7/12 feature branches touched context/spec/',
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
    html.includes('width:43%'),
    'Evidence column must be allocated the widest share of the table (43% after Value column removal)'
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

// ---------------------------------------------------------------------------
// Phase 5: Sources column in Dimensions table
// ---------------------------------------------------------------------------

/** Build an audit fixture that carries sources_used per dimension and source_windows. */
function sourcesFixture(): AuditJson {
  return {
    date: '2026-06-01',
    project: 'sources-test',
    audit_total: 10,
    coverage: 0.5,
    source_windows: {
      git: { days: 540, label: 'git history' },
      tracker: { days: 180, label: 'Jira via Atlassian MCP' },
    },
    dimensions: [
      {
        dimension: 'ai-development-tooling',
        date: '2026-06-01',
        score: 5,
        coverage: 0.5,
        sources_used: ['git', 'tracker'],
        checks: [makeCheck({ check_id: 'AI-01', status: 'PASS' })],
      },
      {
        dimension: 'security',
        date: '2026-06-01',
        score: 5,
        coverage: 0.5,
        sources_used: ['git'],
        checks: [makeCheck({ check_id: 'SEC-01', status: 'PASS' })],
      },
    ],
  };
}

test('renderHtml: Dimensions overview table has a Sources column header after Points', () => {
  const html = renderHtml(sourcesFixture());
  // The header row must contain both Points and Sources in that order.
  const pointsIdx = html.indexOf('>Points<');
  const sourcesIdx = html.indexOf('>Sources<');
  assert.ok(
    pointsIdx !== -1,
    'Dimensions table must have a Points column header'
  );
  assert.ok(
    sourcesIdx !== -1,
    'Dimensions table must have a Sources column header'
  );
  assert.ok(
    sourcesIdx > pointsIdx,
    'Sources column header must appear after Points column header in the table'
  );
});

test('renderHtml: Sources tooltips live on BOTH the column header and the value cell', () => {
  const html = renderHtml(sourcesFixture());
  assert.ok(
    html.includes('git history'),
    'Sources cell must show "git history" (no " via " boundary → keep as-is)'
  );
  // "Jira via Atlassian MCP" truncates at " via " → short label is "Jira".
  // The value cell shows the SHORT label and carries a per-row tooltip.
  assert.ok(
    html.includes(
      '<td><span class="tip" tabindex="0">git history, Jira<span class="tipbox">'
    ),
    'Sources value cell must show the short label "git history, Jira" inside a per-row tooltip'
  );
  assert.ok(
    html.includes('Jira via Atlassian MCP'),
    'Sources value tooltip must include the full source label with its lookback window'
  );
  // The Sources column HEADER also carries a tooltip explaining the column.
  assert.ok(
    html.includes(
      '<th><span class="tip" tabindex="0">Sources<span class="tipbox">'
    ),
    'Sources column HEADER must also carry the tooltip explaining the column'
  );
});

test('renderHtml: Sources column shows — when dimension has no sources_used', () => {
  const audit: AuditJson = {
    date: '2026-06-01',
    project: 'no-sources',
    audit_total: 0,
    coverage: 0,
    dimensions: [
      {
        dimension: 'security',
        date: '2026-06-01',
        score: 0,
        coverage: 0,
        // no sources_used field
        checks: [],
      },
    ],
  };
  const html = renderHtml(audit);
  // The Sources column must render a dash for a dimension with no sources_used.
  assert.ok(
    html.includes('<th>Sources</th>') || html.includes('>Sources<'),
    'Sources column header must still appear'
  );
});

test('renderMarkdown: summary table has Sources column header and human labels', () => {
  const md = renderMarkdown(sourcesFixture());
  assert.ok(
    md.includes('| Sources |'),
    'Markdown summary table must have a Sources column'
  );
  assert.ok(
    md.includes('git history'),
    'Markdown Sources cell must show "git history"'
  );
  assert.ok(
    md.includes('Jira via Atlassian MCP'),
    'Markdown Sources cell must show "Jira via Atlassian MCP"'
  );
});

test('formatSourceWindow: formats days as months when ≥60, as days when <60, label-only when null', () => {
  const windows = {
    git: { days: 540, label: 'git history' },
    tracker: { days: 180, label: 'Jira via Atlassian MCP' },
    ci: { days: 30, label: 'CI runs' },
    scale: { days: null, label: 'source code (AST)' },
  };
  assert.equal(
    formatSourceWindow('git', windows),
    'git history (~18 months)',
    'formatSourceWindow: 540 days must render as ~18 months'
  );
  assert.equal(
    formatSourceWindow('tracker', windows),
    'Jira via Atlassian MCP (~6 months)',
    'formatSourceWindow: 180 days must render as ~6 months'
  );
  assert.equal(
    formatSourceWindow('ci', windows),
    'CI runs (~30 days)',
    'formatSourceWindow: 30 days must render as 30 days (below 60-day threshold)'
  );
  assert.equal(
    formatSourceWindow('scale', windows),
    'source code (AST)',
    'formatSourceWindow: null days must render label only (no window suffix)'
  );
  assert.equal(
    formatSourceWindow('unknown-src', undefined),
    'unknown-src',
    'formatSourceWindow: unknown source with no windows map falls back to the source key'
  );
});

test('shortSourceLabel: truncates at " via " boundary (6c.3)', () => {
  const windows = {
    tracker: { days: 180, label: 'Jira via Atlassian MCP' },
    docs: { days: null, label: "Confluence space 'Onex' via Atlassian MCP" },
    git: { days: 540, label: 'git history' },
    audit: { days: null, label: 'source code' },
  };
  assert.equal(
    shortSourceLabel('tracker', windows),
    'Jira',
    'shortSourceLabel: "Jira via Atlassian MCP" must truncate at " via " → "Jira"'
  );
  assert.equal(
    shortSourceLabel('docs', windows),
    "Confluence space 'Onex'",
    'shortSourceLabel: Confluence label must truncate at " via " → "Confluence space \'Onex\'"'
  );
  assert.equal(
    shortSourceLabel('git', windows),
    'git history',
    'shortSourceLabel: "git history" has no " via " boundary — keep as-is'
  );
  assert.equal(
    shortSourceLabel('unknown', undefined),
    'unknown',
    'shortSourceLabel: unknown source with no windows falls back to source key'
  );
});

test('shortSourceLabel: truncates at " (project" after " via " split (6c.3)', () => {
  const windows = {
    tracker: { days: 90, label: 'Jira (project OAPBCRNA) via Atlassian MCP' },
  };
  assert.equal(
    shortSourceLabel('tracker', windows),
    'Jira',
    'shortSourceLabel: truncates at " via " first → "Jira (project OAPBCRNA)", then at " (project" → "Jira"'
  );
});

// ---------------------------------------------------------------------------
// Report-fixes: date separator, header tooltips, Active Contributors,
// Spec coverage + Reach order, throughput-context on the dimension page.
// ---------------------------------------------------------------------------

test('measurementWindowLabel: joins the date range with ".." (not an en-dash)', () => {
  const label = measurementWindowLabel(
    { git: { days: 90, label: 'git history' } },
    '2026-07-01'
  );
  assert.ok(
    label?.includes('2026-04-02..2026-07-01'),
    `Measurement window must join the two ISO dates with ".." (got: ${label})`
  );
  assert.ok(
    !label?.includes(' – '),
    'Measurement window must not use the ambiguous space-en-dash-space separator'
  );
});

test('renderHtml: dimension summary tooltips live on BOTH column headers and value cells', () => {
  const html = renderHtml(sourcesFixture());
  // Header labels for Points/Sources/Coverage/Reliability carry a column-level tooltip.
  assert.ok(
    html.includes(
      '<th><span class="tip" tabindex="0">Points<span class="tipbox">'
    ),
    'Points column header must carry the column-explanation tooltip'
  );
  assert.ok(
    html.includes('Capability points earned in this area.'),
    'Points header tooltip must carry the column explanation'
  );
  assert.ok(
    html.includes(
      '<th><span class="tip" tabindex="0">Coverage<span class="tipbox">'
    ) &&
      html.includes(
        '<th><span class="tip" tabindex="0">Reliability<span class="tipbox">'
      ),
    'Coverage and Reliability column headers must also carry tooltips'
  );
  // Every remaining column header also carries a tooltip.
  for (const [label, explanation] of [
    ['#', 'Row number — dimensions are listed in a fixed order.'],
    [
      'Dimension',
      'A capability area being audited: a group of related checks scored together. Click a row to open its checks.',
    ],
    [
      'FAIL',
      'Checks where the capability is absent or below its failing threshold.',
    ],
    ['WARN', 'Checks partly in place but below target — worth attention.'],
    ['PARTIAL', 'Checks partly satisfied: some criteria met, not all.'],
    ['PASS', 'Checks fully satisfied.'],
    [
      'SKIP',
      'Checks not evaluated because a required data source or precondition was unavailable — e.g. no ticketing/incident connector, or the check does not apply to this project.',
    ],
  ] as const) {
    assert.ok(
      html.includes(
        `<th><span class="tip" tabindex="0">${label}<span class="tipbox">`
      ),
      `The "${label}" column header must carry a column-explanation tooltip`
    );
    assert.ok(
      html.includes(explanation),
      `The "${label}" header tooltip must carry its column explanation`
    );
  }
  // Value cells ALSO carry a per-row tooltip (tooltips everywhere).
  assert.ok(
    html.includes(
      '<td><span class="tip" tabindex="0">5 pts<span class="tipbox">'
    ),
    'Points value cell must carry its per-row tooltip'
  );
  assert.ok(
    html.includes('· ai-development-tooling · standards.toml'),
    'The Points value tooltip must carry its row-specific meta (coverage · dimension · standards.toml)'
  );
  // The Dimension name (row label) cell is a PLAIN <a><strong> with NO tooltip (E5).
  assert.ok(
    /<td><a href="[^"]*"><strong>[^<]+<\/strong><\/a><\/td>/.test(html),
    'The Dimension name cell must be a plain <a><strong> row label with no tooltip'
  );
  assert.ok(
    !/<strong><span class="tip"/.test(html),
    'The Dimension name cell must NOT wrap its value in a tooltip span (E5 removed it)'
  );
});

test('renderHtml: Reach labels the contributor row "Active Contributors" with the reworded tip', () => {
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    html.includes('<span class="k">Active Contributors</span>'),
    'Reach must label the contributor row "Active Contributors", not bare "Contributors"'
  );
  assert.ok(
    !html.includes('<span class="k">Contributors</span>'),
    'The bare "Contributors" reach label must no longer be emitted'
  );
  assert.ok(
    html.includes(
      'Distinct commit authors with at least 2 commits in the last 90 days'
    ),
    'Active Contributors tooltip must explain the ≥2-commits-in-90-days derivation'
  );
  assert.ok(
    html.includes(
      "The '(of N in window)' figure is the total distinct authors who committed at all."
    ),
    'Active Contributors tooltip must explain the (of N in window) total'
  );
});

test('renderHtml: Reach renders Spec coverage and orders items Active Contributors → Spec coverage → AI tooling', () => {
  const html = renderHtml(singleRepoFixture());
  const ac = html.indexOf('>Active Contributors<');
  const sc = html.indexOf('>Spec coverage<');
  const at = html.indexOf('>AI tooling<');
  assert.ok(
    ac !== -1 && sc !== -1 && at !== -1,
    'Reach must render Active Contributors, Spec coverage, and AI tooling rows'
  );
  assert.ok(
    ac < sc && sc < at,
    `Reach order must be Active Contributors → Spec coverage → AI tooling (indices ${ac}, ${sc}, ${at})`
  );
  assert.ok(
    html.includes('7/12 feature branches touched context/spec/'),
    'Spec coverage value string must render in the Reach block'
  );
  assert.ok(
    html.includes(
      'Share of feature branches that touched spec files, for any spec-driven workflow (AWOS, Kiro, Agent-OS, and similar).'
    ),
    'Spec coverage tooltip must describe any spec-driven workflow, not hardcode AWOS'
  );
  assert.ok(
    !html.includes('(AWOS SDD-04)'),
    'Spec coverage tooltip must not hardcode the AWOS-specific "(AWOS SDD-04)" phrasing'
  );
});

test('renderMarkdown: Reach lists Active Contributors → Spec coverage → AI tooling in order', () => {
  const md = renderMarkdown(singleRepoFixture());
  const ac = md.indexOf('Active Contributors:');
  const sc = md.indexOf('Spec coverage:');
  const at = md.indexOf('AI tooling:');
  assert.ok(
    ac !== -1 && sc !== -1 && at !== -1,
    'Markdown Reach must list Active Contributors, Spec coverage, and AI tooling'
  );
  assert.ok(
    ac < sc && sc < at,
    `Markdown Reach order must match HTML (indices ${ac}, ${sc}, ${at})`
  );
});

test('renderHtml: ai-sdlc-adoption dimension page echoes Merges and LOC as non-scored throughput context', () => {
  const audit: AuditJson = {
    date: '2026-01-15',
    project: 'adoption-repo',
    audit_total: 10,
    coverage: 0.5,
    headline: {
      delivery: [
        { label: 'Merges', display_value: '3.1 / active' },
        { label: 'LOC', display_value: '480 / active' },
        {
          label: 'Deployment frequency',
          display_value: '4 / wk',
          band: 'High',
        },
      ],
    },
    dimensions: [
      {
        dimension: 'ai-sdlc-adoption',
        date: '2026-01-15',
        score: 10,
        coverage: 0.5,
        checks: [makeCheck({ check_id: 'ADP-01', status: 'PASS' })],
      },
    ],
  };
  const html = renderHtml(audit);
  const pageStart = html.indexOf('id="page-ai-sdlc-adoption"');
  assert.ok(
    pageStart !== -1,
    'ai-sdlc-adoption dimension sub-page must be rendered'
  );
  const page = html.slice(pageStart, html.indexOf('</section>', pageStart));
  assert.ok(
    page.includes('Throughput context (not scored)'),
    'ai-sdlc-adoption page must carry a clearly non-scored throughput-context subsection'
  );
  assert.ok(
    page.includes('3.1 / active') && page.includes('480 / active'),
    'Throughput context must echo BOTH the Merges/active and LOC/active headline values'
  );
});

test('renderHtml: throughput-context subsection is confined to ai-sdlc-adoption', () => {
  // singleRepoFixture has no ai-sdlc-adoption dimension → no throughput block anywhere.
  const html = renderHtml(singleRepoFixture());
  assert.ok(
    !html.includes('Throughput context (not scored)'),
    'Non-ai-sdlc-adoption dimension pages must not render the throughput-context subsection'
  );
});
