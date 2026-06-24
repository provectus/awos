/**
 * render.ts — deterministic JSON → Markdown/HTML renderer for the ai-readiness-audit engine.
 *
 * Consumed by cli.ts via `node dist/cli.js render <audit.json> --format md|html`.
 *
 * The renderer is PURE and deterministic: no clocks (date is read from the JSON),
 * no LLM calls. The audit JSON is the single source of truth; Markdown/HTML are
 * rendered output.
 *
 * =============================================================================
 * AUDIT JSON SCHEMA (consumed by this renderer)
 * =============================================================================
 *
 * Top-level (single-repo):
 * {
 *   "date":        "YYYY-MM-DD",            // audit date
 *   "project":     "string",                // repo name / identifier
 *   "audit_total": number,                  // Σ awarded weights across all dimensions
 *   "coverage":    number,                  // 0–1 ratio
 *   "dimensions":  DimensionArtifact[],     // per-dimension results (see below)
 *   // optional org fields:
 *   "portfolio_metrics": PortfolioMetric[], // ≤3 org-level metrics (org mode only)
 *   "per_repo":    PerRepoSummary[],        // one row per repo (org mode only)
 * }
 *
 * DimensionArtifact (per output-format.md schema):
 * {
 *   "dimension": string,
 *   "date":      "YYYY-MM-DD",
 *   "score":     number,
 *   "coverage":  number,          // 0–1
 *   "checks":    Check[],
 * }
 *
 * Check:
 * {
 *   "check_id":       "CODE-NN",
 *   "code":           number[],
 *   "method":         "detected|computed|judgment",
 *   "status":         "PASS|WARN|FAIL|SKIP",
 *   "value":          string | number | null,
 *   "evidence":       string[],
 *   "weight_awarded": number,
 *   "weight_max":     number,
 *   "applies":        boolean,
 *   "reliability": {
 *     "tag":        string,
 *     "confidence": string,
 *     "note":       string | null,
 *   },
 *   "source":     string,
 *   "definition": string,
 *   "hint":       string,   // "definition · derivation · reliability (conf) · source (year) · method"
 * }
 *
 * PortfolioMetric (org mode):
 * {
 *   "metric":               string,
 *   "value":                number,
 *   "description":          string,
 *   "contributor_weighted": boolean,
 *   "repos_counted":        number,
 * }
 *
 * PerRepoSummary (org mode):
 * {
 *   "repo":              string,
 *   "contributors":      number | null,
 *   "awarded_weight":    number,
 *   "sources_reachable": string[],
 *   "has_ai_tooling":    boolean,
 * }
 * =============================================================================
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckReliability {
  tag: string;
  confidence: string;
  note: string | null;
}

export interface Check {
  check_id: string;
  code: number[];
  method: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
  value: string | number | null;
  evidence: string[];
  weight_awarded: number;
  weight_max: number;
  applies: boolean;
  reliability: CheckReliability;
  source: string;
  definition: string;
  hint: string;
  value_series?: Array<{ bucket_start: string; value: number | null }>;
}

export interface DimensionArtifact {
  dimension: string;
  date: string;
  score: number;
  coverage: number;
  checks: Check[];
  [key: string]: unknown;
}

export interface PortfolioMetric {
  metric: string;
  value: number;
  description: string;
  contributor_weighted: boolean;
  repos_counted: number;
}

export interface PerRepoSummary {
  repo: string;
  contributors: number | null;
  awarded_weight: number;
  sources_reachable: string[];
  has_ai_tooling: boolean;
}

export interface AuditJson {
  date: string;
  project: string;
  audit_total: number;
  coverage: number;
  dimensions: DimensionArtifact[];
  // org-mode fields (optional)
  portfolio_metrics?: PortfolioMetric[];
  per_repo?: PerRepoSummary[];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function pct(ratio: number): string {
  return (ratio * 100).toFixed(1) + '%';
}

function titleLabel(dim: DimensionArtifact): string {
  return dim.dimension
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function metricLabel(metric: string): string {
  const labels: Record<string, string> = {
    org_ai_tooling_coverage: 'AI-tooling coverage',
    org_capability_score: 'Capability score',
    org_measurement_coverage: 'Measurement coverage',
  };
  return labels[metric] ?? metric;
}

/**
 * Derive status counts for a dimension (Critical/High/Medium/Low severity FAILs/WARNs).
 * Since severity is not present in DimensionArtifact, we count FAIL and WARN only.
 */
