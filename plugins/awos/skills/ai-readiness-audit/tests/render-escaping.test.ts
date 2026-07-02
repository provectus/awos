/**
 * render-escaping.test.ts — adversarial escaping tests for the renderer.
 *
 * Feeds hostile content (script tags, ampersands, quotes, pipes, newlines)
 * through every reader-facing string field and asserts:
 *
 *   HTML: hostile markup is escaped exactly ONCE — the raw payload never
 *         appears, the escaped form does, and no `&amp;amp;` double-escape
 *         artifact exists anywhere (pins the tip(esc(...)) double-escape fix).
 *   MD:   table rows survive structurally — untrusted `|` is escaped to `\|`
 *         and newlines collapse to spaces, so the cell count of a hostile row
 *         matches its header (pins the mdCell() fix), and an ungated delivery
 *         metric without a display_value renders "—", never "undefined".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderHtml } from '../render.ts';
import type { AuditJson, Check } from '../render.ts';

// ---------------------------------------------------------------------------
// Hostile payloads
// ---------------------------------------------------------------------------

const XSS = '<script>alert(1)</script>';

// ---------------------------------------------------------------------------
// Fixture builders (modeled on tests/render.test.ts)
// ---------------------------------------------------------------------------

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

/** An audit whose untrusted strings all carry hostile content. */
function hostileAudit(): AuditJson {
  return {
    date: '2026-01-01',
    project: `evil-project ${XSS}`,
    audit_total: 10,
    coverage: 0.5,
    headline: {
      delivery: [
        {
          label: `Depl|oy ${XSS}`,
          display_value: `4.2 | wk\nsplit value`,
          band: 'high',
        },
        // Ungated metric with NO display_value — must render "—", not "undefined".
        { label: 'NoValue' },
      ],
    },
    insights: [
      {
        theme: `Theme & ${XSS}`,
        severity: 'high',
        weak_areas: [`Area "quoted" ${XSS}`],
        so_what: `So what & ${XSS}`,
        improves: `Improves "x" ${XSS}`,
      },
    ],
    recommendations: [
      {
        id: 1,
        priority: 'P0',
        title: `Fix | the ${XSS} & "thing"\nsecond half of title`,
        dimension: 'security',
        check_id: 'EVIL-01',
        effort: 'Low',
        detail: `Detail & ${XSS} with "quotes"`,
      },
    ],
    dimensions: [
      {
        dimension: 'security',
        date: '2026-01-01',
        score: 5,
        coverage: 0.5,
        checks: [
          makeCheck({
            check_id: 'EVIL-01',
            status: 'FAIL',
            weight_awarded: 0,
            weight_max: 5,
            value: `val & "q" | pipe ${XSS}`,
            evidence: [`evidence & ${XSS} | pipe\nline2`],
            hint: `hint with | pipe & ${XSS}\nhint line2`,
          }),
          // Check with an expression → its value renders inside a tooltip.
          // Pins the single-escape contract: tip() escapes its args itself.
          makeCheck({
            check_id: 'EVIL-02',
            status: 'PASS',
            value: 'A & B',
            expression: `A & B derived ${XSS}`,
            unit: 'ratio',
          }),
        ],
      },
    ],
    portfolio_metrics: [
      {
        metric: 'org_capability_score',
        value: 10,
        description: 'test portfolio metric',
        contributor_weighted: false,
        repos_counted: 1,
      },
    ],
    per_repo: [
      {
        repo: `evil|repo ${XSS}`,
        contributors: 3,
        awarded_weight: 10,
        sources_reachable: ['git'],
        has_ai_tooling: true,
        audit_total: 10,
        coverage: 0.4,
        merges_per_active: 1.5,
        loc_per_active: null,
        deploy_freq: null,
        rework_rate: null,
        lead_time: null,
        change_fail: null,
        cycle_time: `evil|cycle ${XSS}`,
        mttr: null,
      },
    ],
    linked_repos: [
      { name: `linked & ${XSS}`, kind: 'symlink', via: '.claude/skills/x' },
    ],
  };
}

/** Number of cells in a Markdown table line, splitting only on UNESCAPED pipes. */
function unescapedCells(line: string): number {
  return line.split(/(?<!\\)\|/).length;
}

