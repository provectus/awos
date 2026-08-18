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

function renderInTemp(vm, { artifact = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'better-render-'));
  fs.writeFileSync(path.join(dir, 'functional-spec.md'), SAMPLE_MD);
  const args = [script, dir];
  if (vm !== undefined) {
    const vmPath = path.join(dir, 'vm.json');
    fs.writeFileSync(vmPath, JSON.stringify(vm));
    args.push(vmPath);
  }
  const fragmentPath = path.join(dir, 'fragment.html');
  if (artifact) args.push('--artifact', fragmentPath);
  const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
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
    html.includes('Happy path downloads a file'),
    'criteria micro-names from the view-model must label the criteria in order'
  );
  assert.ok(
    html.includes('No knowledge base configured.'),
    'an empty knowledge-base lane must show the explanatory note, not silence'
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
