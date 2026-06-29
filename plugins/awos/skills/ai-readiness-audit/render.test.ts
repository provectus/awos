// render.test.ts — unit tests for the deterministic JSON → Markdown renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderHtml } from './render.ts';
import type { AuditJson, Check, DimensionArtifact } from './render.ts';

/** Minimal valid Check fixture — extend per test. */
function makeCheck(overrides: Partial<Check> = {}): Check {
  return {
    check_id: 'TEST-01',
    code: [1001],
    method: 'detected',
    status: 'PASS',
    value: null,
    evidence: [],
    weight_awarded: 1,
    weight_max: 1,
    applies: true,
    reliability: { tag: 'maximal', confidence: 'high', note: null },
    source: 'git',
    definition: 'Test check definition',
    hint: 'Test hint',
    ...overrides,
  };
}

/** Minimal valid DimensionArtifact fixture. */
function makeDim(
  dimension: string,
  checks: Check[] = [],
  overrides: Partial<DimensionArtifact> = {}
): DimensionArtifact {
  return {
    dimension,
    date: '2026-01-01',
    score: 0,
    coverage: 0,
    checks,
    ...overrides,
  };
}

/** Minimal valid audit fixture — extend per test. */
function makeAudit(overrides: Partial<AuditJson> = {}): AuditJson {
  return {
    date: '2026-01-01',
    project: 'test-project',
    audit_total: 10,
    coverage: 0.5,
    dimensions: [],
    ...overrides,
  };
}

test('renderMarkdown includes Tech Stack section when tech_stack is present', () => {
  const audit = makeAudit({
    tech_stack: {
      languages: [
        { name: 'Python', evidence: 'src/main.py' },
        { name: 'TypeScript', evidence: 'src/index.ts' },
      ],
      agent_tools: [{ name: 'Claude Code', evidence: '.claude' }],
      ci: [{ name: 'GitHub Actions', evidence: '.github/workflows/ci.yml' }],
      frameworks: [{ name: 'FastAPI', evidence: 'pyproject.toml' }],
    },
  });
  const md = renderMarkdown(audit);
  assert.ok(
    md.includes('## Tech Stack'),
    'renderMarkdown must include a ## Tech Stack section when tech_stack is populated'
  );
  assert.ok(
    md.includes('FastAPI'),
    'Tech Stack section must list detected frameworks'
  );
  assert.ok(
    md.includes('Python'),
    'Tech Stack section must list detected languages'
  );
});

test('renderMarkdown omits Tech Stack section when tech_stack is absent', () => {
  const audit = makeAudit();
  const md = renderMarkdown(audit);
  assert.ok(
    !md.includes('## Tech Stack'),
    'renderMarkdown must not include Tech Stack when tech_stack is absent'
  );
});

test('renderMarkdown includes Linked Repositories section with a detected repo', () => {
  const audit = makeAudit({
    linked_repos: [
      { name: 'other-repo-x', kind: 'symlink', via: '.claude/skills/foo' },
    ],
  });
  const md = renderMarkdown(audit);
  assert.ok(
    md.includes('## Linked Repositories'),
    'renderMarkdown must include ## Linked Repositories section'
  );
  assert.ok(
    md.includes('other-repo-x'),
    'Linked Repositories section must list the detected repo name'
  );
});

test('renderMarkdown shows "None detected." for Linked Repositories when empty', () => {
  const audit = makeAudit({ linked_repos: [] });
  const md = renderMarkdown(audit);
  assert.ok(
    md.includes('## Linked Repositories'),
    'renderMarkdown must always include ## Linked Repositories section'
  );
  assert.ok(
    md.includes('None detected.'),
    'Linked Repositories section must say "None detected." when list is empty'
  );
});

test('renderMarkdown shows "None detected." when linked_repos is absent', () => {
  const audit = makeAudit();
  const md = renderMarkdown(audit);
  assert.ok(
    md.includes('## Linked Repositories'),
    'renderMarkdown must always render the Linked Repositories section'
  );
  assert.ok(
    md.includes('None detected.'),
    'Linked Repositories section must say "None detected." when absent from audit JSON'
  );
});

