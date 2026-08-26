'use strict';

// Contract tests for the better plugin's deterministic spec renderer
// (plugins/better/scripts/render-spec.mjs): criteria are extracted verbatim
// from the markdown, counts are computed not authored, the view-model only
// layers on top, and a missing view-model degrades to a generic render
// instead of failing.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');
const script = path.join(
  repoRoot,
  'plugins',
  'better',
  'scripts',
  'render-spec.mjs'
);

const SAMPLE_MD = `# Functional Specification: CSV Export

- **Roadmap Item:** Export reports as CSV
- **Status:** Draft
- **Author:** Test Author

---

## 1. Overview and Rationale (The "Why")

Users need their report data outside the app.

---

## 2. Functional Requirements (The "What")

### 2.1. Export button on every report

- The report screen offers an **Export as CSV** action.
  - **Acceptance Criteria:**
    - [x] Given a report is open, when the user taps Export as CSV, then a file
      containing the visible rows downloads.
    - [ ] When the export fails, then the user sees: "Export failed. Try again."

---

## 3. Scope and Boundaries

### In-Scope

- CSV export of visible report rows

### Out-of-Scope

- Scheduled exports
`;

const SAMPLE_VM = {
  at_a_glance: ['One-tap CSV export from any report.'],
  decisions: [
    {
      decision: 'Export format',
      choice: 'CSV only for now',
      why: 'Simplest format every spreadsheet opens.',
      sources: ['interview'],
    },
  ],
  findings: {
    web: [
      {
        text: 'Competitors offer CSV as the default export.',
        impact: 'Confirmed CSV-first in 2.1.',
        anchor: '#r21',
      },
    ],
    kb: [],
    kb_note: 'No knowledge base configured.',
  },
  requirements: [
    {
      match: '2.1',
      one_liner: 'Every report can be exported with one tap.',
      sources: ['interview', 'web'],
      criteria_names: ['Happy path downloads a file', 'Failure names itself'],
    },
  ],
};

// The shape templates/functional-spec-template.md actually produces:
// requirements as flat bullets with a nested **Acceptance Criteria:** checklist,
// no ### subsections. (SAMPLE_MD above uses per-requirement subsections — both
// shapes are real, and the renderer must not lose either.)
const TEMPLATE_SHAPED_MD = `# Functional Specification: Password Reset

- **Roadmap Item:** Let users reset passwords
- **Status:** Draft

---

## 1. Overview and Rationale (The "Why")

Locked-out users need a self-service way back in.

---

## 2. Functional Requirements (The "What")

- **As a** user, **I want to** reset my password, **so that** I can regain access.
  - **Acceptance Criteria:**
    - [x] When I click "Forgot Password", then I am taken to a page to enter my email.
    - [ ] When I submit my email, then I receive a reset link.

---

## 3. Scope and Boundaries

### In-Scope

- Email-based reset

### Out-of-Scope

- SMS reset
`;

function renderInTemp(
  vm,
  {
    artifact = false,
    md = SAMPLE_MD,
    artifactPath = null,
    expectFailure = false,
  } = {}
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'better-render-'));
  fs.writeFileSync(path.join(dir, 'functional-spec.md'), md);
  const args = [script, dir];
  if (vm !== undefined) {
    const vmPath = path.join(dir, 'vm.json');
    fs.writeFileSync(vmPath, JSON.stringify(vm));
    args.push(vmPath);
  }
  const fragmentPath = artifactPath
    ? path.join(dir, artifactPath)
    : path.join(dir, 'fragment.html');
  if (artifact) args.push('--artifact', fragmentPath);
  const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (expectFailure) {
    fs.rmSync(dir, { recursive: true, force: true });
    return { status: run.status, stderr: run.stderr };
  }
  assert.strictEqual(
    run.status,
    0,
    `renderer must exit 0 for a well-formed spec; stderr: ${run.stderr}`
  );
  const html = fs.readFileSync(path.join(dir, 'functional-spec.html'), 'utf8');
  const fragment = artifact ? fs.readFileSync(fragmentPath, 'utf8') : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { html, fragment };
}

