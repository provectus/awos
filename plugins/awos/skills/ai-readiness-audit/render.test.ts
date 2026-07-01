// render.test.ts — unit tests for the deterministic JSON → Markdown renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderHtml } from './render.ts';
import type {
  AuditJson,
  Check,
  DimensionArtifact,
  DeliveryMetric,
  PerRepoSummary,
} from './render.ts';

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
  // Cell text rendered as plain text: "git history, Jira".
  assert.ok(
    html.includes('git history, Jira'),
    'Sources cell must show short combined labels: "git history, Jira" (tracker truncated at " via ")'
  );
  // Summary-table tooltips live on the column labels, not the values: the "Sources"
  // header carries the column explanation, and the value cell is plain (no per-row tip).
  assert.ok(
    html.includes(`<th><span class="tip"`) &&
      html.includes('Data sources feeding this dimension.'),
    'The "Sources" column tooltip must be on the header label, not the value cell'
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

// ---------------------------------------------------------------------------
// Task 4.1 — gated delivery-metric headline rows
// ---------------------------------------------------------------------------

test('HTML headline renders gated-absent delivery metrics as "needs connector" note with no band chip, and present metrics normally (Task 4.1)', () => {
  // 9-row fixture: mix of non-gated/present, gated/absent (various absent forms),
  // and gated/present (connector was available, so render normally).
  const delivery: DeliveryMetric[] = [
    // Row 1: non-gated, value present, band present → value + colored band chip
    { label: 'Deploy Frequency', display_value: '12/week', band: 'elite' },
    // Row 2: non-gated, value present, band present → value + colored band chip
    { label: 'Lead Time', display_value: '2 days', band: 'high' },
    // Row 3: non-gated, value present, no band → value, no band chip
    { label: 'Change Failure Rate', display_value: '1%' },
    // Row 4: non-gated, value present, band → value + band chip
    { label: 'MTTR', display_value: '< 1 hour', band: 'elite' },
    // Row 5: gated tracker, absent via em-dash → "needs ticketing connector", no band chip
    { label: 'Ticket Cycle Time', display_value: '—', gated: 'tracker' },
    // Row 6: gated tracker, absent via empty string → "needs ticketing connector"
    { label: 'Ticket Throughput', display_value: '', gated: 'tracker' },
    // Row 7: gated incident, absent via hyphen → "needs incident connector", no band chip
    { label: 'Incident Rate', display_value: '-', gated: 'incident' },
    // Row 8: gated incident, absent via missing key → "needs incident connector"
    {
      label: 'MTTD',
      gated: 'incident',
    },
    // Row 9: gated tracker, but display_value IS present (connector available) → render normally with band chip
    {
      label: 'Tracker Velocity',
      display_value: '42/sprint',
      band: 'medium',
      gated: 'tracker',
    },
  ];

  const audit = makeAudit({ headline: { delivery } });
  const html = renderHtml(audit);

  // Contract: present non-gated metrics show their display_value and a colored band chip
  assert.ok(
    html.includes('12/week'),
    'Deploy Frequency display_value must appear in HTML (non-gated present, Task 4.1)'
  );
  assert.ok(
    html.includes('class="band"') && html.includes('elite'),
    'Elite band chip must appear for Deploy Frequency (non-gated present, Task 4.1)'
  );
  assert.ok(
    html.includes('2 days'),
    'Lead Time display_value must appear in HTML (non-gated present, Task 4.1)'
  );
  assert.ok(
    html.includes('1%'),
    'Change Failure Rate display_value must appear in HTML (non-gated, no band, Task 4.1)'
  );
  assert.ok(
    html.includes('&lt; 1 hour'),
    'MTTR display_value must be escaped and appear in HTML (non-gated present, Task 4.1)'
  );

  // Contract: gated-absent tracker metrics render the "needs ticketing connector" note and NO band chip in their value cell
  assert.ok(
    html.includes('needs ticketing connector'),
    'Gated-absent tracker metrics must render "needs ticketing connector" note (Task 4.1)'
  );
  // Verify the absent gated rows do NOT render a band chip for their label
  // We check the Ticket Cycle Time kv block does not contain a band chip
  const ticketCycleIdx = html.indexOf('Ticket Cycle Time');
  assert.ok(
    ticketCycleIdx !== -1,
    'Ticket Cycle Time label must appear (Task 4.1)'
  );
  const ticketCycleKv = html.slice(
    ticketCycleIdx,
    html.indexOf('</div>', ticketCycleIdx + 1) + 6
  );
  assert.ok(
    !ticketCycleKv.includes('class="band"'),
    'Gated-absent tracker metric must NOT render a band chip (Task 4.1)'
  );

  // Contract: gated-absent incident metrics render the "needs incident connector" note and NO band chip
  assert.ok(
    html.includes('needs incident connector'),
    'Gated-absent incident metrics must render "needs incident connector" note (Task 4.1)'
  );
  const incidentRateIdx = html.indexOf('Incident Rate');
  assert.ok(
    incidentRateIdx !== -1,
    'Incident Rate label must appear (Task 4.1)'
  );
  const incidentRateKv = html.slice(
    incidentRateIdx,
    html.indexOf('</div>', incidentRateIdx + 1) + 6
  );
  assert.ok(
    !incidentRateKv.includes('class="band"'),
    'Gated-absent incident metric must NOT render a band chip (Task 4.1)'
  );

  // Contract: gated metric WITH a present display_value renders normally (value + band chip)
  assert.ok(
    html.includes('42/sprint'),
    'Gated tracker metric with present display_value must render its value (Task 4.1)'
  );
  const trackerVelocityIdx = html.indexOf('Tracker Velocity');
  assert.ok(
    trackerVelocityIdx !== -1,
    'Tracker Velocity label must appear (Task 4.1)'
  );
  const trackerVelocityKv = html.slice(
    trackerVelocityIdx,
    html.indexOf('</div>', trackerVelocityIdx + 1) + 6
  );
  assert.ok(
    trackerVelocityKv.includes('class="band"'),
    'Gated metric with present value must render its band chip (Task 4.1)'
  );
});

test('Markdown headline renders gated-absent delivery metrics as "needs connector" note with no band column, and present metrics normally (Task 4.1)', () => {
  const delivery: DeliveryMetric[] = [
    // Present non-gated → value + band
    { label: 'Deploy Frequency', display_value: '12/week', band: 'elite' },
    // Gated tracker absent → note, no band
    { label: 'Ticket Cycle Time', display_value: '—', gated: 'tracker' },
    // Gated incident absent → note, no band
    { label: 'Incident Rate', display_value: '-', gated: 'incident' },
    // Gated tracker present → render normally
    {
      label: 'Tracker Velocity',
      display_value: '42/sprint',
      band: 'medium',
      gated: 'tracker',
    },
  ];

  const audit = makeAudit({ headline: { delivery } });
  const md = renderMarkdown(audit);

  // Contract: present metrics render their value and band
  assert.ok(
    md.includes('12/week'),
    'Present non-gated metric must render its display_value in Markdown (Task 4.1)'
  );
  assert.ok(
    md.includes('elite'),
    'Present non-gated metric must render its band in Markdown (Task 4.1)'
  );

  // Contract: gated-absent tracker renders "needs ticketing connector" note, no band cell
  assert.ok(
    md.includes('needs ticketing connector'),
    'Gated-absent tracker metric must render "needs ticketing connector" in Markdown (Task 4.1)'
  );

  // Contract: gated-absent incident renders "needs incident connector" note
  assert.ok(
    md.includes('needs incident connector'),
    'Gated-absent incident metric must render "needs incident connector" in Markdown (Task 4.1)'
  );

  // Contract: gated metric with present value renders normally (value + band)
  assert.ok(
    md.includes('42/sprint'),
    'Gated tracker metric with present display_value must render its value in Markdown (Task 4.1)'
  );
  assert.ok(
    md.includes('medium'),
    'Gated tracker metric with present display_value must render its band in Markdown (Task 4.1)'
  );
});

// ---------------------------------------------------------------------------
// Task 5.3 — Per-repo org table with delivery columns + links to per-repo reports
// ---------------------------------------------------------------------------

/** Two-repo fixture for the Task 5.3 per-repo table tests. Repo A has all
 * delivery values populated; Repo B has all delivery values null to verify
 * the "—" fallback path for every column. */
function makeOrgAuditWithPerRepo(): AuditJson {
  const repoA: PerRepoSummary = {
    repo: 'acme/backend',
    contributors: 5,
    awarded_weight: 12,
    sources_reachable: ['git'],
    has_ai_tooling: true,
    audit_total: 12,
    coverage: 0.75,
    merges_per_active: 3.2,
    loc_per_active: 450.0,
    deploy_freq: 2.5,
    rework_rate: 0.08,
    lead_time: 24.0,
    change_fail: 0.05,
  };
  const repoB: PerRepoSummary = {
    repo: 'acme/frontend',
    contributors: null,
    awarded_weight: 7,
    sources_reachable: [],
    has_ai_tooling: false,
    audit_total: 7,
    coverage: 0.4,
    merges_per_active: null,
    loc_per_active: null,
    deploy_freq: null,
    rework_rate: null,
    lead_time: null,
    change_fail: null,
  };
  return makeAudit({
    portfolio_metrics: [
      {
        metric: 'org_ai_tooling_coverage',
        value: 0.5,
        description: 'fraction with AI tooling',
        repos_counted: 2,
        contributor_weighted: false,
      },
    ],
    per_repo: [repoA, repoB],
  });
}

test('HTML per-repo table (Task 5.3): one row per repo with all new columns in order', () => {
  const audit = makeOrgAuditWithPerRepo();
  const html = renderHtml(audit);

  // Contract: both repos appear in the table
  assert.ok(
    html.includes('acme/backend'),
    'HTML per-repo table must include repo A name (Task 5.3)'
  );
  assert.ok(
    html.includes('acme/frontend'),
    'HTML per-repo table must include repo B name (Task 5.3)'
  );

  // Contract: Repo cell links to per-repo/<repo>/report.html (relative path)
  assert.ok(
    html.includes('href="per-repo/acme/backend/report.html"'),
    'HTML per-repo table: repo cell must link to per-repo/<repo>/report.html (Task 5.3)'
  );
  assert.ok(
    html.includes('href="per-repo/acme/frontend/report.html"'),
    'HTML per-repo table: repo B cell must link to per-repo/<repo>/report.html (Task 5.3)'
  );

  // Contract: column headers present in order
  const headerOrder = [
    'Repo',
    'Points',
    'Coverage',
    'Merges/active',
    'LOC/active',
    'Deploy freq',
    'Rework rate',
    'Lead time',
    'Change-fail',
    'Cycle time',
    'MTTR',
  ];
  let lastIdx = -1;
  for (const col of headerOrder) {
    const idx = html.indexOf(col, lastIdx + 1);
    assert.ok(
      idx !== -1,
      `HTML per-repo table header must contain column "${col}" (Task 5.3)`
    );
    assert.ok(
      idx > lastIdx,
      `HTML per-repo table column "${col}" must appear after prior columns (Task 5.3)`
    );
    lastIdx = idx;
  }

  // Contract: delivery values formatted correctly for repo A
  assert.ok(
    html.includes('2.5 / wk'),
    'HTML per-repo table: deploy_freq must render as "<n> / wk" (Task 5.3)'
  );
  assert.ok(
    html.includes('8.0%'),
    'HTML per-repo table: rework_rate must render as "<pct>%" ×100 1dp (Task 5.3)'
  );
  assert.ok(
    html.includes('24.0 h'),
    'HTML per-repo table: lead_time must render as "<n> h" (Task 5.3)'
  );
  assert.ok(
    html.includes('5.0%'),
    'HTML per-repo table: change_fail must render as "<pct>%" ×100 (Task 5.3)'
  );
  assert.ok(
    html.includes('3.2'),
    'HTML per-repo table: merges_per_active must render rounded to 1dp (Task 5.3)'
  );

  // Contract: null delivery values render as "—"
  // repo B has all delivery nulls; verify the em-dash appears (multiple times expected)
  const dashCount = (html.match(/—/g) ?? []).length;
  assert.ok(
    dashCount >= 6,
    `HTML per-repo table: null delivery values must render as "—"; found ${dashCount} (Task 5.3)`
  );

  // Contract: Cycle time and MTTR columns are always "—"
  // Header contains the labels; data cells are always dashes
  assert.ok(
    html.includes('Cycle time'),
    'HTML per-repo table must include Cycle time column header (Task 5.3)'
  );
  assert.ok(
    html.includes('MTTR'),
    'HTML per-repo table must include MTTR column header (Task 5.3)'
  );

  // Contract: footnotes present
  assert.ok(
    html.includes('Cycle time') && html.includes('ticketing connector'),
    'HTML per-repo table must include Cycle time footnote about ticketing connector (Task 5.3)'
  );
  assert.ok(
    html.includes('MTTR') && html.includes('incident connector'),
    'HTML per-repo table must include MTTR footnote about incident connector (Task 5.3)'
  );
});

test('Markdown per-repo table (Task 5.3): one row per repo with all new columns in order', () => {
  const audit = makeOrgAuditWithPerRepo();
  const md = renderMarkdown(audit);

  // Contract: ## Repositories section present
  assert.ok(
    md.includes('## Repositories'),
    'Markdown must include ## Repositories section (Task 5.3)'
  );

  // Contract: both repos appear
  assert.ok(
    md.includes('acme/backend'),
    'Markdown per-repo table must include repo A (Task 5.3)'
  );
  assert.ok(
    md.includes('acme/frontend'),
    'Markdown per-repo table must include repo B (Task 5.3)'
  );

  // Contract: Repo cell is a Markdown link to per-repo/<repo>/report.html
  assert.ok(
    md.includes('[acme/backend](per-repo/acme/backend/report.html)'),
    'Markdown per-repo table: repo cell must be a link to per-repo/<repo>/report.html (Task 5.3)'
  );
  assert.ok(
    md.includes('[acme/frontend](per-repo/acme/frontend/report.html)'),
    'Markdown per-repo table: repo B cell must be a link to per-repo/<repo>/report.html (Task 5.3)'
  );

  // Contract: column headers present in order
  const headerLine = md
    .split('\n')
    .find((l) => l.includes('| Repo |') && l.includes('Points'));
  assert.ok(
    headerLine !== undefined,
    'Markdown per-repo table must have a header row with Repo and Points (Task 5.3)'
  );
  const colOrder = [
    'Repo',
    'Points',
    'Coverage',
    'Merges/active',
    'LOC/active',
    'Deploy freq',
    'Rework rate',
    'Lead time',
    'Change-fail',
    'Cycle time',
    'MTTR',
  ];
  let last = -1;
  for (const col of colOrder) {
    const pos = headerLine!.indexOf(col, last + 1);
    assert.ok(
      pos !== -1,
      `Markdown header must contain column "${col}" (Task 5.3)`
    );
    assert.ok(
      pos > last,
      `Markdown column "${col}" must appear after prior columns (Task 5.3)`
    );
    last = pos;
  }

  // Contract: delivery values formatted correctly for repo A
  assert.ok(
    md.includes('2.5 / wk'),
    'Markdown per-repo table: deploy_freq must render as "<n> / wk" (Task 5.3)'
  );
  assert.ok(
    md.includes('8.0%'),
    'Markdown per-repo table: rework_rate must render as "<pct>%" ×100 1dp (Task 5.3)'
  );
  assert.ok(
    md.includes('24.0 h'),
    'Markdown per-repo table: lead_time must render as "<n> h" (Task 5.3)'
  );
  assert.ok(
    md.includes('5.0%'),
    'Markdown per-repo table: change_fail must render as "<pct>%" ×100 (Task 5.3)'
  );
  assert.ok(
    md.includes('3.2'),
    'Markdown per-repo table: merges_per_active must render to 1dp (Task 5.3)'
  );

  // Contract: null delivery values render as "—"
  const repoBRow = md.split('\n').find((l) => l.includes('acme/frontend'));
  assert.ok(
    repoBRow !== undefined,
    'Markdown per-repo table: repo B row must exist (Task 5.3)'
  );
  const dashesInRowB = (repoBRow!.match(/—/g) ?? []).length;
  assert.ok(
    dashesInRowB >= 6,
    `Markdown per-repo table: repo B must have ≥6 "—" for null delivery values; found ${dashesInRowB} (Task 5.3)`
  );

  // Contract: Cycle time and MTTR are always "—"
  assert.ok(
    md.includes('Cycle time'),
    'Markdown per-repo table must include Cycle time column header (Task 5.3)'
  );
  assert.ok(
    md.includes('MTTR'),
    'Markdown per-repo table must include MTTR column header (Task 5.3)'
  );

  // Contract: footnotes appear below the table
  assert.ok(
    md.includes('ticketing connector'),
    'Markdown per-repo table must include Cycle time footnote about ticketing connector (Task 5.3)'
  );
  assert.ok(
    md.includes('incident connector'),
    'Markdown per-repo table must include MTTR footnote about incident connector (Task 5.3)'
  );
});

// ---------------------------------------------------------------------------
// Task 5.4 — org Connections & Sources aggregated view
// ---------------------------------------------------------------------------

import type { OrgConnections } from './render.ts';

/**
 * Org-mode audit fixture with org_connections populated.
 * Uses source_windows to verify sourceFullLabel is called for source labels.
 *
 *   sources: git(8), tracker(5)
 *   languages: Python(3), TypeScript(1)
 *   frameworks: FastAPI(2)
 *   agent_tools: Claude Code(4)
 *   ci: GitHub Actions(6)
 *   linked_repos: awos-recruitment(2)
 */
function makeOrgAuditWithConnections(): AuditJson {
  const org_connections: OrgConnections = {
    sources: [
      { name: 'git', count: 8 },
      { name: 'tracker', count: 5 },
    ],
    languages: [
      { name: 'Python', count: 3 },
      { name: 'TypeScript', count: 1 },
    ],
    frameworks: [{ name: 'FastAPI', count: 2 }],
    agent_tools: [{ name: 'Claude Code', count: 4 }],
    ci: [{ name: 'GitHub Actions', count: 6 }],
    linked_repos: [{ name: 'awos-recruitment', count: 2 }],
  };

  return {
    ...makeAudit({
      portfolio_metrics: [
        {
          metric: 'org_capability_score',
          value: 42,
          description: 'test',
          contributor_weighted: false,
          repos_counted: 8,
        },
      ],
      source_windows: {
        git: { days: 90, label: 'git history' },
        tracker: { days: 30, label: 'Jira' },
      },
      org_connections,
    }),
  } as AuditJson;
}

test('renderHtml org mode: org_connections sources rendered with sourceFullLabel and repo counts (Task 5.4)', () => {
  const audit = makeOrgAuditWithConnections();
  const html = renderHtml(audit);
  // Contract: source labels come from sourceFullLabel (uses source_windows label)
  assert.ok(
    html.includes('git history (8)'),
    'HTML org Connections must render "git history (8)" using sourceFullLabel for the git key'
  );
  assert.ok(
    html.includes('Jira (5)'),
    'HTML org Connections must render "Jira (5)" using the source_windows label for tracker'
  );
});

test('renderHtml org mode: org_connections tech and linked items rendered with counts (Task 5.4)', () => {
  const audit = makeOrgAuditWithConnections();
  const html = renderHtml(audit);
  assert.ok(
    html.includes('Python (3)'),
    'HTML org Connections must render languages with repo count: "Python (3)"'
  );
  assert.ok(
    html.includes('TypeScript (1)'),
    'HTML org Connections must render languages with repo count: "TypeScript (1)"'
  );
  assert.ok(
    html.includes('FastAPI (2)'),
    'HTML org Connections must render frameworks with repo count: "FastAPI (2)"'
  );
  assert.ok(
    html.includes('Claude Code (4)'),
    'HTML org Connections must render agent_tools with repo count: "Claude Code (4)"'
  );
  assert.ok(
    html.includes('GitHub Actions (6)'),
    'HTML org Connections must render CI with repo count: "GitHub Actions (6)"'
  );
  assert.ok(
    html.includes('awos-recruitment (2)'),
    'HTML org Connections must render linked_repos with repo count: "awos-recruitment (2)"'
  );
});

test('renderMarkdown org mode: org_connections rendered with repo counts (Task 5.4)', () => {
  const audit = makeOrgAuditWithConnections();
  const md = renderMarkdown(audit);
  // Contract: source labels use sourceFullLabel
  assert.ok(
    md.includes('git history (8)'),
    'Markdown org Connections must render "git history (8)" using sourceFullLabel for the git key'
  );
  assert.ok(
    md.includes('Jira (5)'),
    'Markdown org Connections must render "Jira (5)" using the source_windows label for tracker'
  );
  assert.ok(
    md.includes('Python (3)'),
    'Markdown org Connections must render languages with count: "Python (3)"'
  );
  assert.ok(
    md.includes('awos-recruitment (2)'),
    'Markdown org Connections must render linked_repos with count: "awos-recruitment (2)"'
  );
});

test('renderHtml org mode: empty org_connections categories are omitted (Task 5.4)', () => {
  const audit = makeAudit({
    portfolio_metrics: [
      {
        metric: 'org_capability_score',
        value: 0,
        description: 'test',
        contributor_weighted: false,
        repos_counted: 1,
      },
    ],
    org_connections: {
      sources: [{ name: 'git', count: 1 }],
      languages: [],
      frameworks: [],
      agent_tools: [],
      ci: [],
      linked_repos: [],
    },
  } as unknown as Partial<AuditJson>);
  const html = renderHtml(audit);
  // Only sources should appear; other empty categories omitted
  assert.ok(
    html.includes('git history (1)') || html.includes('git (1)'),
    'HTML org Connections must render the non-empty sources list'
  );
  assert.ok(
    !html.includes('<h3>Languages</h3>') &&
      !html.includes('Languages</h3>') &&
      !html.includes('**Languages:**'),
    'HTML org Connections must omit empty categories'
  );
});

test('renderHtml single-repo mode: org_connections field does not affect single-repo connections rendering (Task 5.4 scope guard)', () => {
  // A single-repo audit with org_connections set (shouldn't happen in practice,
  // but the renderer must not break or silently show org data in single-repo mode).
  const audit = makeAudit({
    sources: [
      {
        source: 'git',
        available: true,
        reason_if_absent: null,
        history_available_days: 90,
      },
    ],
    org_connections: {
      sources: [{ name: 'git', count: 99 }],
      languages: [],
      frameworks: [],
      agent_tools: [],
      ci: [],
      linked_repos: [],
    },
  } as unknown as Partial<AuditJson>);
  const html = renderHtml(audit);
  // Single-repo mode shows Connected/Missed, not the org count view
  assert.ok(
    !html.includes('git (99)') && !html.includes('git history (99)'),
    'Single-repo HTML must not render org_connections count list (99 is a sentinel)'
  );
});

// ── R1: measurement window in the header ──────────────────────────────────
test('renderMarkdown states the measurement window in the header', () => {
  const audit = makeAudit({
    source_windows: { git: { days: 90, label: 'git history' } },
  } as unknown as Partial<AuditJson>);
  const md = renderMarkdown(audit);
  assert.ok(
    md.includes('**Measurement window:** last 90 days'),
    'Markdown header must state the measurement window (last 90 days) so the reader knows the interval'
  );
  // The window must be accompanied by the concrete date range, not just "90 days".
  assert.match(
    md,
    /last 90 days \(2025-10-03\.\.2026-01-01\)/,
    'the measurement window must show the date range (start..end) with the `..` separator, not only the day count'
  );
});

test('renderHtml states the measurement window in the meta band', () => {
  const audit = makeAudit({
    source_windows: { git: { days: 90, label: 'git history' } },
  } as unknown as Partial<AuditJson>);
  const html = renderHtml(audit);
  assert.ok(
    html.includes('Measurement window') && html.includes('last 90 days'),
    'HTML meta band must state the measurement window (last 90 days)'
  );
});

// ── R2: every headline metric carries a tooltip ───────────────────────────
test('renderHtml wraps every headline metric value in a tooltip (main-page parity with dimension rows)', () => {
  const audit = makeAudit({
    headline: {
      delivery: [
        { label: 'Merges', display_value: '19.0 / active contributor' },
        {
          label: 'Deployment frequency',
          display_value: '2 / day',
          band: 'high',
          check_id: 'ADP-08',
        },
        { label: 'Cycle time (Jira In-Progress→Done)', gated: 'tracker' },
      ],
      scale: [{ label: 'LOC', display_value: '12,000' }],
      reach: { ai_tooling: 'Claude, Copilot', contributors: '4 active (90d)' },
    },
  } as unknown as Partial<AuditJson>);
  const html = renderHtml(audit);
  const tipWrapped = (v: string) =>
    html.includes(`<span class="tip" tabindex="0">${v}<span class="tipbox">`);
  assert.ok(
    tipWrapped('19.0 / active contributor'),
    'Merges delivery value must be tooltip-wrapped'
  );
  assert.ok(
    tipWrapped('2 / day'),
    'Deployment frequency delivery value must be tooltip-wrapped'
  );
  assert.ok(
    html.includes('needs ticketing connector') &&
      tipWrapped('— (needs ticketing connector)'),
    'gated-absent delivery note must be tooltip-wrapped'
  );
  assert.ok(tipWrapped('12,000'), 'scale value must be tooltip-wrapped');
  assert.ok(
    tipWrapped('Claude, Copilot'),
    'AI-tooling reach value must be tooltip-wrapped'
  );
  assert.ok(
    tipWrapped('4 active (90d)'),
    'Contributors reach value must be tooltip-wrapped'
  );
});

// ── R4: SKIP reason renders in the evidence column ────────────────────────
test('renderHtml shows the skip reason in the evidence column instead of a bare "—"', () => {
  const skip = makeCheck({
    check_id: 'ADP-15',
    status: 'SKIP',
    applies: false,
    evidence: [
      'No ci data available — connect a ci source (connector or config) to score this check.',
    ],
  });
  const audit = makeAudit({
    dimensions: [makeDim('delivery-automation', [skip])],
  });
  const html = renderHtml(audit);
  assert.ok(
    html.includes('No ci data available'),
    'a SKIP check must render its reason in the evidence column, not a bare "—"'
  );
  const md = renderMarkdown(audit);
  assert.ok(
    md.includes('No ci data available'),
    'a SKIP check must render its reason in the Markdown check table, not a bare "—"'
  );
});
