# HTML Report Template

**The renderer is the implementation.** `report.md` and `report.html` are produced by running `node dist/cli.js render <audit.json> --format md|html`. The LLM never writes Markdown or HTML directly — the `audit-core` engine pass writes the per-dimension JSON, and the orchestrator authors the plain-language report blocks (`headline`, `insights`, `recommendations`) into `audit.json`. The renderer reads the JSON and emits both formats deterministically.

## One scrolling page (no audience tabs)

The HTML report is a single self-contained page, not a set of "for whom" tabs. The CEO reads the top and stops; engineers scroll down and drill in. Two view levels are toggled by `location.hash`:

- **Overview (`#`)** — the default view:
  1. **Executive band** — capability total (Σ awarded category weights, in pts) + coverage ratio (relative to today's standard, not a grade); then, from `audit.headline`: **Delivery** (DORA-banded delivery metrics with colored band chips), **Code scale & complexity**, **Reach** (AI tooling + contributors). Org runs show ≤3 portfolio-metric cards (`org_ai_tooling_coverage`, `org_capability_score`, `org_measurement_coverage`) plus reach.
  2. **Top insights** — the narrative "READ", rendered as severity-colored cards from `audit.insights` (`theme` → `so_what` → `improves`).
  3. **What to improve** — prioritized, plain-language fixes from `audit.recommendations` (P0/P1/P2 badges, dimension · check · effort, detail paragraph).
  4. **Dimensions** — the engineering summary table (weighted points, coverage ratio, reliability, FAIL/WARN/PASS/SKIP). Each row links to its drill-down sub-page.
  5. **Repositories & Connections** — which repos were measured and which connectors were reachable (org table; single-repo note).
- **Dimension sub-page (`#dim/<key>`)** — reached by clicking a dimension row:
  - Back-to-overview link, dimension header (score, coverage, FAIL/WARN counts).
  - "What to improve here" — recommendations scoped to this dimension.
  - The check table (see below) with a "Show issues only" filter.

**Routing.** Plain hash anchors (`<a href="#dim/x">`) drive navigation, so the browser Back/Forward buttons work natively — Back returns from a dimension sub-page to the overview. A small inline `route()` handler listens for `hashchange`, shows the matching pane, and hides the others. All dimension panes are rendered into the DOM (hidden) so the file stays static and offline-capable.

**Graceful degradation.** `headline`, `insights`, `recommendations`, and per-check `plain` are all optional. When absent, the executive band shows only the capability headline, the insights section is omitted, and "What to improve" falls back to a mechanical FAIL/WARN list derived from the checks.

## Instant, plain-language tooltips

Tooltips do **not** use the native `title=` attribute (it has a ~1.5 s delay and shows the dense specialist string). Each hinted value is a `<span class="tip">` containing a nested `<span class="tipbox">` shown immediately on hover/focus via pure CSS. The tooltip **leads with the plain-language sentence** (`check.plain`, bold) and demotes the five-part specialist hint (`definition · derivation · reliability · source · method`) to small print below it. The technical columns (category code, source, method) are folded into the Check tooltip rather than shown as table columns.

## Drill-down check table

`table-layout: fixed` with an explicit `<colgroup>`. Columns: `#`, `Check` (id + plain one-liner), `Status`, `Wt` (awarded/max), `Reliability`, `Value`, **`Evidence` (~35–45%, the widest column)**. Evidence wraps cleanly (`overflow-wrap:anywhere`) instead of being cramped into an equal-width cell. Each `<tr>` carries a `data-status` attribute (`PASS`/`WARN`/`FAIL`/`SKIP`) for the issues-only filter and status background color.

### Issues-only filter

A toolbar button **"Show issues only"** in each dimension sub-page toggles a `issues-only` class on `<body>`:

```css
body.issues-only tr[data-status='PASS'],
body.issues-only tr[data-status='SKIP'] {
  display: none;
}
```

PASS and SKIP rows hide; FAIL and WARN remain. The label switches to **"Show all"** to restore.

## Self-contained HTML structure

A single file, all CSS and JS inline, no external dependencies — opens in any browser.

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
      <!-- meta: date, project, (org mode indicator) -->

      <div id="overview">
        <!-- executive band · top insights · what to improve · dimensions · repos -->
      </div>

      <!-- one hidden sub-page per dimension; shown by the hash router -->
      <section class="dim-page" id="page-<dimension>">...</section>
    </div>
    <script>
      /* inline hash router + issues filter */
    </script>
  </body>
</html>
```

## Styling guidelines

- Clean, minimal — white background, comfortable reading width (max ~980px centered).
- System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
- Status colors: PASS `#22c55e`, WARN `#eab308`, FAIL `#ef4444`, SKIP `#9ca3af`.
- DORA band chips: Elite `#16a34a`, High `#22c55e`, Medium `#eab308`, Low `#ef4444`.
- Insight cards colored by severity; recommendation badges colored by priority (P0 red, P1 amber, P2 indigo).
- Low-coverage summary rows (coverage < 40%) highlighted in light amber `#fff7ed`.
- Print-friendly: `@media print` expands all sub-pages, drops the back links / filter toolbar / tooltips.