test('Dimensions table must green-highlight non-zero PASS counts (issue #4)', () => {
  const dim = makeDim('ai-tooling', [
    makeCheck({ check_id: 'T-01', status: 'PASS', applies: true }),
    makeCheck({ check_id: 'T-02', status: 'FAIL', applies: true }),
  ]);
  const audit = makeAudit({ dimensions: [dim] });
  const html = renderHtml(audit);
  assert.match(
    html,
    /color:#16a34a;font-weight:600">\s*\d+<\/span>/,
    'Dimensions table must green-highlight non-zero PASS counts (issue #4)'
  );
});

test('Overview must show three-value metric count (scored/executed/supported) above Dimensions table (issue #1)', () => {
  const dim = makeDim('test-dim', [
    makeCheck({ check_id: 'T-01', status: 'PASS', applies: true }),
    makeCheck({ check_id: 'T-02', status: 'WARN', applies: true }),
    makeCheck({ check_id: 'T-03', status: 'FAIL', applies: true }),
    makeCheck({ check_id: 'T-04', status: 'SKIP', applies: false }),
  ]);
  const audit = makeAudit({ dimensions: [dim] });
  const html = renderHtml(audit);
  assert.match(
    html,
    /Metrics:/,
    'Overview must show three-value metric count above Dimensions table (issue #1)'
  );
  // Default weight_awarded=1 for all 4 checks, but SKIP checks are excluded from scored.
  // T-04 is SKIP so scored=3; executed=3 (non-SKIP); supported=4.
  assert.match(
    html,
    /3 scored/,
    'Overview must show correct scored count (3 non-SKIP checks with weight_awarded > 0; SKIP checks excluded)'
  );
  assert.match(
    html,
    /3 executed/,
    'Overview must show correct executed count (3 non-SKIP checks)'
  );
  assert.match(
    html,
    /4 supported/,
    'Overview must show correct supported count (4 total checks in catalog)'
  );
});

test('Each dimension page needs prev/next nav to adjacent dimensions (issue #7)', () => {
  const dims = [
    makeDim('dim-first'),
    makeDim('dim-middle'),
    makeDim('dim-last'),
  ];
  const audit = makeAudit({ dimensions: dims });
  const html = renderHtml(audit);
  const middleStart = html.indexOf('id="page-dim-middle"');
  assert.ok(middleStart !== -1, 'Middle dimension page must exist in HTML');
  const middleEnd = html.indexOf('</section>', middleStart);
  const middleHtml = html.slice(middleStart, middleEnd + 10);
  assert.match(
    middleHtml,
    /href="#dim\/dim-first"/,
    'Each dimension page needs prev/next nav to adjacent dimensions (issue #7)'
  );
  assert.match(
    middleHtml,
    /href="#dim\/dim-last"/,
    'Each dimension page needs prev/next nav to adjacent dimensions (issue #7)'
  );
});

test('Value column removed: dimension check table has no Value column header (issue #10)', () => {
  const dim = makeDim('test-no-val-col', [
    makeCheck({ check_id: 'T-A', status: 'PASS', applies: true }),
  ]);
  const audit = makeAudit({ dimensions: [dim] });
  const html = renderHtml(audit);
  const pageStart = html.indexOf('id="page-test-no-val-col"');
  assert.ok(pageStart !== -1, 'Dimension page must exist in HTML');
  const pageEnd = html.indexOf('</section>', pageStart);
  const pageHtml = html.slice(pageStart, pageEnd + 10);
  assert.ok(
    !pageHtml.includes('<th>Value</th>'),
    'Value column removed: dimension check table must have no Value column header (issue #10)'
  );
});

