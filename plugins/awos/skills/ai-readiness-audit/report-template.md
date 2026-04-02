# HTML Report Template

Generate a single self-contained HTML file with all styles inlined. No external dependencies, no JavaScript frameworks — just HTML and CSS that opens in any browser.

## Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Audit Report — YYYY-MM-DD</title>
  <style>/* all styles inline */</style>
</head>
<body>
  <header>   <!-- overall score, grade, date, delta -->
  <section>  <!-- summary table -->
  <section>  <!-- per-dimension details (one per dimension) -->
  <section>  <!-- recommendations -->
</body>
</html>
```

## Sections

### Header

- Project name (repo directory name)
- Audit date
- Overall score as a large number with the letter grade
- If a previous audit exists: delta badge (e.g., "+5 vs 2026-02-15")

### Summary Table

A table with columns: #, Dimension, Score (%), Grade, Delta, Critical/High/Medium/Low issue counts. One row per dimension. Highlight rows with grade D or F.

### Filter Controls

A sticky toolbar below the header with a toggle button: **"Show issues only"**. When active:

- Rows with status PASS are hidden (`display: none`)
- Rows with status FAIL and WARN remain visible — these are the items that need attention
- SKIP rows are also hidden
- The button label switches to **"Show all"** to restore the full view
- The filter applies to all per-dimension detail tables at once

Implementation: a small inline `<script>` that toggles a CSS class (e.g., `issues-only`) on `<body>`. Use CSS rules:

```css
body.issues-only tr[data-status='PASS'],
body.issues-only tr[data-status='SKIP'] {
  display: none;
}
```

Each check row must have a `data-status` attribute with its status value.

### Per-Dimension Detail

For each dimension, a collapsible section (`<details>`) containing:

- Dimension title and score/grade
- Results table: #, Check, Severity, Status, Evidence
- Each `<tr>` has a `data-status` attribute (`PASS`, `WARN`, `FAIL`, or `SKIP`) for filtering
- Color-code status cells: green for PASS, yellow for WARN, red for FAIL, gray for SKIP

### Recommendations

A table with columns: #, Priority, Effort, Dimension, Recommendation. Sorted by priority (P0 first), then effort (Low first).

## Styling Guidelines

- Clean, minimal design — white background, comfortable reading width (max 900px centered)
- Use a system font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- Grade colors: A = green, B = blue, C = orange, D = red, F = dark red
- Status colors: PASS = `#22c55e`, WARN = `#eab308`, FAIL = `#ef4444`, SKIP = `#9ca3af`
- Severity badges: small colored pills — critical = red, high = orange, medium = yellow, low = gray
- Zebra-striped table rows for readability
- Responsive — readable on mobile without horizontal scroll
- Print-friendly: use `@media print` to hide collapsible toggles and expand all sections