test("renderer keeps requirements written in the template's flat-bullet shape (no ### subsections)", () => {
  const { html } = renderInTemp(SAMPLE_VM, { md: TEMPLATE_SHAPED_MD });
  assert.ok(
    html.includes('<h2>Requirements</h2>'),
    'a requirements section without subsections must still reach the reader — dropping it entirely is the bug this test pins'
  );
  assert.ok(
    html.includes('reset my password'),
    'the flat-bullet requirement statement must appear in the page'
  );
  assert.ok(
    html.includes('I am taken to a page to enter my email') &&
      html.includes('I receive a reset link'),
    'both acceptance criteria of a flat-bullet requirement must appear in the page'
  );
  assert.ok(
    html.includes('1 of 2 criteria verified') &&
      html.includes('Acceptance criteria — 2 (1 verified)'),
    'the status-bar count and the rendered criteria list must describe the same criteria — the page must never count criteria it does not show'
  );
  // The content half above is not enough: a section can render as plain text
  // and still satisfy it while losing every view-model layer.
  assert.ok(
    html.includes('class="req"'),
    'a flat-bullet requirement must become a requirement card — the view-model enrichment below only attaches to cards'
  );
  assert.ok(
    html.includes('Every report can be exported with one tap.'),
    'the one-liner must reach a flat-bullet requirement, matched by its positional number (2.1)'
  );
  assert.ok(
    html.includes('Happy path downloads a file') &&
      html.includes('Failure names itself'),
    "criteria micro-names must label a flat-bullet requirement's criteria"
  );
  assert.ok(
    html.includes('>Interview<') && html.includes('>Web<'),
    'provenance badges must reach a flat-bullet requirement — the badge is what a reviewer reads to weigh the evidence'
  );
  assert.ok(
    html.includes('href="#r21"'),
    'a finding anchored to #r21 must link, which requires the flat-bullet requirement to have been registered as a known anchor'
  );
});

test('renderer extracts criteria verbatim from the markdown and computes verification counts', () => {
  const { html } = renderInTemp(SAMPLE_VM);
  assert.ok(
    html.includes('Export failed. Try again.'),
    'criterion text must be carried into the page verbatim — the renderer composes, it never rewrites contract text'
  );
  assert.ok(
    html.includes('1 of 2 criteria verified'),
    'verification progress must be computed from the markdown checkboxes ([x] vs [ ]), not taken from the view-model'
  );
  assert.ok(
    html.includes('Acceptance criteria — 2 (1 verified)'),
    'per-requirement criteria counts must reflect the checkbox states in the markdown'
  );
});

test('renderer layers the view-model on top: one-liners, decisions, findings with anchors, criteria names', () => {
  const { html } = renderInTemp(SAMPLE_VM);
  assert.ok(
    html.includes('Every report can be exported with one tap.'),
    'the requirement one-liner from the view-model must appear on the requirement card'
  );
  assert.ok(
    html.includes('CSV only for now'),
    'decision rows from the view-model must render in the Decisions table'
  );
  assert.ok(
    html.includes('href="#r21"'),
    'a finding whose anchor matches a rendered requirement must link to it'
  );
  assert.ok(
    html.includes('Happy path downloads a file') &&
      html.includes('Failure names itself'),
    'every criteria micro-name from the view-model must label a criterion'
  );
  assert.ok(
    html.indexOf('Happy path downloads a file') <
      html.indexOf('Failure names itself'),
    'criteria micro-names must appear in view-model order — a reversal or off-by-one would mislabel every criterion'
  );
  assert.ok(
    html.includes('No knowledge base configured.'),
    'an empty knowledge-base lane must show the explanatory note, not silence'
  );
});