test('PARTIAL status badge renders with amber color for a PARTIAL check', () => {
  const partialCheck = makeCheck({
    check_id: 'P-01',
    status: 'PARTIAL' as Check['status'],
    applies: true,
    weight_awarded: 0.6,
    weight_max: 1,
    confidence: 0.8,
  });
  const dim = makeDim('test-partial', [partialCheck]);
  const audit = makeAudit({ dimensions: [dim] });
  const html = renderHtml(audit);
  const pageStart = html.indexOf('id="page-test-partial"');
  assert.ok(pageStart !== -1, 'Dimension page must exist');
  const pageEnd = html.indexOf('</section>', pageStart);
  const pageHtml = html.slice(pageStart, pageEnd + 10);
  assert.match(
    pageHtml,
    /PARTIAL/,
    'PARTIAL badge must appear in the dimension page for a PARTIAL check'
  );
  assert.match(
    pageHtml,
    /#f59e0b/,
    'PARTIAL badge must use the amber badge color (#f59e0b)'
  );
});

test('Confidence column header appears in dimension check table', () => {
  const dim = makeDim('test-conf-header', [
    makeCheck({
      check_id: 'C-01',
      status: 'PASS',
      applies: true,
      confidence: 1.0,
    } as Check),
  ]);
  const audit = makeAudit({ dimensions: [dim] });
  const html = renderHtml(audit);
  const pageStart = html.indexOf('id="page-test-conf-header"');
  assert.ok(pageStart !== -1, 'Dimension page must exist');
  const pageEnd = html.indexOf('</section>', pageStart);
  const pageHtml = html.slice(pageStart, pageEnd + 10);
  assert.match(
    pageHtml,
    /<th>Confidence<\/th>/,
    'Confidence column header must appear in the check table'
  );
});

test('Confidence cell shows 50% for a check with confidence 0.5', () => {
  const dim = makeDim('test-conf-50', [
    makeCheck({
      check_id: 'C-02',
      status: 'PASS',
      applies: true,
      confidence: 0.5,
    } as Check),
  ]);
  const audit = makeAudit({ dimensions: [dim] });
  const html = renderHtml(audit);
  const pageStart = html.indexOf('id="page-test-conf-50"');
  assert.ok(pageStart !== -1, 'Dimension page must exist');
  const pageEnd = html.indexOf('</section>', pageStart);
  const pageHtml = html.slice(pageStart, pageEnd + 10);
  assert.match(
    pageHtml,
    /50%/,
    'Confidence cell must show "50%" for a check with confidence 0.5'
  );
});

test('Confidence cell shows dash for a SKIP check', () => {
  const dim = makeDim('test-conf-skip', [
    makeCheck({
      check_id: 'C-03',
      status: 'SKIP',
      applies: false,
      confidence: 0,
    } as Check),
  ]);
  const audit = makeAudit({ dimensions: [dim] });
  const html = renderHtml(audit);
  const pageStart = html.indexOf('id="page-test-conf-skip"');
  assert.ok(pageStart !== -1, 'Dimension page must exist');
  const pageEnd = html.indexOf('</section>', pageStart);
  const pageHtml = html.slice(pageStart, pageEnd + 10);
  // The confidence cell for a SKIP check must contain the dash character
  assert.ok(
    pageHtml.includes('<td>—</td>') ||
      pageHtml.includes('<td>&mdash;</td>') ||
      pageHtml.includes('>—<'),
    'Confidence cell must show "—" for a SKIP check'
  );
});

test('Dimension header shows weight-averaged mean confidence percent', () => {
  const dim = makeDim('test-mean-conf', [
    makeCheck({
      check_id: 'D-01',
      status: 'PASS',
      applies: true,
      weight_max: 2,
      confidence: 0.8,
    } as Check),
    makeCheck({
      check_id: 'D-02',
      status: 'PASS',
      applies: true,
      weight_max: 2,
      confidence: 0.6,
    } as Check),
  ]);
  const audit = makeAudit({ dimensions: [dim] });
  const html = renderHtml(audit);
  const pageStart = html.indexOf('id="page-test-mean-conf"');
  assert.ok(pageStart !== -1, 'Dimension page must exist');
  const pageEnd = html.indexOf('</section>', pageStart);
  const pageHtml = html.slice(pageStart, pageEnd + 10);
  // Mean confidence = (0.8*2 + 0.6*2) / (2+2) = 2.8/4 = 0.70 → 70%
  assert.match(
    pageHtml,
    /70%/,
    'Dimension header must show weight-averaged mean confidence (70% for 0.8 and 0.6 each weighted by 2)'
  );
});

