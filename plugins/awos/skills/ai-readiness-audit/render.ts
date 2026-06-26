/**
 * render.ts — deterministic JSON → Markdown/HTML renderer for the ai-readiness-audit engine.
 *
 * Consumed by cli.ts via `node dist/cli.js render <audit.json> --format md|html`.
 *
 * The renderer is PURE and deterministic: no clocks (date is read from the JSON),
 * no LLM calls. The audit JSON is the single source of truth; Markdown/HTML are
 * rendered output. Plain-language narrative (insights, recommendations, per-check
 * `plain`, the headline blocks) is authored UPSTREAM by the orchestrator and stored
 * in the JSON — the renderer only formats it. See
 * docs/design/2026-06-25-report-redesign-design.md.
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
 *   // optional plain-language blocks (orchestrator-authored; all optional —
 *   // the renderer degrades gracefully when absent):
 *   "headline":         Headline,           // structured CEO blocks (delivery/scale/reach)
 *   "insights":         Insight[],          // the narrative "READ", 3–6 cards
 *   "recommendations":  Recommendation[],   // prioritized, plain-language fixes
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
 *   "plain":      string,   // OPTIONAL one-sentence non-technical explanation (orchestrator-authored)
 * }
 *
 * Headline (orchestrator-authored CEO blocks):
 * {
 *   "delivery": DeliveryMetric[],   // DORA-banded delivery metrics
 *   "scale":    ScaleMetric[],      // code scale & complexity
 *   "reach":    { ai_tooling?: string, contributors?: string },
 * }
 * DeliveryMetric: { label, display_value, band?, reliability?, check_id? }
 * ScaleMetric:    { label, display_value, check_id? }
 *
 * Insight (the narrative READ):
 * {
 *   "theme":      string,
 *   "severity":   "high|medium|low",
 *   "weak_areas": string[],
 *   "so_what":    string,   // plain "what this means"
 *   "improves":   string,   // plain "what gets better if fixed"
 * }
 *
 * Recommendation (structured form of recommendations.md):
 * {
 *   "id":        number,
 *   "priority":  "P0|P1|P2",
 *   "title":     string,
 *   "dimension": string,
 *   "check_id":  string,
 *   "effort":    string,
 *   "detail":    string,   // plain-language paragraph
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
  plain?: string;
  value_series?: Array<{ bucket_start: string; value: number | null }>;
  unit?: string;
  expression?: string;
  source_year?: number;
}

export interface DimensionArtifact {
  dimension: string;
  date: string;
  score: number;
  coverage: number;
  checks: Check[];
  [key: string]: unknown;
}

export interface DeliveryMetric {
  label: string;
  display_value: string;
  band?: string;
  reliability?: string;
  check_id?: string;
}

export interface ScaleMetric {
  label: string;
  display_value: string;
  check_id?: string;
}

export interface Headline {
  delivery?: DeliveryMetric[];
  scale?: ScaleMetric[];
  reach?: { ai_tooling?: string; contributors?: string };
}

export interface Insight {
  theme: string;
  severity: 'high' | 'medium' | 'low';
  weak_areas: string[];
  so_what: string;
  improves: string;
}

export interface Recommendation {
  id: number;
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  dimension: string;
  check_id: string;
  effort: string;
  detail: string;
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

export interface SourceSummary {
  source: string;
  available: boolean;
  reason_if_absent: string | null;
  history_available_days: number | null;
}

export interface AuditJson {
  date: string;
  project: string;
  audit_total: number;
  coverage: number;
  dimensions: DimensionArtifact[];
  // plain-language blocks (optional)
  headline?: Headline;
  insights?: Insight[];
  recommendations?: Recommendation[];
  // org-mode fields (optional)
  portfolio_metrics?: PortfolioMetric[];
  per_repo?: PerRepoSummary[];
  // collector availability
  sources?: SourceSummary[];
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------

/** Days threshold below which a source's history is flagged as limited. */
const LIMITED_HISTORY_DAYS = 30;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function pct(ratio: number): string {
  return (ratio * 100).toFixed(1) + '%';
}

/** Round floats to 2dp; integers stay integral; null/undefined → '—'. */
function fmtValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return String(v);
}

function titleLabel(dim: DimensionArtifact): string {
  return labelize(dim.dimension);
}