test('renderer never interpolates markup from the view-model — hostile payloads are escaped or dropped', () => {
  const hostile = {
    at_a_glance: ['<script>alert(1)</script> bullet'],
    decisions: [
      { decision: '<img src=x>', choice: 'ok', why: '', sources: ['web'] },
    ],
    findings: {
      web: [
        {
          text: 'finding',
          impact: 'impact',
          anchor: '"><script>alert(4)</script>',
        },
      ],
      kb: [],
      kb_note: '',
    },
    diagram: {
      title: '<script>alert(5)</script>',
      // Legacy raw-SVG field: must be ignored entirely, not sanitized.
      svg: '<svg onload="alert(6)"><script>alert(7)</script></svg>',
      items: [
        {
          type: 'box',
          x: 10,
          y: 10,
          w: 120,
          h: 40,
          label: '</text><script>alert(8)</script>',
        },
        { type: 'arrow', x1: 'javascript:alert(9)', y1: 0, x2: 50, y2: 50 },
        { type: 'arrow', x1: 10, y1: 30, x2: 130, y2: 30, label: 'ok arrow' },
      ],
    },
  };
  const { html, fragment } = renderInTemp(hostile, { artifact: true });
  for (const [name, out] of [
    ['page', html],
    ['fragment', fragment],
  ]) {
    assert.ok(
      !out.includes('<script>alert(') && !out.includes('<img'),
      `${name}: view-model text must be escaped before it reaches the HTML — raw tags from any field are an injection`
    );
    assert.ok(
      !out.includes('alert(6)') && !out.includes('alert(7)'),
      `${name}: the legacy raw-svg view-model field must be ignored entirely, never interpolated`
    );
    assert.ok(
      !out.includes('javascript:alert'),
      `${name}: diagram geometry must be numeric-coerced — an item with non-numeric coordinates is dropped`
    );
    assert.ok(
      out.includes('&lt;script&gt;'),
      `${name}: hostile text must appear escaped, proving it was escaped rather than filtered by luck`
    );
  }
  assert.ok(
    html.includes('class="d-box"') && html.includes('viewBox="0 0 860 320"'),
    'the declarative diagram must still render from well-formed items (renderer-drawn SVG, default canvas size)'
  );
  assert.ok(
    html.includes('ok arrow'),
    'well-formed diagram items must survive alongside dropped hostile ones'
  );
});

test('renderer --artifact emits a skeleton-free fragment for hosts that wrap content (e.g. claude.ai artifacts)', () => {
  const { html, fragment } = renderInTemp(SAMPLE_VM, { artifact: true });
  assert.ok(
    !fragment.includes('<!doctype') &&
      !fragment.includes('<html') &&
      !fragment.includes('<body'),
    'the fragment must carry no document skeleton — the publishing host wraps it in its own doctype/head/body'
  );
  assert.ok(
    fragment.includes('<title>') && fragment.includes('<main>'),
    'the fragment must keep the <title> (the host reads it for the page name) and the page content'
  );
  assert.ok(
    fragment.includes('Export failed. Try again.'),
    'the fragment must carry the same verbatim criteria as the standalone page'
  );
  assert.ok(
    html.includes("[data-theme='dark']") &&
      html.includes("[data-theme='light']"),
    'the stylesheet must honor an explicit data-theme stamp (host theme toggles) in both directions, not only prefers-color-scheme'
  );
});

test("renderer matches requirements by exact number — 2.1 must not claim 2.10's card", () => {
  const md = SAMPLE_MD.replace(
    '## 3. Scope and Boundaries',
    `### 2.10. Bulk export of archived reports

- Archived reports can be exported together.
  - **Acceptance Criteria:**
    - [ ] When the user exports an archive, then one file contains every report.

---

## 3. Scope and Boundaries`
  );
  const vm = {
    requirements: [
      {
        match: '2.1',
        one_liner: 'ONE-LINER FOR TWO-POINT-ONE',
        sources: ['interview'],
      },
      {
        match: '2.10',
        one_liner: 'ONE-LINER FOR TWO-POINT-TEN',
        sources: ['kb'],
      },
    ],
  };
  const { html } = renderInTemp(vm, { md });
  const cardTwoTen = html.slice(html.indexOf('id="r210"'));
  assert.ok(
    cardTwoTen.includes('ONE-LINER FOR TWO-POINT-TEN') &&
      !cardTwoTen.startsWith('ONE-LINER FOR TWO-POINT-ONE'),
    "requirement 2.10 must get its own one-liner — prefix matching would hand it 2.1's"
  );
  const badgeOfTwoTen = cardTwoTen.slice(0, cardTwoTen.indexOf('</h3>'));
  assert.ok(
    badgeOfTwoTen.includes('>KB<') && !badgeOfTwoTen.includes('>Interview<'),
    'requirement 2.10 must carry its own provenance badge — a mis-attributed badge misleads the reviewer about the evidence behind the requirement'
  );
});