test('tech stack renders names with evidence tooltips and no ~0 days', () => {
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
    linked_repos: [
      { name: 'onex-discovery-awos', kind: 'symlink', via: '.claude/skills' },
    ],
    tech_stack: {
      languages: [
        { name: 'Python', evidence: '149 .py files · pyproject.toml' },
      ],
      agent_tools: [{ name: 'Claude Code', evidence: '.claude' }],
      ci: [{ name: 'Azure DevOps', evidence: 'azure-pipelines.yml' }],
      frameworks: [
        { name: 'FastAPI', evidence: 'dependency "fastapi" in a manifest' },
      ],
    },
  };
  const html = renderHtml(audit as any);
  assert.ok(html.includes('149 .py files'), 'language evidence shown');
  assert.ok(
    html.includes('dependency &quot;fastapi&quot;') ||
      html.includes('dependency "fastapi"'),
    'framework evidence shown'
  );
  assert.ok(
    html.includes('onex-discovery-awos'),
    'linked repo by repo-root name'
  );
  assert.ok(!/~0 days/.test(html), 'never render ~0 days');
});

test('Fix 2: overview Reliability cell must show "not-reliable" (not "maximal") when dimension checks are not-reliable but not minimal', () => {
  const notReliableCheck = makeCheck({
    check_id: 'NR-01',
    status: 'PASS',
    applies: true,
    reliability: { tag: 'not-reliable', confidence: 'high', note: null },
  });
  const dim = makeDim('test-not-reliable', [notReliableCheck]);
  const audit = makeAudit({ dimensions: [dim] });
  const html = renderHtml(audit);
  // The overview Dimensions table must NOT show "maximal" for this dimension.
  // Extract the overview table row to avoid false positives from per-check cells.
  const overviewEnd = html.indexOf('<section class="dim-page"');
  const overviewHtml = overviewEnd !== -1 ? html.slice(0, overviewEnd) : html;
  assert.ok(
    !overviewHtml.includes('>maximal<') &&
      !overviewHtml.match(/>\s*maximal\s*</),
    'overview Reliability cell must not show "maximal" when all applicable checks are not-reliable (Fix 2)'
  );
  assert.ok(
    overviewHtml.includes('not-reliable'),
    'overview Reliability cell must show "not-reliable" when applicable checks carry that tag (Fix 2)'
  );
});

// ---------------------------------------------------------------------------
// 6c.3 — Short source labels in Sources cell, verbose in tooltip
// ---------------------------------------------------------------------------

test('Sources cell shows short label; verbose label goes to tooltip only (6c.3)', () => {
  const audit = makeAudit({
    source_windows: {
      git: { days: 540, label: 'git history' },
      tracker: { days: 180, label: 'Jira via Atlassian MCP' },
    },
    dimensions: [
      makeDim('dim-a', [makeCheck()], {
        sources_used: ['git', 'tracker'],
      } as any),
    ],
  });
  const html = renderHtml(audit);
  // Short label for tracker (truncated at ' via '): 'Jira'
  // Cell text rendered as: "git history, Jira" inside the tip span value.
  assert.ok(
    html.includes('git history, Jira'),
    'Sources cell must show short combined labels: "git history, Jira" (tracker truncated at " via ")'
  );
  // Verbose label still appears in the tooltip text.
  assert.ok(
    html.includes('Jira via Atlassian MCP'),
    'Verbose source label must still appear in the Sources tooltip'
  );
});

// ---------------------------------------------------------------------------
// 6c.4 — Visible per-check source citation link
// ---------------------------------------------------------------------------

