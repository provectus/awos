# HTML Report Template

**The renderer is the implementation.** `report.md` and `report.html` are produced by running `node dist/cli.js render <audit.json> --format md|html`. The LLM (dimension-auditor) never writes Markdown or HTML directly — it writes the per-dimension JSON artifact. The renderer reads the JSON and emits both formats deterministically.

## Three-Tab Structure

The HTML report has three tabs (rendered by the renderer; tab switching driven by inline JS):

- **Tab 1 — Board / CEO**: for an org run, ≤3 portfolio metrics (`org_ai_tooling_coverage`, `org_capability_score`, `org_measurement_coverage`); for a single-repo run, the capability score + coverage headline. Plus the delivery-band and scale summary from the exec deliverable.
- **Tab 2 — Head of Engineering**: per-dimension table (points, coverage, reliability, band). For org mode also shows per-repo diagnostic table.
- **Tab 3 — Drill-down**: every check, fully attributed, plus a "Repositories & Connections" map showing which repos were measured, how they were linked, and which integrations were missing.

## Per-Number Hover Hints (POL.3)

Every rendered number in the HTML is wrapped: `<span title="definition · derivation · reliability (confidence) · source (year) · method">value</span>`. The five-part hint string comes verbatim from each check's `hint` field in the audit JSON. This is the same string that appears as the Hint column in `report.md`, so the content is identical across both output formats.

The `title=` attribute is what enables the board/CEO view to stay clean (numbers only) while every caveat, method, and reliability note is one hover away.

## Self-Contained HTML Structure

Generate a single self-contained HTML file with all styles inlined. No external dependencies, no JavaScript frameworks — just HTML and CSS that opens in any browser.

### Structure

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI-SDLC Audit — project — YYYY-MM-DD</title>
    <style>
      /* all styles inline */
    </style>
  </head>
  <body>
    <div class="container">
      <h1>AI-SDLC Readiness Audit</h1>
      <!-- meta: date, project, total, coverage -->

      <!-- Tab bar (Board / CEO | Head of Engineering | Drill-down) -->
      <div class="tabs">...</div>

      <!-- Tab 1: Board / CEO (portfolio metrics or capability headline) -->
      <div class="tab-pane active" id="tab-board">...</div>

      <!-- Tab 2: Head of Engineering (per-dimension + per-repo tables) -->
      <div class="tab-pane" id="tab-hoe">...</div>

      <!-- Tab 3: Drill-down (per-check details + Repositories & Connections) -->
      <div class="tab-pane" id="tab-drill">...</div>
    </div>
    <script>
      /* inline tab + filter JS */
    </script>
  </body>
</html>
```

## Sections

### Header

- Project name and audit date
- Audit total as a large number (e.g., **142 pts**), wrapped: `<span title="Audit total: Σ awarded category weights across all dimensions. Uncapped.">142 pts</span>`
- Coverage ratio (e.g., **coverage 67% rel. today's standard**), wrapped: `<span title="Coverage ratio: score ÷ Σ applicable category weights. Not a grade — read relative to today's standards.toml.">67%</span>`
- Org mode indicator when portfolio_metrics are present

### Tab 1 — Board / CEO

**Org mode:** renders ≤3 portfolio metric cards (`org_ai_tooling_coverage`, `org_capability_score`, `org_measurement_coverage`). Each metric value is wrapped: `<span title="description · weighting method · repos counted">value</span>`.

**Single-repo mode:** renders a capability headline with the audit_total score and coverage, each wrapped with a `title=` hint.

Both modes include portfolio reach (AI-dark repo count, contributor summary).

### Tab 2 — Head of Engineering

Per-dimension table: #, Dimension, Points, Coverage, Reliability, FAIL, WARN, PASS, SKIP counts. Highlights low-coverage rows (coverage < 40%). For org mode, also shows a per-repo diagnostic table.

All numeric cells are wrapped with `title=` hover hints (definition · derivation · reliability · source · method).

### Filter Controls (Tab 3 — Drill-down)

A sticky toolbar inside the Drill-down tab with a toggle button: **"Show issues only"**. When active:

- Rows with status PASS are hidden (`display: none`)
- Rows with status FAIL and WARN remain visible — these are the items that need attention
- SKIP rows are also hidden
- The button label switches to **"Show all"** to restore the full view

Implementation: a small inline `<script>` that toggles a CSS class (e.g., `issues-only`) on `<body>`. Use CSS rules:

```css
body.issues-only tr[data-status='PASS'],
body.issues-only tr[data-status='SKIP'] {
  display: none;
}
```

Each check row must have a `data-status` attribute with its status value.

### Tab 3 — Drill-down

For each dimension, a collapsible section (`<details>`, default-closed — no `open` attribute) containing:

- Dimension title and score, each number wrapped with `title=` hint
- Results table: #, Check, Method, Weight Awarded/Max, Status, Reliability, Value, Evidence
- Each `<tr>` has a `data-status` attribute (`PASS`, `WARN`, `FAIL`, or `SKIP`) for filtering
- Color-code status cells: green for PASS, yellow for WARN, red for FAIL, gray for SKIP
- Every scored number wrapped: `<span title="definition · derivation · reliability (confidence) · source (year) · method">value</span>`
- Add a visible `*` marker on rows where reliability tag is `minimal` (lower-bound measurement). Include a footnote below the table: `* lower-bound measurement`.
- Render `value_series` (where present on a check) as a compact inline SVG sparkline.

**Repositories & Connections section** (always present): for org mode shows per-repo table with linked connectors, reachable sources, and AI tooling flag. For single-repo shows the repo + connectors used.

### Styling Guidelines

- Clean, minimal design — white background, comfortable reading width (max 960px centered)
- Use a system font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- Status colors: PASS = `#22c55e`, WARN = `#eab308`, FAIL = `#ef4444`, SKIP = `#9ca3af`
- Low-coverage row highlight: background `#fff7ed` (a light amber) on rows where coverage < 40%
- Zebra-striped table rows for readability
- Responsive — readable on mobile without horizontal scroll
- Print-friendly: use `@media print` to expand all `<details>` sections and hide tab bar + filter toggles