test('renderer survives a malformed-but-valid view-model instead of crashing the page', () => {
  const shapes = [
    { requirements: {} },
    { at_a_glance: 'not an array' },
    { findings: { code: 'oops' } },
    // Entries inside an otherwise well-formed collection, not just the
    // collection itself — these are dereferenced by the renderers.
    { findings: { code: [null] } },
    { findings: { web: ['plain string'], kb: [null, { text: 'ok' }] } },
    { decisions: [null, 'nope'] },
    { requirements: [null] },
    { requirements: [{ match: '2.1', criteria_names: 'not-an-array' }] },
    { requirements: [{ match: '2.1', sources: 'not-an-array' }] },
  ];
  for (const vm of shapes) {
    const { html } = renderInTemp(vm);
    assert.ok(
      html.includes('Export failed. Try again.'),
      `a view-model with a wrong-typed collection (${JSON.stringify(vm).slice(0, 40)}…) must degrade that block, not fail the page — the markdown content must still render`
    );
  }

  // A string criteria_names does not crash — it index-reads as characters — so
  // the loop above would pass with the Array.isArray guard reverted. Pin the
  // guard by its visible effect instead.
  const { html } = renderInTemp({
    requirements: [{ match: '2.1', criteria_names: 'not-an-array' }],
  });
  assert.ok(
    !/<b>[a-z]<\/b>/.test(html),
    'a string criteria_names must be rejected, not indexed character by character into single-letter criterion labels'
  );
});

test('renderer falls back to a default canvas for non-positive diagram dimensions', () => {
  const items = [
    { type: 'box', x: 10, y: 10, w: 100, h: 40, label: 'Only box' },
  ];
  for (const dims of [
    { width: 0, height: -5 },
    { width: -10, height: 0 },
    { width: null, height: 'wide' },
    {},
  ]) {
    const { html } = renderInTemp({ diagram: { ...dims, items } });
    assert.ok(
      html.includes('viewBox="0 0 860 320"'),
      `diagram dimensions ${JSON.stringify(dims)} must fall back to the default canvas — a zero or negative viewBox is invalid SVG and the diagram silently would not draw`
    );
    assert.ok(
      html.includes('Only box'),
      'the diagram items must still render once the canvas falls back'
    );
  }
  const { html } = renderInTemp({
    diagram: { width: 600, height: 200, items },
  });
  assert.ok(
    html.includes('viewBox="0 0 600 200"'),
    'valid positive dimensions must be honored, not overridden by the fallback'
  );
});

test('renderer refuses an --artifact target that would overwrite a canonical file', () => {
  for (const target of ['functional-spec.md', 'functional-spec.html']) {
    const { status, stderr } = renderInTemp(SAMPLE_VM, {
      artifact: true,
      artifactPath: target,
      expectFailure: true,
    });
    assert.notStrictEqual(
      status,
      0,
      `--artifact ${target} must be rejected — writing the fragment there would destroy the canonical spec or its standalone page`
    );
    assert.ok(
      /must not target/.test(stderr),
      `--artifact ${target} must be refused with an explanatory message naming the collision`
    );
  }
});

test('renderer degrades to a generic render when no view-model is given — it never fails the page', () => {
  const { html } = renderInTemp(undefined);
  assert.ok(
    html.includes('Export failed. Try again.'),
    'without a view-model, criteria must still render from the markdown alone'
  );
  assert.ok(
    html.includes('Overview and Rationale'),
    'without an at-a-glance block, the overview section must render generically instead of being dropped'
  );
  assert.ok(
    !html.includes('Decisions to approve'),
    'view-model-only sections must be omitted, not rendered empty, when no view-model is given'
  );
});
