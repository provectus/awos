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

test('Overview must show found-vs-total metric count above Dimensions table (issue #1)', () => {
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
    /Metrics found:/,
    'Overview must show found-vs-total metric count above Dimensions table (issue #1)'
  );
  assert.match(
    html,
    /2 of 3/,
    'Overview must show correct found-vs-total metric count (2 PASS/WARN out of 3 applicable)'
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

test('Value column must suppress strings already shown in Evidence (issue #10)', () => {
  const checkA = makeCheck({
    check_id: 'T-A',
    status: 'PASS',
    applies: true,
    value: 'README.md',
    evidence: ['README.md present'],
    // no unit, no expression, no value_series
  });
  const checkB = makeCheck({
    check_id: 'T-B',
    status: 'PASS',
    applies: true,
    value: 0.62,
    unit: 'ratio',
    evidence: ['computed from PR merge rate'],
  });
  const dim = makeDim('test-val-dim', [checkA, checkB]);
  const audit = makeAudit({ dimensions: [dim] });
  const html = renderHtml(audit);
  const pageStart = html.indexOf('id="page-test-val-dim"');
  assert.ok(pageStart !== -1, 'Dimension page must exist in HTML');
  const pageEnd = html.indexOf('</section>', pageStart);
  const pageHtml = html.slice(pageStart, pageEnd + 10);
  // checkA: value 'README.md' is a substring of evidence 'README.md present' → should suppress
  assert.ok(
    !pageHtml.includes('>README.md<'),
    'Value column must suppress strings already shown in Evidence (issue #10)'
  );
  // checkB: value has unit 'ratio' → current behaviour (always show)
  assert.ok(
    pageHtml.includes('>0.62<'),
    'Value column must show numeric value when unit is present (issue #10)'
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