function statusCounts(dim: DimensionArtifact): {
  fail: number;
  warn: number;
  pass: number;
  skip: number;
} {
  let fail = 0,
    warn = 0,
    pass = 0,
    skip = 0;
  for (const c of dim.checks) {
    if (c.status === 'FAIL') fail++;
    else if (c.status === 'WARN') warn++;
    else if (c.status === 'PASS') pass++;
    else skip++;
  }
  return { fail, warn, pass, skip };
}

/**
 * Build a compact inline sparkline string for a value_series.
 * Uses Unicode block characters: ▁▂▃▄▅▆▇█ to represent normalized heights.
 */
function sparkline(
  series: Array<{ bucket_start: string; value: number | null }>
): string {
  const bars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const values = series
    .map((e) => e.value)
    .filter((v): v is number => v !== null);
  if (values.length === 0) return '(no data)';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  return series
    .map((e) => {
      if (e.value === null) return '·';
      if (range === 0) return bars[3];
      const idx = Math.round(((e.value - min) / range) * (bars.length - 1));
      return bars[Math.max(0, Math.min(bars.length - 1, idx))];
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Markdown renderer (POL.1)
// ---------------------------------------------------------------------------

/**
 * Render the audit JSON to a Markdown report.
 *
 * Every scored number is present. The check table includes a Hint column
 * containing the five-part hint string (definition · derivation · reliability
 * (confidence) · source (year) · method) — the same string the HTML renderer
 * uses for title= hover attributes.
 */
export function renderMarkdown(audit: AuditJson): string {
  const lines: string[] = [];
  const isOrg =
    Array.isArray(audit.portfolio_metrics) &&
    audit.portfolio_metrics.length > 0;

  // Header
  lines.push('# AI-SDLC Readiness Audit Report');
  lines.push('');
  lines.push(`**Date:** ${audit.date}`);
  lines.push(`**Project:** ${audit.project}`);
  if (isOrg) {
    lines.push(`**Mode:** Organization (${audit.per_repo?.length ?? 0} repos)`);
  }
  lines.push(`**Audit Total:** ${audit.audit_total} pts`);
  lines.push(
    `**Coverage Ratio:** ${pct(audit.coverage)} rel. today's standard`
  );
  lines.push('');

  // Portfolio metrics (org mode)
  if (isOrg && audit.portfolio_metrics) {
    lines.push('## Portfolio Metrics (Org)');
    lines.push('');
    lines.push('| Metric | Value | Description | Repos Counted | Weighted |');
    lines.push('| ------ | ----- | ----------- | ------------- | -------- |');
    for (const m of audit.portfolio_metrics) {
      const val =
        m.metric === 'org_capability_score'
          ? m.value.toFixed(2) + ' pts'
          : pct(m.value);
      lines.push(
        `| ${metricLabel(m.metric)} | ${val} | ${m.description} | ${m.repos_counted} | ${m.contributor_weighted ? 'contributor-weighted' : 'equal-weighted'} |`
      );
    }
    lines.push('');
  }

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push(
    '| # | Dimension | Points | Coverage | FAIL | WARN | PASS | SKIP |'
  );
  lines.push(
    '| - | --------- | ------ | -------- | ---- | ---- | ---- | ---- |'
  );
  let rowNum = 1;
  for (const dim of audit.dimensions) {
    const counts = statusCounts(dim);
    lines.push(
      `| ${rowNum++} | ${titleLabel(dim)} | ${dim.score} | ${pct(dim.coverage)} | ${counts.fail} | ${counts.warn} | ${counts.pass} | ${counts.skip} |`
    );
  }
  lines.push('');

  // Per-dimension details
  for (const dim of audit.dimensions) {
    lines.push(`## Dimension: ${titleLabel(dim)}`);
    lines.push('');
    lines.push(
      `**Score:** ${dim.score} pts (coverage ${pct(dim.coverage)} rel. today's standard)`
    );
    lines.push('');

    // Check table with Hint column
    lines.push(
      '| # | Check ID | Method | Weight Awarded | Weight Max | Status | Reliability | Value | Hint |'
    );
    lines.push(
      '| - | -------- | ------ | -------------- | ---------- | ------ | ----------- | ----- | ---- |'
    );
    let checkNum = 1;
    let hasMinimal = false;
    for (const c of dim.checks) {
      const reliabilityStr = c.applies
        ? `${c.reliability.tag} (${c.reliability.confidence})${c.reliability.tag === 'minimal' ? ' *' : ''}`
        : '—';
      if (c.reliability.tag === 'minimal' && c.applies) hasMinimal = true;
      const valueStr =
        c.value !== null && c.value !== undefined ? String(c.value) : '—';
      // Render sparkline inline if value_series present
      const seriesStr =
        c.value_series && c.value_series.length > 0
          ? ` \\[${sparkline(c.value_series)}\\]`
          : '';
      const hint = c.hint ?? '—';
      lines.push(
        `| ${checkNum++} | ${c.check_id} | ${c.method} | ${c.weight_awarded} | ${c.weight_max} | ${c.status} | ${reliabilityStr} | ${valueStr}${seriesStr} | ${hint} |`
      );
    }
    lines.push('');
    if (hasMinimal) {
      lines.push('`*` lower-bound measurement (reliability tag: `minimal`).');
      lines.push('');
    }
  }

  // Per-repo table (org mode)
  if (isOrg && audit.per_repo && audit.per_repo.length > 0) {
    lines.push('## Repositories & Connections');
    lines.push('');
    lines.push(
      '| Repo | Contributors | Awarded Weight | Sources Reachable | AI Tooling |'
    );
    lines.push(
      '| ---- | ------------ | -------------- | ----------------- | ---------- |'
    );
    for (const r of audit.per_repo) {
      const contributors =
        r.contributors !== null ? String(r.contributors) : '—';
      const sources =
        r.sources_reachable.length > 0
          ? r.sources_reachable.join(', ')
          : '(none)';
      lines.push(
        `| ${r.repo} | ${contributors} | ${r.awarded_weight} | ${sources} | ${r.has_ai_tooling ? 'yes' : 'no'} |`
      );
    }
    lines.push('');
  }

  // Recommendations section
  lines.push('## Recommendations');
  lines.push('');
  const failChecks: Array<{ dim: DimensionArtifact; check: Check }> = [];
  const warnChecks: Array<{ dim: DimensionArtifact; check: Check }> = [];
  for (const dim of audit.dimensions) {
    for (const c of dim.checks) {
      if (c.status === 'FAIL') failChecks.push({ dim, check: c });
      else if (c.status === 'WARN') warnChecks.push({ dim, check: c });
    }
  }

  if (failChecks.length === 0 && warnChecks.length === 0) {
    lines.push('No failing or warning checks. Audit is fully green.');
  } else {
    lines.push('| # | Priority | Dimension | Check | Status | Hint |');
    lines.push('| - | -------- | --------- | ----- | ------ | ---- |');
    let rec = 1;
    for (const { dim, check: c } of failChecks.slice(0, 10)) {
      lines.push(
        `| ${rec++} | P0 | ${titleLabel(dim)} | ${c.check_id} | FAIL | ${c.hint} |`
      );
    }
    for (const { dim, check: c } of warnChecks.slice(
      0,
      Math.max(0, 10 - failChecks.length)
    )) {
      lines.push(
        `| ${rec++} | P1 | ${titleLabel(dim)} | ${c.check_id} | WARN | ${c.hint} |`
      );
    }
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTML renderer (POL.2 + POL.3)
// ---------------------------------------------------------------------------

/** HTML-escape a string for safe output in attributes and text nodes. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Wrap a value in a <span title="<hint>"> so hovering shows the full
 * five-part hint (definition · derivation · reliability · source · method).
 * POL.3 contract: every rendered number must use this wrapper.
 */
function hintSpan(value: string, hint: string, extraClass = ''): string {
  const cls = extraClass ? ` class="${esc(extraClass)}"` : '';
  return `<span${cls} title="${esc(hint)}">${esc(value)}</span>`;
}

/** Render a compact sparkline as inline SVG bars (min-height 4px, max 20px). */
function sparklineSvg(
  series: Array<{ bucket_start: string; value: number | null }>
): string {
  const w = 4;
  const gap = 1;
  const maxH = 20;
  const values = series
    .map((e) => e.value)
    .filter((v): v is number => v !== null);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const range = max - min;
  const svgW = series.length * (w + gap) - gap;
  const rects = series
    .map((e, i) => {
      const h =
        e.value === null
          ? 2
          : range === 0
            ? maxH / 2
            : Math.max(
                4,
                Math.round(((e.value - min) / range) * (maxH - 4)) + 4
              );
      const x = i * (w + gap);
      const y = maxH - h;
      const fill = e.value === null ? '#d1d5db' : '#6366f1';
      const label = `${e.bucket_start}: ${e.value !== null ? String(e.value) : 'n/a'}`;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"><title>${esc(label)}</title></rect>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${maxH}" style="vertical-align:middle;margin-left:4px" aria-label="sparkline">${rects}</svg>`;
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    PASS: '#22c55e',
    WARN: '#eab308',
    FAIL: '#ef4444',
    SKIP: '#9ca3af',
  };
  const bg = colors[status] ?? '#9ca3af';
  return `<span class="badge" style="background:${bg};color:#fff;padding:1px 6px;border-radius:3px;font-size:.75em;font-weight:600">${esc(status)}</span>`;
}

const STATUS_COLOR: Record<string, string> = {
  PASS: '#f0fdf4',
  WARN: '#fefce8',
  FAIL: '#fef2f2',
  SKIP: '#f9fafb',
};

/**
 * Render the audit JSON to a self-contained HTML file with three tabs:
 *   Tab 1 — Board / CEO
 *   Tab 2 — Head of Engineering
 *   Tab 3 — Drill-down
 *
 * Features:
 *   - Every rendered number wrapped in <span title="hint"> (POL.3)
 *   - Collapsible <details> sections, default-closed
 *   - "Issues only" filter toggle (hides PASS/SKIP rows via body class + data-status)
 *   - @media print (expand all, hide toggles)
 *   - value_series rendered as inline SVG sparkline
 */
export function renderHtml(audit: AuditJson): string {
  const isOrg =
    Array.isArray(audit.portfolio_metrics) &&
    audit.portfolio_metrics.length > 0;

  // ─── CSS ──────────────────────────────────────────────────────────────────
  const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#1e293b;font-size:14px;line-height:1.5}
.container{max-width:960px;margin:0 auto;padding:24px}
h1{font-size:1.5rem;font-weight:700;margin-bottom:4px}
h2{font-size:1.15rem;font-weight:600;margin:20px 0 8px}
h3{font-size:1rem;font-weight:600;margin:12px 0 4px}
.meta{color:#64748b;font-size:.85rem;margin-bottom:16px}
.meta span{margin-right:16px}
/* tabs */
.tabs{display:flex;gap:2px;margin-bottom:0;border-bottom:2px solid #e2e8f0}
.tab-btn{padding:8px 18px;border:none;background:none;cursor:pointer;font-size:.875rem;font-weight:500;color:#64748b;border-bottom:2px solid transparent;margin-bottom:-2px}
.tab-btn.active{color:#4f46e5;border-bottom-color:#4f46e5;font-weight:600}
.tab-pane{display:none;padding:20px 0}
.tab-pane.active{display:block}
/* filter toolbar */
.toolbar{position:sticky;top:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:8px 0;margin-bottom:12px;z-index:10;display:flex;gap:8px;align-items:center}
.toolbar button{padding:5px 12px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;font-size:.8rem}
.toolbar button.active{background:#4f46e5;color:#fff;border-color:#4f46e5}
/* tables */
table{width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:16px}
th{background:#f1f5f9;text-align:left;padding:6px 8px;border-bottom:2px solid #e2e8f0;font-weight:600}
td{padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top}
tr:nth-child(even) td{background:#f8fafc}
tr[data-status='PASS'] td{background:#f0fdf4}
tr[data-status='WARN'] td{background:#fefce8}
tr[data-status='FAIL'] td{background:#fef2f2}
tr[data-status='SKIP'] td{background:#f9fafb}
/* issues-only filter */
body.issues-only tr[data-status='PASS'],body.issues-only tr[data-status='SKIP']{display:none}
/* details/summary */
details{border:1px solid #e2e8f0;border-radius:6px;margin-bottom:8px;overflow:hidden}
summary{padding:10px 12px;cursor:pointer;font-weight:600;background:#f8fafc;user-select:none;list-style:none;display:flex;justify-content:space-between;align-items:center}
summary::after{content:"▸";font-size:.9em;color:#94a3b8}
details[open] summary::after{content:"▾"}
.details-body{padding:12px}
/* metric cards */
.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px}
.metric-card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px}
.metric-card .metric-val{font-size:1.6rem;font-weight:700;color:#4f46e5;margin:4px 0}
.metric-card .metric-desc{font-size:.78rem;color:#64748b}
/* capability headline (single-repo) */
.capability-headline{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:16px}
.capability-headline .score{font-size:2.2rem;font-weight:800;color:#4f46e5}
.capability-headline .coverage{font-size:1rem;color:#64748b;margin-top:2px}
/* reliability */
.rel-minimal{color:#d97706}
.rel-not-reliable{color:#dc2626}
/* hint span */
span[title]{cursor:help;text-decoration:underline dotted #94a3b8;text-underline-offset:2px}
/* badge */
.badge{display:inline-block}
/* low-coverage rows in summary */
tr.low-cov td{background:#fff7ed}
/* print */
@media print{
  .tabs{display:none}
  .toolbar{display:none}
  .tab-pane{display:block!important}
  details{border:none}
  details[open] summary::after,summary::after{display:none}
  details>*{display:block!important}
  summary{background:none;padding:4px 0}
}
`;

  // ─── Tab 1 — Board / CEO ───────────────────────────────────────────────────
  function tab1(): string {
    const rows: string[] = [];

    if (isOrg && audit.portfolio_metrics) {
      rows.push('<h2>Portfolio Metrics</h2>');
      rows.push('<div class="metric-grid">');
      for (const m of audit.portfolio_metrics) {
        const val =
          m.metric === 'org_capability_score'
            ? m.value.toFixed(2) + ' pts'
            : pct(m.value);
        const hintText = `${m.description} · ${m.contributor_weighted ? 'contributor-weighted' : 'equal-weighted'} · ${m.repos_counted} repos`;
        rows.push(`<div class="metric-card">
  <div class="metric-name">${esc(metricLabel(m.metric))}</div>
  <div class="metric-val">${hintSpan(val, hintText)}</div>
  <div class="metric-desc">${esc(m.description)}<br>${m.repos_counted} repos · ${m.contributor_weighted ? 'contributor-weighted' : 'equal-weighted'}</div>
</div>`);
      }
      rows.push('</div>');

      // Per-repo reach summary
      if (audit.per_repo && audit.per_repo.length > 0) {
        const withTooling = audit.per_repo.filter(
          (r) => r.has_ai_tooling
        ).length;
        const withSources = audit.per_repo.filter(
          (r) => r.sources_reachable.length > 0
        ).length;
        rows.push('<h2>Portfolio Reach</h2>');
        rows.push(
          `<p>${withTooling} / ${audit.per_repo.length} repos have AI tooling. ${withSources} / ${audit.per_repo.length} repos had at least one reachable data source.</p>`
        );
      }
    } else {
      // Single-repo capability headline
      const scoreHint = `Audit total: Σ awarded category weights across all dimensions. Coverage: ${pct(audit.coverage)} relative to today's standards.toml.`;
      rows.push('<div class="capability-headline">');
      rows.push('<div>AI-SDLC Capability</div>');
      rows.push(
        `<div class="score">${hintSpan(String(audit.audit_total) + ' pts', scoreHint)}</div>`
      );
      rows.push(
        `<div class="coverage">Coverage: ${hintSpan(pct(audit.coverage), 'Fraction of applicable category weights awarded · score ÷ Σ applicable weights · — · standards.toml · computed')}</div>`
      );
      rows.push('</div>');
    }

    // Delivery summary (aggregate across dimensions for headline numbers)
    rows.push(
      `<div class="meta"><span><strong>Date:</strong> ${esc(audit.date)}</span><span><strong>Project:</strong> ${esc(audit.project)}</span></div>`
    );

    return rows.join('\n');
  }

  // ─── Tab 2 — Head of Engineering ──────────────────────────────────────────
  function tab2(): string {
    const rows: string[] = [];
    rows.push('<h2>Dimension Summary</h2>');

    if (isOrg && audit.per_repo && audit.per_repo.length > 0) {
      // Org: per-repo diagnostic table
      rows.push(
        '<table><thead><tr><th>Repo</th><th>Awarded Weight</th><th>Sources Reachable</th><th>AI Tooling</th><th>Contributors</th></tr></thead><tbody>'
      );
      for (const r of audit.per_repo) {
        const sourceList =
          r.sources_reachable.length > 0
            ? r.sources_reachable.join(', ')
            : '<em>none</em>';
        const hintText = `Repo: ${r.repo} · awarded_weight: ${r.awarded_weight} · sources: ${r.sources_reachable.join(',') || 'none'} · has_ai_tooling: ${r.has_ai_tooling}`;
        rows.push(`<tr>
  <td>${esc(r.repo)}</td>
  <td>${hintSpan(String(r.awarded_weight), hintText)}</td>
  <td>${sourceList}</td>
  <td>${r.has_ai_tooling ? '✓' : '✗'}</td>
  <td>${r.contributors !== null ? hintSpan(String(r.contributors), 'Aggregate active-contributor count (no PII)') : '—'}</td>
</tr>`);
      }
      rows.push('</tbody></table>');
    }

    // Per-dimension table (always shown)
    rows.push(
      '<table><thead><tr><th>#</th><th>Dimension</th><th>Points</th><th>Coverage</th><th>Reliability</th><th>FAIL</th><th>WARN</th><th>PASS</th><th>SKIP</th></tr></thead><tbody>'
    );
    let n = 1;
    for (const dim of audit.dimensions) {
      const counts = statusCounts(dim);
      const covPct = pct(dim.coverage);
      const lowCov = dim.coverage < 0.4 ? ' class="low-cov"' : '';
      // Compute aggregate reliability from checks
      const anyMinimal = dim.checks.some(
        (c) => c.applies && c.reliability.tag === 'minimal'
      );
      const relStr = anyMinimal ? 'minimal *' : 'maximal';
      const relHint = `Dimension reliability: ${relStr}. ${anyMinimal ? 'At least one check is a lower-bound measurement.' : ''}`;
      rows.push(`<tr${lowCov}>
  <td>${n++}</td>
  <td><strong>${esc(titleLabel(dim))}</strong></td>
  <td>${hintSpan(String(dim.score) + ' pts', `Score: Σ awarded weights = ${dim.score} · coverage: ${covPct} · dimension: ${dim.dimension} · standards.toml · computed`)}</td>
  <td>${hintSpan(covPct, `Coverage ratio = score / Σ applicable weights = ${covPct} · dimension: ${dim.dimension} · standards.toml · computed`)}</td>
  <td>${hintSpan(relStr, relHint)}</td>
  <td>${counts.fail > 0 ? `<span style="color:#ef4444;font-weight:600">${counts.fail}</span>` : counts.fail}</td>
  <td>${counts.warn > 0 ? `<span style="color:#eab308;font-weight:600">${counts.warn}</span>` : counts.warn}</td>
  <td>${counts.pass}</td>
  <td>${counts.skip}</td>
</tr>`);
    }
    rows.push('</tbody></table>');
    if (
      audit.dimensions.some((d) =>
        d.checks.some((c) => c.applies && c.reliability.tag === 'minimal')
      )
    ) {
      rows.push(
        '<p style="font-size:.8rem;color:#64748b"><em>* lower-bound measurement</em></p>'
      );
    }

    return rows.join('\n');
  }

  // ─── Tab 3 — Drill-down ────────────────────────────────────────────────────
  function tab3(): string {
    const rows: string[] = [];
    rows.push(
      '<div class="toolbar"><button id="issues-btn" onclick="toggleIssues(this)">Show issues only</button></div>'
    );

    for (const dim of audit.dimensions) {
      rows.push(`<details>`);
      const counts = statusCounts(dim);
      rows.push(
        `<summary>${esc(titleLabel(dim))} — ${hintSpan(String(dim.score) + ' pts', `Σ awarded weights. Coverage: ${pct(dim.coverage)} rel. today's standard. Dimension: ${dim.dimension}`)} · coverage ${hintSpan(pct(dim.coverage), `Coverage ratio = ${pct(dim.coverage)}; excludes N/A checks. Source: standards.toml · computed`)} · FAIL:${counts.fail} WARN:${counts.warn}</summary>`
      );
      rows.push('<div class="details-body">');
      rows.push(
        '<table><thead><tr><th>#</th><th>Check</th><th>Code</th><th>Source</th><th>Method</th><th>Wt</th><th>Status</th><th>Reliability</th><th>Value</th><th>Evidence</th></tr></thead><tbody>'
      );
      let ckn = 1;
      let hasMinimal = false;
      for (const c of dim.checks) {
        const rowBg = STATUS_COLOR[c.status] ?? '#fff';
        const relClass =
          c.reliability.tag === 'minimal'
            ? 'rel-minimal'
            : c.reliability.tag === 'not-reliable'
              ? 'rel-not-reliable'
              : '';
        if (c.reliability.tag === 'minimal' && c.applies) hasMinimal = true;
        const relLabel = c.applies
          ? `${c.reliability.tag} (${c.reliability.confidence})${c.reliability.tag === 'minimal' ? ' *' : ''}`
          : '—';
        const relHint = c.reliability.note ?? c.hint;
        const valueStr =
          c.value !== null && c.value !== undefined ? String(c.value) : '—';
        const seriesSvg =
          c.value_series && c.value_series.length > 0
            ? sparklineSvg(c.value_series)
            : '';
        const evidence = c.evidence.length > 0 ? c.evidence.join('<br>') : '—';
        const codeStr = c.code && c.code.length > 0 ? c.code.join(', ') : '—';
        const sourceStr = c.source ? esc(c.source) : '—';
        rows.push(`<tr data-status="${esc(c.status)}" style="background:${rowBg}">
  <td>${ckn++}</td>
  <td title="${esc(c.hint)}"><strong>${esc(c.check_id)}</strong><br><span style="font-size:.75rem;color:#64748b">${esc(c.definition)}</span></td>
  <td style="font-size:.75rem;color:#64748b">${esc(codeStr)}</td>
  <td style="font-size:.75rem;color:#64748b">${sourceStr}</td>
  <td>${esc(c.method)}</td>
  <td>${hintSpan(String(c.weight_awarded) + '/' + String(c.weight_max), c.hint)}</td>
  <td>${statusBadge(c.status)}</td>
  <td class="${relClass}">${hintSpan(relLabel, relHint)}</td>
  <td>${hintSpan(valueStr, c.hint)}${seriesSvg}</td>
  <td style="font-size:.75rem;max-width:200px;word-break:break-word">${evidence}</td>
</tr>`);
      }
      rows.push('</tbody></table>');
      if (hasMinimal) {
        rows.push(
          '<p style="font-size:.78rem;color:#64748b">* lower-bound measurement (reliability tag: minimal).</p>'
        );
      }
      rows.push('</div></details>');
    }

    // Repositories & Connections (org mode and single-repo)
    rows.push('<h2>Repositories &amp; Connections</h2>');
    if (isOrg && audit.per_repo && audit.per_repo.length > 0) {
      rows.push(
        '<table><thead><tr><th>Repo</th><th>Contributors</th><th>Sources</th><th>AI Tooling</th><th>Awarded Weight</th></tr></thead><tbody>'
      );
      for (const r of audit.per_repo) {
        const hintText = `Repo: ${r.repo} · contributors: ${r.contributors ?? 'unknown'} · sources: ${r.sources_reachable.join(',') || 'none'} · has_ai_tooling: ${r.has_ai_tooling} · awarded_weight: ${r.awarded_weight}`;
        const sources =
          r.sources_reachable.length > 0
            ? r.sources_reachable.map(esc).join(', ')
            : '<em>none detected</em>';
        rows.push(`<tr>
  <td>${esc(r.repo)}</td>
  <td>${r.contributors !== null ? hintSpan(String(r.contributors), 'Aggregate active-contributor count — no per-person data') : '—'}</td>
  <td>${sources}</td>
  <td>${r.has_ai_tooling ? '✓ yes' : '✗ no'}</td>
  <td>${hintSpan(String(r.awarded_weight), hintText)}</td>
</tr>`);
      }
      rows.push('</tbody></table>');
    } else {
      rows.push(
        `<p>Single-repo audit. Project: <strong>${esc(audit.project)}</strong>. ${audit.dimensions.length} dimension(s) evaluated.</p>`
      );
    }

    return rows.join('\n');
  }

  // ─── Inline JS ─────────────────────────────────────────────────────────────
  const inlineJs = `
function showTab(idx){
  document.querySelectorAll('.tab-btn').forEach(function(b,i){b.classList.toggle('active',i===idx)});
  document.querySelectorAll('.tab-pane').forEach(function(p,i){p.classList.toggle('active',i===idx)});
}
function toggleIssues(btn){
  var active=document.body.classList.toggle('issues-only');
  btn.textContent=active?'Show all':'Show issues only';
  btn.classList.toggle('active',active);
}
`;

  // ─── Assemble HTML ─────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AI-SDLC Audit — ${esc(audit.project)} — ${esc(audit.date)}</title>
<style>${css}</style>
</head>
<body>
<div class="container">
<h1>AI-SDLC Readiness Audit</h1>
<div class="meta">
  <span><strong>Date:</strong> ${esc(audit.date)}</span>
  <span><strong>Project:</strong> ${esc(audit.project)}</span>
  <span><strong>Total:</strong> ${hintSpan(String(audit.audit_total) + ' pts', 'Audit total: Σ awarded category weights across all dimensions. Uncapped — rises as the standard grows.')}
  <span><strong>Coverage:</strong> ${hintSpan(pct(audit.coverage), "Coverage ratio: score ÷ Σ applicable category weights. Not a grade — read relative to today's standards.toml.")}</span>
  ${isOrg ? `<span><strong>Mode:</strong> Organization (${audit.per_repo?.length ?? 0} repos)</span>` : ''}
</div>

<div class="tabs" role="tablist">
  <button class="tab-btn active" onclick="showTab(0)" role="tab">Board / CEO</button>
  <button class="tab-btn" onclick="showTab(1)" role="tab">Head of Engineering</button>
  <button class="tab-btn" onclick="showTab(2)" role="tab">Drill-down</button>
</div>

<div class="tab-pane active" id="tab-board">
${tab1()}
</div>

<div class="tab-pane" id="tab-hoe">
${tab2()}
</div>

<div class="tab-pane" id="tab-drill">
${tab3()}
</div>

</div>
<script>${inlineJs}</script>
</body>
</html>`;
}