test('Per-check row shows visible source citation link when source_url is set (6c.4)', () => {
  const check = makeCheck({
    check_id: 'SRC-01',
    status: 'PASS',
    applies: true,
    source_url: 'https://example.com/standard',
    source_date: '2024-01',
  } as any);
  const dim = makeDim('test-src-link', [check]);
  const audit = makeAudit({ dimensions: [dim] });
  const html = renderHtml(audit);
  const pageStart = html.indexOf('id="page-test-src-link"');
  assert.ok(pageStart !== -1, 'Dimension page must exist in HTML');
  const pageEnd = html.indexOf('</section>', pageStart);
  const pageHtml = html.slice(pageStart, pageEnd + 10);
  assert.ok(
    pageHtml.includes('href="https://example.com/standard"'),
    'Per-check row must contain a visible anchor link to source_url (6c.4)'
  );
  assert.ok(
    pageHtml.includes('target="_blank"'),
    'Source citation link must open in a new tab (6c.4)'
  );
  assert.ok(
    pageHtml.includes('rel="noopener"'),
    'Source citation link must carry rel="noopener" (6c.4)'
  );
});

// ---------------------------------------------------------------------------
// 6c.5 — Linked repos grouped by kind (symlink / submodule / mcp)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fix 1 — Markdown per-check source link
// ---------------------------------------------------------------------------

test('renderMarkdown includes source citation link in check row when source_url is set (Fix 1)', () => {
  const check = makeCheck({
    check_id: 'SRC-MD-01',
    status: 'PASS',
    applies: true,
    source_url: 'https://example.com/standard',
    source_date: '2024-01',
    source: 'NIST',
  } as any);
  const dim = makeDim('test-md-src-link', [check]);
  const audit = makeAudit({ dimensions: [dim] });
  const md = renderMarkdown(audit);
  assert.ok(
    md.includes('](https://example.com/standard)'),
    'renderMarkdown check row must include a markdown link to source_url (Fix 1)'
  );
});

// ---------------------------------------------------------------------------
// Fix 2 — Unit-only numeric value shown in Evidence
// ---------------------------------------------------------------------------

test('HTML evidence shows fmtValue(value) and unit for a check with value+unit but no expression (Fix 2)', () => {
  const check = makeCheck({
    check_id: 'UV-01',
    status: 'PASS',
    applies: true,
    value: 0.62,
    unit: 'ratio',
    evidence: [],
  } as any);
  const dim = makeDim('test-unit-val', [check]);
  const audit = makeAudit({ dimensions: [dim] });
  const html = renderHtml(audit);
  const pageStart = html.indexOf('id="page-test-unit-val"');
  assert.ok(pageStart !== -1, 'Dimension page must exist in HTML');
  const pageEnd = html.indexOf('</section>', pageStart);
  const pageHtml = html.slice(pageStart, pageEnd + 10);
  assert.ok(
    pageHtml.includes('0.62'),
    'Evidence cell must show fmtValue(value) for a unit-only-no-expression check (Fix 2)'
  );
  assert.ok(
    pageHtml.includes('ratio'),
    'Evidence cell must show the unit for a unit-only-no-expression check (Fix 2)'
  );
});

test('Linked repos are grouped by kind with section headings (6c.5)', () => {
  const audit = makeAudit({
    linked_repos: [
      { name: 'ext-lib', kind: 'symlink', via: 'src/lib' },
      { name: 'ui-kit', kind: 'submodule', via: '.gitmodules' },
      { name: 'github-mcp', kind: 'mcp', via: '.mcp.json' },
    ],
  });
  const html = renderHtml(audit);
  assert.ok(
    html.includes('Symlinks'),
    'Symlinks group heading must appear (6c.5)'
  );
  assert.ok(
    html.includes('Git submodules'),
    'Git submodules group heading must appear (6c.5)'
  );
  assert.ok(
    html.includes('MCP servers'),
    'MCP servers group heading must appear (6c.5)'
  );
  assert.ok(html.includes('ext-lib'), 'symlink repo name must appear (6c.5)');
  assert.ok(html.includes('ui-kit'), 'submodule repo name must appear (6c.5)');
  assert.ok(html.includes('github-mcp'), 'MCP server name must appear (6c.5)');
});