/** Find the single line of `md` containing `marker`, asserting it exists. */
function lineWith(md: string, marker: string, what: string): string {
  const line = md.split('\n').find((l) => l.includes(marker));
  assert.ok(line !== undefined, `${what}: no line contains "${marker}"`);
  return line!;
}

// ---------------------------------------------------------------------------
// HTML — escape exactly once
// ---------------------------------------------------------------------------

test('renderHtml: hostile payloads are escaped — the raw <script> payload never appears', () => {
  const html = renderHtml(hostileAudit());
  assert.ok(
    !html.includes(XSS),
    'the raw <script>alert(1)</script> payload must never reach the HTML output'
  );
  assert.ok(
    html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
    'the escaped form of the script payload must appear (content preserved, defused)'
  );
});

test('renderHtml: no double-escaping — &amp;amp; never appears (tip() escapes its args itself)', () => {
  const html = renderHtml(hostileAudit());
  assert.ok(
    !html.includes('&amp;amp;'),
    'no string may be HTML-escaped twice (pins the tip(esc(value)) double-escape fix)'
  );
  assert.ok(
    html.includes('A &amp; B'),
    'the expression-check value must appear escaped exactly once inside its tooltip'
  );
});

// ---------------------------------------------------------------------------
// Markdown — table structure survives hostile pipes and newlines
// ---------------------------------------------------------------------------

test('renderMarkdown: delivery table rows keep the header cell count despite | and newlines', () => {
  const md = renderMarkdown(hostileAudit());
  const header = lineWith(md, '| Metric | Value | Band |', 'delivery table');
  const row = lineWith(md, 'Depl\\|oy', 'hostile delivery row');
  assert.equal(
    unescapedCells(row),
    unescapedCells(header),
    'hostile label/value pipes must be escaped so the delivery row keeps 3 cells'
  );
  assert.ok(
    row.includes('split value'),
    'newlines in a delivery display_value must collapse to spaces (row stays one line)'
  );
});

test('renderMarkdown: ungated delivery metric without display_value renders "—", never "undefined"', () => {
  const md = renderMarkdown(hostileAudit());
  const row = lineWith(md, 'NoValue', 'valueless delivery row');
  assert.ok(
    row.includes('| — |'),
    `an ungated metric with no display_value must render an em-dash cell, got: ${row}`
  );
  assert.ok(
    !md.includes('undefined'),
    'the Markdown report must never contain a literal "undefined"'
  );
});

test('renderMarkdown: recommendations table row keeps the header cell count despite a hostile title', () => {
  const md = renderMarkdown(hostileAudit());
  const header = lineWith(
    md,
    '| # | Priority | Dimension | Check | Effort | What to do |',
    'recommendations table'
  );
  const row = lineWith(
    md,
    'second half of title',
    'hostile recommendation row'
  );
  assert.equal(
    unescapedCells(row),
    unescapedCells(header),
    'a recommendation title with | and newline must not add or split table cells'
  );
  assert.ok(
    row.includes('Fix \\|'),
    'the pipe inside the recommendation title must be escaped as \\|'
  );
});

test('renderMarkdown: check-table row keeps the header cell count despite hostile evidence/value/hint', () => {
  const md = renderMarkdown(hostileAudit());
  const header = lineWith(md, '| # | Check ID | Method |', 'check table');
  // 'hint with' is unique to the check row — 'EVIL-01' alone would first
  // match the recommendations-table row that references the same check_id.
  const row = lineWith(md, 'hint with', 'hostile check row');
  assert.equal(
    unescapedCells(row),
    unescapedCells(header),
    'hostile pipes in a check value and hint must be escaped so the row keeps 10 cells'
  );
  assert.ok(
    row.includes('hint line2'),
    'newlines in a check hint must collapse to spaces (row stays one line)'
  );
});

test('renderMarkdown: per-repo org table row keeps the header cell count despite a hostile repo name', () => {
  const md = renderMarkdown(hostileAudit());
  const header = lineWith(md, '| Repo | Coverage |', 'per-repo table');
  const row = lineWith(md, 'evil\\|repo', 'hostile per-repo row');
  assert.equal(
    unescapedCells(row),
    unescapedCells(header),
    'a repo name containing | must be escaped in both the link label and target'
  );
});