const ACRONYMS = new Set([
  'ai',
  'sdlc',
  'ci',
  'cd',
  'api',
  'ui',
  'ux',
  'db',
  'mcp',
  'e2e',
  'tls',
  'cors',
  'sql',
  'ml',
  'dora',
  'pii',
  'qa',
  'sbom',
  'csrf',
  'xss',
  'http',
  'https',
  'url',
  'cli',
  'llm',
]);

export function labelize(slug: string): string {
  return slug
    .split('-')
    .map((w) =>
      ACRONYMS.has(w.toLowerCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(' ');
}

/** A stable, URL-hash-safe id for a dimension. */
function dimKey(dim: DimensionArtifact): string {
  return dim.dimension;
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
 * Derive status counts for a dimension (FAIL / WARN / PASS / SKIP).
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

/** Plain-language lead for a check: prefer `plain`, fall back to `definition`. */
function plainLead(c: Check): string {
  return c.plain && c.plain.trim().length > 0 ? c.plain : c.definition;
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

/**
 * Derive prioritized recommendations from FAIL/WARN checks when the orchestrator
 * did not author a structured `recommendations[]` block. Mechanical fallback —
 * carries the check hint, not plain-language prose.
 */
function derivedRecommendations(audit: AuditJson): Recommendation[] {
  const recs: Recommendation[] = [];
  let id = 1;
  const fails: Array<{ dim: DimensionArtifact; c: Check }> = [];
  const warns: Array<{ dim: DimensionArtifact; c: Check }> = [];
  for (const dim of audit.dimensions) {
    for (const c of dim.checks) {
      if (c.status === 'FAIL') fails.push({ dim, c });
      else if (c.status === 'WARN') warns.push({ dim, c });
    }
  }
  for (const { dim, c } of fails.slice(0, 10)) {
    recs.push({
      id: id++,
      priority: 'P0',
      title: plainLead(c),
      dimension: titleLabel(dim),
      check_id: c.check_id,
      effort: '—',
      detail: c.hint,
    });
  }
  for (const { dim, c } of warns.slice(0, Math.max(0, 10 - fails.length))) {
    recs.push({
      id: id++,
      priority: 'P1',
      title: plainLead(c),
      dimension: titleLabel(dim),
      check_id: c.check_id,
      effort: '—',
      detail: c.hint,
    });
  }
  return recs;
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

/**
 * Render the audit JSON to a Markdown report.
 *
 * Markdown is a single document (no tabs/routing). It mirrors the HTML content:
 * executive headline, insights ("READ"), recommendations, the dimension summary,
 * and the per-dimension check tables (with the five-part Hint column preserved).
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

  // Executive headline blocks (delivery / scale / reach)
  if (audit.headline) {
    const h = audit.headline;
    if (h.delivery && h.delivery.length > 0) {
      lines.push('## Delivery');
      lines.push('');
      lines.push('| Metric | Value | Band |');
      lines.push('| ------ | ----- | ---- |');
      for (const d of h.delivery) {
        lines.push(`| ${d.label} | ${d.display_value} | ${d.band ?? '—'} |`);
      }
      lines.push('');
    }
    if (h.scale && h.scale.length > 0) {
      lines.push('## Code Scale & Complexity');
      lines.push('');
      for (const s of h.scale) {
        lines.push(`- **${s.label}:** ${s.display_value}`);
      }
      lines.push('');
    }
    if (h.reach && (h.reach.ai_tooling || h.reach.contributors)) {
      lines.push('## Reach');
      lines.push('');
      if (h.reach.ai_tooling) lines.push(`- ${h.reach.ai_tooling}`);
      if (h.reach.contributors) lines.push(`- ${h.reach.contributors}`);
      lines.push('');
    }
  }

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

  // Insights — the narrative "READ"
  if (audit.insights && audit.insights.length > 0) {
    lines.push('## Top Insights');
    lines.push('');
    for (const ins of audit.insights) {
      const sev = ins.severity.toUpperCase();
      lines.push(`### ${ins.theme} (${sev})`);
      lines.push('');
      lines.push(`- **What this means:** ${ins.so_what}`);
      lines.push(`- **What improves if fixed:** ${ins.improves}`);
      if (ins.weak_areas.length > 0) {
        lines.push(`- **Weak areas:** ${ins.weak_areas.join(', ')}`);
      }
      lines.push('');
    }
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

  // Recommendations (structured if authored, else derived from FAIL/WARN)
  const recs =
    audit.recommendations && audit.recommendations.length > 0
      ? audit.recommendations
      : derivedRecommendations(audit);
  lines.push('## Recommendations');
  lines.push('');
  if (recs.length === 0) {
    lines.push('No failing or warning checks. Audit is fully green.');
  } else {
    lines.push('| # | Priority | Dimension | Check | Effort | What to do |');
    lines.push('| - | -------- | --------- | ----- | ------ | ---------- |');
    for (const r of recs) {
      lines.push(
        `| ${r.id} | ${r.priority} | ${r.dimension} | ${r.check_id} | ${r.effort} | ${r.title} |`
      );
    }
    lines.push('');
    // Plain-language detail for each authored recommendation
    if (audit.recommendations && audit.recommendations.length > 0) {
      for (const r of audit.recommendations) {
        lines.push(
          `**${r.priority} · ${r.id}. ${r.title}** (${r.dimension} · ${r.check_id} · effort ${r.effort})`
        );
        lines.push('');
        lines.push(r.detail);
        lines.push('');
      }
    }
  }

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
      const valueStr = fmtValue(c.value);
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

  // Connections & Sources
  if (audit.sources && audit.sources.length > 0) {
    lines.push('## Connections & Sources');
    lines.push('');
    const connected = audit.sources.filter((s) => s.available);
    const missed = audit.sources.filter((s) => !s.available);
    if (connected.length > 0) {
      lines.push('**Connected:**');
      lines.push('');
      for (const s of connected) {
        const limitedNote =
          s.history_available_days !== null &&
          s.history_available_days < LIMITED_HISTORY_DAYS
            ? ` (limited history ~${s.history_available_days} days)`
            : '';
        lines.push(`- ${s.source}${limitedNote}`);
      }
      lines.push('');
    }
    if (missed.length > 0) {
      lines.push('**Missed / limited:**');
      lines.push('');
      for (const s of missed) {
        const reason = s.reason_if_absent ? ` — ${s.reason_if_absent}` : '';
        lines.push(`- ${s.source}${reason}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTML renderer
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
 * Instant, plain-first tooltip. Renders a nested .tipbox shown on hover/focus
 * with NO delay (pure CSS). Leads with a bold plain-language line; the dense,
 * specialist detail is demoted to small print below it.
 */
function tip(value: string, plain: string, meta = ''): string {
  const metaHtml = meta ? `<span class="tipmeta">${esc(meta)}</span>` : '';
  return `<span class="tip" tabindex="0">${esc(value)}<span class="tipbox"><b>${esc(plain)}</b>${metaHtml}</span></span>`;
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

const BAND_COLOR: Record<string, string> = {
  elite: '#16a34a',
  high: '#22c55e',
  medium: '#eab308',
  low: '#ef4444',
};

const SEVERITY_COLOR: Record<string, string> = {
  high: '#ef4444',
  medium: '#eab308',
  low: '#6366f1',
};

const PRIORITY_COLOR: Record<string, string> = {
  P0: '#ef4444',
  P1: '#eab308',
  P2: '#6366f1',
};

/**
 * Render the audit JSON to a self-contained HTML file: ONE scrolling page.
 *
 *   Overview (#)        — executive band (CEO stops here) · top insights ·
 *                         what to improve · dimension summary table
 *   Dimension (#dim/<k>) — drill-down sub-page: recommendations + check table,
 *                         reached by clicking a dimension; browser Back returns.
 *
 * Features:
 *   - Instant, plain-first CSS tooltips (no native title= delay)
 *   - Hash-routed sub-pages; browser Back/Forward work natively
 *   - "Issues only" filter toggle (hides PASS/SKIP rows via body class)
 *   - @media print (expand all, hide toggles)
 *   - value_series rendered as inline SVG sparkline
 *   - All plain-language blocks optional; degrades to the capability headline
 */
export function renderHtml(audit: AuditJson): string {
  const isOrg =
    Array.isArray(audit.portfolio_metrics) &&
    audit.portfolio_metrics.length > 0;

  // ─── CSS ──────────────────────────────────────────────────────────────────
  const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#1e293b;font-size:14px;line-height:1.5}
.container{max-width:980px;margin:0 auto;padding:24px}
h1{font-size:1.5rem;font-weight:700;margin-bottom:4px}
h2{font-size:1.15rem;font-weight:600;margin:24px 0 10px}
h3{font-size:.95rem;font-weight:600;margin:0 0 6px;color:#475569}
.meta{color:#64748b;font-size:.85rem;margin-bottom:8px}
.meta span{margin-right:16px}
a{color:#4f46e5;text-decoration:none}
a:hover{text-decoration:underline}
/* executive band */
.exec{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:20px}
.cap-score{font-size:2.2rem;font-weight:800;color:#4f46e5;line-height:1.1}
.cap-cov{font-size:.95rem;color:#64748b;margin-top:2px}
.exec-blocks{display:flex;flex-direction:column;gap:18px;margin-top:16px}
.exec-col{border-top:1px solid #eef2f7;padding-top:12px}
.kv{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:3px 0;font-size:.85rem}
.kv .k{color:#475569}
.kv .v{font-weight:600;text-align:right}
.band{display:inline-block;color:#fff;font-size:.68rem;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:6px;vertical-align:middle}
/* metric cards (org) */
.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:12px 0}
.metric-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px}
.metric-card .metric-val{font-size:1.6rem;font-weight:700;color:#4f46e5;margin:4px 0}
.metric-card .metric-desc{font-size:.78rem;color:#64748b}
/* insights */
.insights{display:grid;gap:12px;margin-bottom:8px}
.insight{background:#fff;border:1px solid #e2e8f0;border-left-width:4px;border-radius:8px;padding:12px 16px}
.insight .theme{font-weight:700;margin-bottom:4px}
.insight .so{margin-bottom:4px}
.insight .improves{color:#475569}
.insight .areas{font-size:.78rem;color:#94a3b8;margin-top:6px}
/* recommendations */
.rec{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:8px}
.rec .rec-head{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}
.rec .prio{color:#fff;font-size:.7rem;font-weight:700;padding:1px 7px;border-radius:4px}
.rec .rec-title{font-weight:600}
.rec .rec-where{font-size:.75rem;color:#94a3b8}
.rec .rec-detail{font-size:.85rem;color:#475569;margin-top:6px}
/* tables */
table{width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:16px}
th{background:#f1f5f9;text-align:left;padding:6px 8px;border-bottom:2px solid #e2e8f0;font-weight:600}
td{padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top}
tr[data-status='PASS'] td{background:#f0fdf4}
tr[data-status='WARN'] td{background:#fefce8}
tr[data-status='FAIL'] td{background:#fef2f2}
tr[data-status='SKIP'] td{background:#f9fafb}
tr.low-cov td{background:#fff7ed}
/* dimension summary rows are clickable */
tr.dim-row{cursor:pointer}
tr.dim-row:hover td{background:#eef2ff}
/* check table: fixed layout so Evidence gets the room it needs */
table.checks{table-layout:fixed}
table.checks td.evidence{font-size:.78rem;white-space:normal;overflow-wrap:anywhere;word-break:break-word;color:#334155}
table.checks td.check b{font-size:.82rem}
table.checks td.check .plain{display:block;font-size:.75rem;color:#64748b;margin-top:2px}
/* issues-only filter */
body.issues-only tr[data-status='PASS'],body.issues-only tr[data-status='SKIP']{display:none}
.toolbar{display:flex;gap:8px;align-items:center;margin-bottom:12px}
.toolbar button{padding:5px 12px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;font-size:.8rem}
.toolbar button.active{background:#4f46e5;color:#fff;border-color:#4f46e5}
.backlink{display:inline-block;margin-bottom:10px;font-size:.85rem}
.dim-head{font-size:.9rem;color:#64748b;margin-bottom:12px}
/* reliability colours */
.rel-minimal{color:#d97706}
.rel-not-reliable{color:#dc2626}
/* instant plain-first tooltip */
.tip{position:relative;cursor:help;border-bottom:1px dotted #94a3b8;outline:none}
.tip>.tipbox{display:none;position:absolute;left:0;top:calc(100% + 4px);z-index:60;width:max-content;max-width:320px;background:#1e293b;color:#f8fafc;padding:8px 10px;border-radius:6px;font-size:.75rem;font-weight:400;line-height:1.45;white-space:normal;box-shadow:0 6px 18px rgba(0,0,0,.22)}
.tip:hover>.tipbox,.tip:focus>.tipbox,.tip:focus-within>.tipbox{display:block}
.tipbox b{display:block;margin-bottom:4px;font-weight:700}
.tipbox .tipmeta{color:#cbd5e1;font-size:.7rem}
.badge{display:inline-block}
.dim-page{display:none}
/* print: show everything, drop interactive chrome */
@media print{
  .toolbar{display:none}
  .backlink{display:none}
  .dim-page{display:block!important}
  #overview{display:block!important}
  .tip>.tipbox{display:none!important}
}
`;

  // ─── Executive band (CEO stops here) ───────────────────────────────────────
  function execBand(): string {
    const rows: string[] = [];
    rows.push('<div class="exec">');

    if (isOrg && audit.portfolio_metrics) {
      // Org: capability is the org capability score; show ≤3 portfolio cards.
      rows.push('<div class="metric-grid">');
      for (const m of audit.portfolio_metrics) {
        const val =
          m.metric === 'org_capability_score'
            ? m.value.toFixed(2) + ' pts'
            : pct(m.value);
        rows.push(`<div class="metric-card">
  <div class="metric-name">${esc(metricLabel(m.metric))}</div>
  <div class="metric-val">${tip(val, m.description, `${m.repos_counted} repos · ${m.contributor_weighted ? 'contributor-weighted' : 'equal-weighted'}`)}</div>
  <div class="metric-desc">${esc(m.description)}</div>
</div>`);
      }
      rows.push('</div>');
    } else {
      // Single-repo capability headline
      rows.push(
        `<div class="cap-score">${tip(String(audit.audit_total) + ' pts', 'Total AI-SDLC capability — the sum of all capabilities the project has in place. It is uncapped and rises as the standard grows; it is not a grade out of 100.', 'Σ awarded category weights across all dimensions · standards.toml')}</div>`
      );
      rows.push(
        `<div class="cap-cov">Coverage ${tip(pct(audit.coverage), "How much of today's expected capability is in place. Read it as 'we have X% of what the current standard asks for', not as a school grade.", 'score ÷ Σ applicable category weights · standards.toml')}</div>`
      );
    }

    // Headline blocks: delivery / scale / reach (single-repo and org)
    const h = audit.headline;
    const blocks: string[] = [];
    if (h?.delivery && h.delivery.length > 0) {
      const items = h.delivery
        .map((d) => {
          const bandHtml = d.band
            ? `<span class="band" style="background:${BAND_COLOR[d.band.toLowerCase()] ?? '#94a3b8'}">${esc(d.band)}</span>`
            : '';
          return `<div class="kv"><span class="k">${esc(d.label)}</span><span class="v">${esc(d.display_value)}${bandHtml}</span></div>`;
        })
        .join('');
      blocks.push(
        `<div class="exec-col"><h3>Delivery (vs DORA bands)</h3>${items}</div>`
      );
    }
    if (h?.scale && h.scale.length > 0) {
      const items = h.scale
        .map(
          (s) =>
            `<div class="kv"><span class="k">${esc(s.label)}</span><span class="v">${esc(s.display_value)}</span></div>`
        )
        .join('');
      blocks.push(
        `<div class="exec-col"><h3>Code scale &amp; complexity</h3>${items}</div>`
      );
    }
    const reachItems: string[] = [];
    if (h?.reach?.ai_tooling)
      reachItems.push(
        `<div class="kv"><span class="k">AI tooling</span><span class="v">${esc(h.reach.ai_tooling)}</span></div>`
      );
    if (h?.reach?.contributors)
      reachItems.push(
        `<div class="kv"><span class="k">Contributors</span><span class="v">${esc(h.reach.contributors)}</span></div>`
      );
    if (isOrg && audit.per_repo && audit.per_repo.length > 0) {
      const withTooling = audit.per_repo.filter((r) => r.has_ai_tooling).length;
      reachItems.push(
        `<div class="kv"><span class="k">Repos with AI tooling</span><span class="v">${withTooling} / ${audit.per_repo.length}</span></div>`
      );
    }
    if (reachItems.length > 0) {
      blocks.push(
        `<div class="exec-col"><h3>Reach</h3>${reachItems.join('')}</div>`
      );
    }
    if (blocks.length > 0) {
      rows.push(`<div class="exec-blocks">${blocks.join('')}</div>`);
    }

    rows.push('</div>'); // .exec
    return rows.join('\n');
  }

  // ─── Top insights (the narrative READ) ─────────────────────────────────────
  function insightsSection(): string {
    if (!audit.insights || audit.insights.length === 0) return '';
    const rows: string[] = ['<h2>Top insights</h2>', '<div class="insights">'];
    for (const ins of audit.insights) {
      const color = SEVERITY_COLOR[ins.severity] ?? '#6366f1';
      const areas =
        ins.weak_areas.length > 0
          ? `<div class="areas">Weak: ${esc(ins.weak_areas.join(', '))}</div>`
          : '';
      rows.push(`<div class="insight" style="border-left-color:${color}">
  <div class="theme">${esc(ins.theme)}</div>
  <div class="so">${esc(ins.so_what)}</div>
  <div class="improves">→ ${esc(ins.improves)}</div>
  ${areas}
</div>`);
    }
    rows.push('</div>');
    return rows.join('\n');
  }

  // ─── What to improve (recommendations) ─────────────────────────────────────
  function recommendationsSection(): string {
    const recs =
      audit.recommendations && audit.recommendations.length > 0
        ? audit.recommendations
        : derivedRecommendations(audit);
    if (recs.length === 0) {
      return '<h2>What to improve</h2><p>No failing or warning checks. Audit is fully green.</p>';
    }
    const rows: string[] = ['<h2>What to improve</h2>'];
    for (const r of recs) {
      const prioColor = PRIORITY_COLOR[r.priority] ?? '#6366f1';
      const detail = r.detail
        ? `<div class="rec-detail">${esc(r.detail)}</div>`
        : '';
      rows.push(`<div class="rec">
  <div class="rec-head">
    <span class="prio" style="background:${prioColor}">${esc(r.priority)}</span>
    <span class="rec-title">${esc(r.title)}</span>
    <span class="rec-where">${esc(r.dimension)} · ${esc(r.check_id)} · effort ${esc(r.effort)}</span>
  </div>
  ${detail}
</div>`);
    }
    return rows.join('\n');
  }

  // ─── Dimension summary table (overview; rows link to sub-pages) ─────────────
  function dimensionSummary(): string {
    const rows: string[] = ['<h2>Dimensions</h2>'];
    rows.push(
      '<table><thead><tr><th>#</th><th>Dimension</th><th>Points</th><th>Coverage</th><th>Reliability</th><th>FAIL</th><th>WARN</th><th>PASS</th><th>SKIP</th></tr></thead><tbody>'
    );
    let n = 1;
    for (const dim of audit.dimensions) {
      const counts = statusCounts(dim);
      const covPct = pct(dim.coverage);
      const lowCov = dim.coverage < 0.4 ? ' low-cov' : '';
      const anyMinimal = dim.checks.some(
        (c) => c.applies && c.reliability.tag === 'minimal'
      );
      const relStr = anyMinimal ? 'minimal *' : 'maximal';
      const key = dimKey(dim);
      const href = `#dim/${esc(key)}`;
      rows.push(`<tr class="dim-row${lowCov}" onclick="location.hash='dim/${esc(key)}'">
  <td>${n++}</td>
  <td><a href="${href}"><strong>${esc(titleLabel(dim))}</strong></a></td>
  <td>${tip(String(dim.score) + ' pts', `Capability earned in this area: ${dim.score} points.`, `coverage ${covPct} · ${esc(dim.dimension)} · standards.toml`)}</td>
  <td>${tip(covPct, `Share of this area's expected capability that is in place.`, `score ÷ Σ applicable weights · ${esc(dim.dimension)}`)}</td>
  <td>${tip(relStr, anyMinimal ? 'Some numbers here are lower bounds — the true value may be higher.' : 'Numbers here are upper-bound reliable for what was reachable.', '')}</td>
  <td>${counts.fail > 0 ? `<span style="color:#ef4444;font-weight:600">${counts.fail}</span>` : counts.fail}</td>
  <td>${counts.warn > 0 ? `<span style="color:#eab308;font-weight:600">${counts.warn}</span>` : counts.warn}</td>
  <td>${counts.pass}</td>
  <td>${counts.skip}</td>
</tr>`);
    }
    rows.push('</tbody></table>');
    return rows.join('\n');
  }

  // ─── One drill-down sub-page per dimension ─────────────────────────────────
  function dimensionPage(dim: DimensionArtifact): string {
    const key = dimKey(dim);
    const counts = statusCounts(dim);
    const covPct = pct(dim.coverage);
    const rows: string[] = [];
    rows.push(`<section class="dim-page" id="page-${esc(key)}">`);
    rows.push('<a class="backlink" href="#">← Back to overview</a>');
    rows.push(`<h2>${esc(titleLabel(dim))}</h2>`);
    rows.push(
      `<div class="dim-head">${tip(String(dim.score) + ' pts', `Capability earned in this area: ${dim.score} points.`, 'Σ awarded weights · standards.toml')} · coverage ${tip(covPct, `Share of this area's expected capability that is in place.`, 'score ÷ Σ applicable weights')} · FAIL ${counts.fail} · WARN ${counts.warn} · PASS ${counts.pass} · SKIP ${counts.skip}</div>`
    );

    // Recommendations scoped to this dimension
    const dimLabel = titleLabel(dim);
    const dimRecs = (audit.recommendations ?? []).filter(
      (r) => r.dimension === dimLabel || r.dimension === dim.dimension
    );
    if (dimRecs.length > 0) {
      rows.push('<h3>What to improve here</h3>');
      for (const r of dimRecs) {
        const prioColor = PRIORITY_COLOR[r.priority] ?? '#6366f1';
        rows.push(`<div class="rec">
  <div class="rec-head"><span class="prio" style="background:${prioColor}">${esc(r.priority)}</span><span class="rec-title">${esc(r.title)}</span><span class="rec-where">${esc(r.check_id)} · effort ${esc(r.effort)}</span></div>
  ${r.detail ? `<div class="rec-detail">${esc(r.detail)}</div>` : ''}
</div>`);
      }
    }

    rows.push(
      '<div class="toolbar"><button onclick="toggleIssues(this)">Show issues only</button></div>'
    );
    rows.push(
      '<table class="checks"><colgroup><col style="width:3%"><col style="width:24%"><col style="width:8%"><col style="width:7%"><col style="width:10%"><col style="width:13%"><col style="width:35%"></colgroup>'
    );
    rows.push(
      '<thead><tr><th>#</th><th>Check</th><th>Status</th><th>Points</th><th>Reliability</th><th>Value</th><th>Evidence</th></tr></thead><tbody>'
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
      const relTipPlain =
        c.reliability.tag === 'minimal'
          ? 'This is a lower bound — the real value may be higher.'
          : c.reliability.tag === 'not-reliable'
            ? 'A rough proxy — treat as indicative, not exact.'
            : 'Reliable for what was reachable.';
      const seriesSvg =
        c.value_series && c.value_series.length > 0
          ? sparklineSvg(c.value_series)
          : '';
      const evidence =
        c.evidence.length > 0 ? c.evidence.map(esc).join('<br>') : '—';
      // Technical detail (code · source · method) folded into the Check tooltip.
      const codeStr = c.code && c.code.length > 0 ? c.code.join(', ') : '—';
      const checkMeta = `${esc(c.definition)} — source: ${esc(c.source || '—')} · method: ${esc(c.method)} · category ${esc(codeStr)}`;
      // Points cell: tooltip enriched with standards.toml-derived meta.
      const pointsMeta = `${c.definition}${c.source ? ` · ${c.source}` : ''}${c.source_year ? ` (${c.source_year})` : ''}`;
      const pointsCell = tip(
        String(c.weight_awarded) + '/' + String(c.weight_max),
        `Worth up to ${c.weight_max} points · ${c.method}`,
        pointsMeta
      );
      // Value cell: rounded + expression tooltip when available.
      const valueCell = c.expression
        ? tip(fmtValue(c.value), c.expression, c.unit ? `unit: ${c.unit}` : '')
        : esc(fmtValue(c.value));
      rows.push(`<tr data-status="${esc(c.status)}" style="background:${rowBg}">
  <td>${ckn++}</td>
  <td class="check"><span class="tip" tabindex="0"><b>${esc(c.check_id)}</b><span class="tipbox"><b>${esc(plainLead(c))}</b><span class="tipmeta">${checkMeta}</span></span></span><span class="plain">${esc(plainLead(c))}</span></td>
  <td>${statusBadge(c.status)}</td>
  <td>${pointsCell}</td>
  <td class="${relClass}">${tip(relLabel, relTipPlain, c.reliability.note ?? '')}</td>
  <td>${valueCell}${seriesSvg}</td>
  <td class="evidence">${evidence}</td>
</tr>`);
    }
    rows.push('</tbody></table>');
    if (hasMinimal) {
      rows.push(
        '<p style="font-size:.78rem;color:#64748b">* lower-bound measurement (reliability tag: minimal).</p>'
      );
    }
    rows.push('</section>');
    return rows.join('\n');
  }

  // ─── Repositories & Connections (org mode + single-repo note) ──────────────
  function reposSection(): string {
    const rows: string[] = ['<h2>Repositories &amp; Connections</h2>'];
    if (isOrg && audit.per_repo && audit.per_repo.length > 0) {
      rows.push(
        '<table><thead><tr><th>Repo</th><th>Contributors</th><th>Sources</th><th>AI Tooling</th><th>Awarded Weight</th></tr></thead><tbody>'
      );
      for (const r of audit.per_repo) {
        const sources =
          r.sources_reachable.length > 0
            ? r.sources_reachable.map(esc).join(', ')
            : '<em>none detected</em>';
        rows.push(`<tr>
  <td>${esc(r.repo)}</td>
  <td>${r.contributors !== null ? tip(String(r.contributors), 'Aggregate active-contributor count — no per-person data.', '') : '—'}</td>
  <td>${sources}</td>
  <td>${r.has_ai_tooling ? '✓ yes' : '✗ no'}</td>
  <td>${tip(String(r.awarded_weight), `Capability points earned by this repo: ${r.awarded_weight}.`, '')}</td>
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

  // ─── Connections & Sources section ─────────────────────────────────────────
  function connectionsSection(): string {
    if (!audit.sources || audit.sources.length === 0) return '';
    const rows: string[] = ['<h2>Connections &amp; Sources</h2>'];
    const connected = audit.sources.filter((s) => s.available);
    const missed = audit.sources.filter((s) => !s.available);
    if (connected.length > 0) {
      rows.push('<h3>Connected</h3><ul>');
      for (const s of connected) {
        const limitedNote =
          s.history_available_days !== null &&
          s.history_available_days < LIMITED_HISTORY_DAYS
            ? ` <em>(limited history ~${s.history_available_days} days)</em>`
            : '';
        rows.push(`<li>${esc(s.source)}${limitedNote}</li>`);
      }
      rows.push('</ul>');
    }
    if (missed.length > 0) {
      rows.push('<h3>Missed / limited</h3><ul>');
      for (const s of missed) {
        const reason = s.reason_if_absent
          ? ` — ${esc(s.reason_if_absent)}`
          : '';
        rows.push(`<li>${esc(s.source)}${reason}</li>`);
      }
      rows.push('</ul>');
    }
    return rows.join('\n');
  }

  // ─── Inline JS — hash routing + issues filter ──────────────────────────────
  const inlineJs = `
function route(){
  var h=location.hash.replace(/^#/,'');
  var isDim=h.indexOf('dim/')===0;
  var ov=document.getElementById('overview');
  document.querySelectorAll('.dim-page').forEach(function(p){p.style.display='none'});
  if(isDim){
    var el=document.getElementById('page-'+h.slice(4));
    if(el){ov.style.display='none';el.style.display='block';window.scrollTo(0,0);return;}
  }
  ov.style.display='block';
}
function toggleIssues(btn){
  var active=document.body.classList.toggle('issues-only');
  btn.textContent=active?'Show all':'Show issues only';
  btn.classList.toggle('active',active);
}
window.addEventListener('hashchange',route);
route();
`;

  // ─── Assemble HTML ─────────────────────────────────────────────────────────
  const dimPages = audit.dimensions.map((d) => dimensionPage(d)).join('\n');

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
  ${isOrg ? `<span><strong>Mode:</strong> Organization (${audit.per_repo?.length ?? 0} repos)</span>` : ''}
</div>

<div id="overview">
${execBand()}
${insightsSection()}
${recommendationsSection()}
${dimensionSummary()}
${reposSection()}
${connectionsSection()}
</div>

${dimPages}

</div>
<script>${inlineJs}</script>
</body>
</html>`;
}
