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
 * DeliveryMetric: { label, display_value?, band?, reliability?, check_id?, gated?: 'tracker'|'incident' }
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
 *   // Enriched by org_rollup (Task 5.2) — optional:
 *   "audit_total":       number?,
 *   "coverage":          number?,
 *   "merges_per_active": number | null?,
 *   "loc_per_active":    number | null?,
 *   "deploy_freq":       number | null?,
 *   "rework_rate":       number | null?,
 *   "lead_time":         number | null?,
 *   "change_fail":       number | null?,
 * }
 * =============================================================================
 */

// LinkedRepo is defined once in topology.ts; imported here for local use and
// re-exported below to preserve render.ts's public API surface.
import type { LinkedRepo } from './topology.ts';

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
  status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP' | 'PARTIAL';
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
  unit?: string;
  expression?: string;
  source_date?: string | null;
  source_url?: string | null;
  score?: number;
  confidence?: number;
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
  display_value?: string;
  band?: string;
  reliability?: string;
  check_id?: string;
  /** When set, the metric requires an external connector. If display_value is absent the renderer shows a "needs X connector" note instead of a value. */
  gated?: 'tracker' | 'incident';
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
  // Enriched by org_rollup (Task 5.2); optional so single-repo JSON still validates.
  audit_total?: number | null;
  coverage?: number | null;
  merges_per_active?: number | null;
  loc_per_active?: number | null;
  deploy_freq?: number | null;
  rework_rate?: number | null;
  lead_time?: number | null;
  change_fail?: number | null;
}

export interface SourceSummary {
  source: string;
  available: boolean;
  reason_if_absent: string | null;
  history_available_days: number | null;
}

// Re-exported so callers that previously imported LinkedRepo from render.ts continue to work.
export type { LinkedRepo };

export interface TechItem {
  name: string;
  evidence: string;
}

export interface TechStack {
  languages: TechItem[];
  agent_tools: TechItem[];
  ci: TechItem[];
  frameworks: TechItem[];
}

export interface DetectionConflict {
  file: string;
  claimedBy: string[];
}

/** One item in the org Connections aggregated view: name + number of repos that have it. */
export interface OrgConnItem {
  name: string;
  count: number;
}

/**
 * Cross-repo aggregation of connections and stack items (Task 5.4).
 * Produced by org_rollup and stored in org-portfolio.json for the renderer.
 */
export interface OrgConnections {
  sources: OrgConnItem[];
  languages: OrgConnItem[];
  frameworks: OrgConnItem[];
  agent_tools: OrgConnItem[];
  ci: OrgConnItem[];
  linked_repos: OrgConnItem[];
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
  /** Aggregated connections across repos (org mode, Task 5.4). */
  org_connections?: OrgConnections;
  // collector availability
  sources?: SourceSummary[];
  // per-source lookback window (populated by audit_core from collected/ artifacts)
  source_windows?: Record<string, { days: number | null; label: string }>;
  // linked repos + tech-stack metadata (optional; populated by audit_core)
  linked_repos?: LinkedRepo[];
  tech_stack?: TechStack;
  detection_conflicts?: DetectionConflict[];
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------

/** Days threshold below which a source's history is flagged as limited. */
const LIMITED_HISTORY_DAYS = 30;

/** Fallback human label for each source key when source_windows is absent. */
const SOURCE_LABEL_DEFAULTS: Record<string, string> = {
  git: 'git history',
  ci: 'CI runs',
  tracker: 'issue tracker',
  docs: 'docs/wiki',
  scale: 'source code (AST)',
  audit: 'source code',
  incident: 'incident source',
  'org-rollup': 'portfolio',
};

/**
 * Format a source's window for a tooltip line.
 *
 * Returns `<label> (~<N> months)` for ≥60 days, `<label> (~<N> days)` for
 * shorter windows, or just `<label>` when `days` is null (e.g. scale/audit).
 */
export function formatSourceWindow(
  src: string,
  sourceWindows:
    | Record<string, { days: number | null; label: string }>
    | undefined
): string {
  const win = sourceWindows?.[src];
  const label = win?.label ?? SOURCE_LABEL_DEFAULTS[src] ?? src;
  const days = win?.days ?? null;
  if (days === null) return label;
  const windowStr =
    days >= 60 ? `${Math.round(days / 30)} months` : `${days} days`;
  return `${label} (~${windowStr})`;
}

/**
 * The measurement window for the whole report, as a header phrase such as
 * "last 90 days (2026-04-02 – 2026-07-01)". Derived from the git source window
 * (the primary time-bounded source); the date range is computed back from
 * `endDate` (the audit date). Returns null when no windowed source is present
 * (e.g. scale-only); omits the range when `endDate` is missing/unparseable.
 */
export function measurementWindowLabel(
  sourceWindows:
    | Record<string, { days: number | null; label: string }>
    | undefined,
  endDate?: string
): string | null {
  const days = sourceWindows?.['git']?.days ?? null;
  if (days === null || days === undefined) return null;
  if (!endDate) return `last ${days} days`;
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return `last ${days} days`;
  const start = new Date(end.getTime() - days * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return `last ${days} days (${iso(start)} – ${iso(end)})`;
}

/**
 * Returns a short display label for a source key.
 *
 * Truncates the recorded label at the first ' via ' boundary (e.g.
 * "Jira (project X) via Atlassian MCP" → "Jira (project X)"), then at
 * ' (project' (e.g. "Jira (project X)" → "Jira"). Falls back to
 * SOURCE_LABEL_DEFAULTS[src] when no label is recorded.
 */
export function shortSourceLabel(
  src: string,
  sourceWindows:
    | Record<string, { days: number | null; label: string }>
    | undefined
): string {
  const recorded = sourceWindows?.[src]?.label;
  if (!recorded) return SOURCE_LABEL_DEFAULTS[src] ?? src;
  const viaIdx = recorded.indexOf(' via ');
  let short = viaIdx !== -1 ? recorded.slice(0, viaIdx) : recorded;
  const projIdx = short.indexOf(' (project');
  if (projIdx !== -1) short = short.slice(0, projIdx);
  return short.trim() || (SOURCE_LABEL_DEFAULTS[src] ?? src);
}

/**
 * Full human label for a source key (no lookback window). Prefers the recorded
 * `source_windows` label, falls back to SOURCE_LABEL_DEFAULTS, then the raw key.
 * Used for the Connected / Missed lists where a bare key like "tracker" reads as
 * jargon — "issue tracker" is the friendly form.
 */
export function sourceFullLabel(
  src: string,
  sourceWindows:
    | Record<string, { days: number | null; label: string }>
    | undefined
): string {
  return sourceWindows?.[src]?.label ?? SOURCE_LABEL_DEFAULTS[src] ?? src;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Group linked repos by `name`, preserving first-seen order, collecting every
 * `via` path that reaches each name. Lets the renderer show one line per repo
 * with all its links (e.g. `onex-discovery-awos via .awos, context/product`).
 */
function groupLinkedByName(
  bucket: LinkedRepo[]
): Array<{ name: string; vias: string[] }> {
  const order: string[] = [];
  const viasByName = new Map<string, string[]>();
  for (const r of bucket) {
    if (!viasByName.has(r.name)) {
      viasByName.set(r.name, []);
      order.push(r.name);
    }
    viasByName.get(r.name)!.push(r.via);
  }
  return order.map((name) => ({ name, vias: viasByName.get(name)! }));
}

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

/** Format a weight number for display: integers as-is, fractions to 1 dp. */
function fmtPts(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 10) / 10).toFixed(1);
}

// Delivery-value formatters for the per-repo org table (Task 5.3).
// Each returns "—" when the value is null/undefined.
function fmtN1dp(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(1);
}
function fmtWk(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(1) + ' / wk';
}
function fmtPctMul(v: number | null | undefined): string {
  return v == null ? '—' : (v * 100).toFixed(1) + '%';
}
function fmtH(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(1) + ' h';
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
 * Derive status counts for a dimension (FAIL / WARN / PARTIAL / PASS / SKIP).
 */
function statusCounts(dim: DimensionArtifact): {
  fail: number;
  warn: number;
  partial: number;
  pass: number;
  skip: number;
} {
  let fail = 0,
    warn = 0,
    partial = 0,
    pass = 0,
    skip = 0;
  for (const c of dim.checks) {
    if (c.status === 'FAIL') fail++;
    else if (c.status === 'WARN') warn++;
    else if (c.status === 'PARTIAL') partial++;
    else if (c.status === 'PASS') pass++;
    else skip++;
  }
  return { fail, warn, partial, pass, skip };
}

/** Plain-language lead for a check: prefer `plain`, fall back to `definition`. */
function plainLead(c: Check): string {
  return c.plain && c.plain.trim().length > 0 ? c.plain : c.definition;
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
  const windowLabel = measurementWindowLabel(audit.source_windows, audit.date);
  if (windowLabel) {
    lines.push(`**Measurement window:** ${windowLabel}`);
  }
  lines.push(`**Audit Total:** ${fmtPts(audit.audit_total)} pts`);
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
        if (d.gated && deliveryValueAbsent(d.display_value)) {
          const note =
            d.gated === 'tracker'
              ? '— (needs ticketing connector)'
              : '— (needs incident connector)';
          lines.push(`| ${d.label} | ${note} | |`);
        } else {
          lines.push(`| ${d.label} | ${d.display_value} | ${d.band ?? '—'} |`);
        }
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
    '| # | Dimension | Points | Sources | Coverage | FAIL | WARN | PARTIAL | PASS | SKIP |'
  );
  lines.push(
    '| - | --------- | ------ | ------- | -------- | ---- | ---- | ------- | ---- | ---- |'
  );
  let rowNum = 1;
  for (const dim of audit.dimensions) {
    const counts = statusCounts(dim);
    const dimSourcesUsed = (dim.sources_used as string[] | undefined) ?? [];
    const sourcesCell =
      dimSourcesUsed.length === 0
        ? '—'
        : dimSourcesUsed
            .map(
              (s) =>
                audit.source_windows?.[s]?.label ??
                SOURCE_LABEL_DEFAULTS[s] ??
                s
            )
            .join(', ');
    lines.push(
      `| ${rowNum++} | ${titleLabel(dim)} | ${fmtPts(dim.score)} | ${sourcesCell} | ${pct(dim.coverage)} | ${counts.fail} | ${counts.warn} | ${counts.partial} | ${counts.pass} | ${counts.skip} |`
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
      `**Score:** ${fmtPts(dim.score)} pts (coverage ${pct(dim.coverage)} rel. today's standard)`
    );
    lines.push('');

    // Check table with Hint column
    lines.push(
      '| # | Check ID | Method | Weight Awarded | Weight Max | Status | Reliability | Confidence | Value | Hint |'
    );
    lines.push(
      '| - | -------- | ------ | -------------- | ---------- | ------ | ----------- | ---------- | ----- | ---- |'
    );
    let checkNum = 1;
    let hasMinimal = false;
    for (const c of dim.checks) {
      const reliabilityStr = c.applies
        ? `${c.reliability.tag} (${c.reliability.confidence})${c.reliability.tag === 'minimal' ? ' *' : ''}`
        : '—';
      if (c.reliability.tag === 'minimal' && c.applies) hasMinimal = true;
      const confStr =
        c.status === 'SKIP' ? '—' : `${Math.round((c.confidence ?? 0) * 100)}%`;
      const valueStr =
        c.status === 'SKIP' && c.evidence && c.evidence.length > 0
          ? c.evidence.join('; ')
          : c.value != null && c.unit && !c.expression
            ? `${fmtValue(c.value)} ${c.unit}`
            : fmtValue(c.value);
      const hint = c.hint ?? '—';
      const sourceCiteMd =
        c.source_url && c.source_date
          ? ` — [${c.source} ${c.source_date}](${c.source_url})`
          : c.source_url
            ? ` — [${c.source}](${c.source_url})`
            : '';
      lines.push(
        `| ${checkNum++} | ${c.check_id} | ${c.method} | ${fmtPts(c.weight_awarded)} | ${c.weight_max} | ${c.status} | ${reliabilityStr} | ${confStr} | ${valueStr} | ${hint}${sourceCiteMd} |`
      );
    }
    lines.push('');
    if (hasMinimal) {
      lines.push('`*` lower-bound measurement (reliability tag: `minimal`).');
      lines.push('');
    }
  }

  // Per-repo table (org mode) — Task 5.3: delivery columns + links to per-repo reports
  if (isOrg && audit.per_repo && audit.per_repo.length > 0) {
    lines.push('## Repositories');
    lines.push('');
    lines.push(
      '| Repo | Points | Coverage | Merges/active | LOC/active | Deploy freq | Rework rate | Lead time | Change-fail | Cycle time¹ | MTTR² |'
    );
    lines.push(
      '| ---- | ------ | -------- | ------------- | ---------- | ----------- | ----------- | --------- | ----------- | ----------- | ----- |'
    );
    for (const r of audit.per_repo) {
      const repoLink = `[${r.repo}](per-repo/${r.repo}/report.html)`;
      const coverage = r.coverage != null ? pct(r.coverage) : '—';
      lines.push(
        `| ${repoLink} | ${fmtPts(r.awarded_weight)} | ${coverage} | ${fmtN1dp(r.merges_per_active)} | ${fmtN1dp(r.loc_per_active)} | ${fmtWk(r.deploy_freq)} | ${fmtPctMul(r.rework_rate)} | ${fmtH(r.lead_time)} | ${fmtPctMul(r.change_fail)} | — | — |`
      );
    }
    lines.push('');
    lines.push(
      '¹ Cycle time (Jira In-Progress→Done) requires a ticketing connector.'
    );
    lines.push('² MTTR requires an incident connector.');
    lines.push('');
  }

  // Connections & Sources — org mode shows an aggregated count view; single-repo shows connected/missed.
  if (isOrg && audit.org_connections) {
    const oc = audit.org_connections;
    lines.push('## Connections & Sources');
    lines.push('');
    const connMdItems = (
      items: OrgConnItem[],
      labelFn: (n: string) => string
    ): string => items.map((i) => `${labelFn(i.name)} (${i.count})`).join(', ');
    if (oc.sources.length > 0) {
      lines.push(
        '**Sources:** ' +
          connMdItems(oc.sources, (n) =>
            sourceFullLabel(n, audit.source_windows)
          )
      );
      lines.push('');
    }
    if (oc.languages.length > 0) {
      lines.push('**Languages:** ' + connMdItems(oc.languages, (n) => n));
      lines.push('');
    }
    if (oc.agent_tools.length > 0) {
      lines.push('**Agent Tools:** ' + connMdItems(oc.agent_tools, (n) => n));
      lines.push('');
    }
    if (oc.ci.length > 0) {
      lines.push('**CI:** ' + connMdItems(oc.ci, (n) => n));
      lines.push('');
    }
    if (oc.frameworks.length > 0) {
      lines.push('**Frameworks:** ' + connMdItems(oc.frameworks, (n) => n));
      lines.push('');
    }
    if (oc.linked_repos.length > 0) {
      lines.push(
        '**Linked Repositories:** ' + connMdItems(oc.linked_repos, (n) => n)
      );
      lines.push('');
    }
  } else if (audit.sources && audit.sources.length > 0) {
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
          s.history_available_days > 0 &&
          s.history_available_days < LIMITED_HISTORY_DAYS
            ? ` (limited history ~${s.history_available_days} days)`
            : '';
        const label = sourceFullLabel(s.source, audit.source_windows);
        lines.push(`- ${label}${limitedNote}`);
      }
      lines.push('');
    }
    if (missed.length > 0) {
      lines.push('**Missed / limited:**');
      lines.push('');
      for (const s of missed) {
        const reason = s.reason_if_absent ? ` — ${s.reason_if_absent}` : '';
        const label = sourceFullLabel(s.source, audit.source_windows);
        lines.push(`- ${label}${reason}`);
      }
      lines.push('');
    }
  }

  // Linked Repositories — always rendered so the reader can see it was checked.
  // Grouped by kind: Symlinks / Git submodules / MCP servers.
  lines.push('## Linked Repositories');
  lines.push('');
  const linked = audit.linked_repos ?? [];
  if (linked.length > 0) {
    const byKindMd: Record<string, LinkedRepo[]> = {};
    for (const r of linked) (byKindMd[r.kind] ??= []).push(r);
    const KIND_LABEL_MD: Record<string, string> = {
      symlink: 'Symlinks',
      submodule: 'Git submodules',
      mcp: 'MCP servers',
    };
    const pushBucket = (bucket: LinkedRepo[]): void => {
      for (const g of groupLinkedByName(bucket)) {
        lines.push(`- ${g.name} (via ${g.vias.join(', ')})`);
      }
      lines.push('');
    };
    for (const kind of ['symlink', 'submodule', 'mcp']) {
      const bucket = byKindMd[kind];
      if (!bucket || bucket.length === 0) continue;
      lines.push(`**${KIND_LABEL_MD[kind]}:**`);
      lines.push('');
      pushBucket(bucket);
    }
    for (const [kind, bucket] of Object.entries(byKindMd)) {
      if (['symlink', 'submodule', 'mcp'].includes(kind) || !bucket.length)
        continue;
      lines.push(`**${kind}:**`);
      lines.push('');
      pushBucket(bucket);
    }
  } else {
    lines.push('None detected.');
  }
  lines.push('');

  // Tech Stack
  if (audit.tech_stack) {
    const ts = audit.tech_stack;
    const hasAny =
      ts.languages.length > 0 ||
      ts.agent_tools.length > 0 ||
      ts.ci.length > 0 ||
      ts.frameworks.length > 0;
    if (hasAny) {
      lines.push('## Tech Stack');
      lines.push('');
      const mdItems = (items: TechItem[]) =>
        items.map((i) => `${i.name} — ${i.evidence}`).join(', ');
      if (ts.languages.length > 0) {
        lines.push('**Languages:** ' + mdItems(ts.languages));
        lines.push('');
      }
      if (ts.agent_tools.length > 0) {
        lines.push('**Agent Tools:** ' + mdItems(ts.agent_tools));
        lines.push('');
      }
      if (ts.ci.length > 0) {
        lines.push('**CI:** ' + mdItems(ts.ci));
        lines.push('');
      }
      if (ts.frameworks.length > 0) {
        lines.push('**Frameworks:** ' + mdItems(ts.frameworks));
        lines.push('');
      }
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

/**
 * Like tip(), but treats `metaHtml` as pre-built trusted HTML (not escaped).
 * The caller must escape any user-controlled values before passing them in.
 * Use only for structured HTML fragments like anchor links.
 */
function tipHtml(value: string, plain: string, metaHtml = ''): string {
  const metaSpan = metaHtml ? `<span class="tipmeta">${metaHtml}</span>` : '';
  return `<span class="tip" tabindex="0">${esc(value)}<span class="tipbox"><b>${esc(plain)}</b>${metaSpan}</span></span>`;
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    PASS: '#22c55e',
    WARN: '#eab308',
    PARTIAL: '#f59e0b',
    FAIL: '#ef4444',
    SKIP: '#9ca3af',
  };
  const bg = colors[status] ?? '#9ca3af';
  return `<span class="badge" style="background:${bg};color:#fff;padding:1px 6px;border-radius:3px;font-size:.75em;font-weight:600">${esc(status)}</span>`;
}

const STATUS_COLOR: Record<string, string> = {
  PASS: '#f0fdf4',
  WARN: '#fefce8',
  PARTIAL: '#fde68a',
  FAIL: '#fef2f2',
  SKIP: '#f9fafb',
};

const BAND_COLOR: Record<string, string> = {
  elite: '#16a34a',
  high: '#22c55e',
  medium: '#eab308',
  low: '#ef4444',
};

/**
 * Tooltip text for headline-band metrics that have no `check_id` to resolve a
 * definition from (git-derived rows and connector-gated rows). Keyed by the
 * metric label with any trailing "(...)" unit clause stripped.
 */
const HEADLINE_TIP: Record<string, string> = {
  Merges:
    'Merged pull requests per active contributor in the window — a delivery-throughput signal.',
  LOC: 'Lines of code changed per active contributor in the window — a delivery-volume signal.',
  'Cycle time':
    'Median in-progress→done duration for tickets, from the ticketing connector (Jira, Linear, GitHub Projects, …).',
  MTTR: 'Mean time to restore service after a production incident (needs an incident connector).',
  'AI tooling':
    'AI coding tools detected in the repository (config files, agent instructions, commit markers).',
  Contributors:
    'Distinct active authors in the measurement window and their cadence.',
  'Repos with AI tooling':
    'How many portfolio repositories have any AI tooling present.',
};

/** Returns true when a DeliveryMetric display_value is considered absent: missing, empty, em-dash, or hyphen. */
function deliveryValueAbsent(v: string | undefined): boolean {
  const t = (v ?? '').trim();
  return t === '' || t === '—' || t === '-';
}

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
 *   - All plain-language blocks optional; degrades to the capability headline
 */
export function renderHtml(audit: AuditJson): string {
  const isOrg =
    Array.isArray(audit.portfolio_metrics) &&
    audit.portfolio_metrics.length > 0;

  // ─── CSS ──────────────────────────────────────────────────────────────────
  const css = `
*{box-sizing:border-box;margin:0;padding:0}
ul{margin:.4em 0 .6em 1.4em}
li{margin:.2em 0}
summary{cursor:pointer}
details{margin-bottom:8px}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#1e293b;font-size:14px;line-height:1.5}
.container{max-width:980px;margin:0 auto;padding:24px}
h1{font-size:1.5rem;font-weight:700;margin-bottom:4px}
h2{font-size:1.15rem;font-weight:600;margin:24px 0 10px}
h3{font-size:.95rem;font-weight:600;margin:0 0 6px;color:#475569}
h4{font-size:.85rem;font-weight:600;margin:10px 0 4px;color:#64748b}
.src-cite{font-size:.75rem;color:#64748b}
.src-cite a{color:#6366f1}
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
tr[data-status='PARTIAL'] td{background:#fde68a}
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
/* issues-only filter: PARTIAL is a partial pass, not an issue — hidden with PASS */
body.issues-only tr[data-status='PASS'],body.issues-only tr[data-status='SKIP'],body.issues-only tr[data-status='PARTIAL']{display:none}
.toolbar{display:flex;gap:8px;align-items:center;margin-bottom:12px}
.toolbar button{padding:5px 12px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;font-size:.8rem}
.toolbar button.active{background:#4f46e5;color:#fff;border-color:#4f46e5}
.backlink{display:inline-block;margin-bottom:10px;font-size:.85rem}
.dim-nav{display:flex;gap:16px;font-size:.85rem;margin:8px 0}
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
        `<div class="cap-score">${tip(fmtPts(audit.audit_total) + ' pts', 'Total AI-SDLC capability — the sum of all capabilities the project has in place. It is uncapped and rises as the standard grows.', 'Σ awarded category weights across all dimensions · standards.toml')}</div>`
      );
      rows.push(
        `<div class="cap-cov">Coverage ${tip(pct(audit.coverage), "How much of today's expected capability is in place. Read it as 'we have X% of what the current standard asks for', not as a school grade.", 'score ÷ Σ applicable category weights · standards.toml')}</div>`
      );
    }

    // Headline blocks: delivery / scale / reach (single-repo and org)
    const h = audit.headline;
    const blocks: string[] = [];

    // Every headline metric gets a tooltip (parity with per-dimension rows).
    // Prefer the referenced check's definition; fall back to a static blurb.
    const checkById = new Map<string, Check>();
    for (const dim of audit.dimensions ?? []) {
      for (const c of dim.checks) checkById.set(c.check_id, c);
    }
    const headlineTipText = (label: string, checkId?: string): string => {
      if (checkId) {
        const c = checkById.get(checkId);
        if (c) return c.plain && c.plain.trim() ? c.plain : c.definition;
      }
      const key = label.replace(/\s*\(.*\)\s*$/, '').trim();
      return HEADLINE_TIP[key] ?? HEADLINE_TIP[label] ?? label;
    };

    if (h?.delivery && h.delivery.length > 0) {
      const items = h.delivery
        .map((d) => {
          const tipText = headlineTipText(d.label, d.check_id);
          if (d.gated && deliveryValueAbsent(d.display_value)) {
            const note =
              d.gated === 'tracker'
                ? '— (needs ticketing connector)'
                : '— (needs incident connector)';
            return `<div class="kv"><span class="k">${esc(d.label)}</span><span class="v">${tip(note, tipText)}</span></div>`;
          }
          const bandHtml = d.band
            ? `<span class="band" style="background:${BAND_COLOR[d.band.toLowerCase()] ?? '#94a3b8'}">${esc(d.band)}</span>`
            : '';
          return `<div class="kv"><span class="k">${esc(d.label)}</span><span class="v">${tip(d.display_value ?? '—', tipText)}${bandHtml}</span></div>`;
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
            `<div class="kv"><span class="k">${esc(s.label)}</span><span class="v">${tip(s.display_value, headlineTipText(s.label, s.check_id))}</span></div>`
        )
        .join('');
      blocks.push(
        `<div class="exec-col"><h3>Code scale &amp; complexity</h3>${items}</div>`
      );
    }
    const reachItems: string[] = [];
    if (h?.reach?.ai_tooling)
      reachItems.push(
        `<div class="kv"><span class="k">AI tooling</span><span class="v">${tip(h.reach.ai_tooling, HEADLINE_TIP['AI tooling'])}</span></div>`
      );
    if (h?.reach?.contributors)
      reachItems.push(
        `<div class="kv"><span class="k">Contributors</span><span class="v">${tip(h.reach.contributors, HEADLINE_TIP['Contributors'])}</span></div>`
      );
    if (isOrg && audit.per_repo && audit.per_repo.length > 0) {
      const withTooling = audit.per_repo.filter((r) => r.has_ai_tooling).length;
      reachItems.push(
        `<div class="kv"><span class="k">Repos with AI tooling</span><span class="v">${tip(`${withTooling} / ${audit.per_repo.length}`, HEADLINE_TIP['Repos with AI tooling'])}</span></div>`
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
      rows.push(`<details class="insight" style="border-left-color:${color}">
  <summary><span class="theme">${esc(ins.theme)}</span>${ins.weak_areas.length ? ` <span class="areas">Weak: ${esc(ins.weak_areas.join(', '))}</span>` : ''}</summary>
  <div class="so">${esc(ins.so_what)}</div>
  <div class="improves">→ ${esc(ins.improves)}</div>
</details>`);
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
      rows.push(`<details class="rec">
  <summary><span class="prio" style="background:${prioColor}">${esc(r.priority)}</span> <span class="rec-title">${esc(r.title)}</span> <span class="rec-where">${esc(r.dimension)} · ${esc(r.check_id)} · effort ${esc(r.effort)}</span></summary>
  ${r.detail ? `<div class="rec-detail">${esc(r.detail)}</div>` : ''}
</details>`);
    }
    return rows.join('\n');
  }

  // ─── Dimension summary table (overview; rows link to sub-pages) ─────────────
  function dimensionSummary(): string {
    const rows: string[] = ['<h2>Dimensions</h2>'];
    // Three-value metrics count (summed across all checks in all dimensions):
    //   scored    = checks with weight_awarded > 0 (contributed to score)
    //   executed  = checks with status !== 'SKIP' (actually ran)
    //   supported = all checks in the catalog for this repo
    let mScored = 0;
    let mExecuted = 0;
    let mSupported = 0;
    for (const dim of audit.dimensions) {
      for (const c of dim.checks) {
        mSupported++;
        if (c.status !== 'SKIP') mExecuted++;
        if (c.weight_awarded > 0 && c.status !== 'SKIP') mScored++;
      }
    }
    rows.push(
      `<p class="metrics-found">${tip(
        `Metrics: ${mScored} scored · ${mExecuted} executed · ${mSupported} supported`,
        'Three-level metric counts across all checks',
        'scored = weight_awarded > 0 · executed = status ≠ SKIP · supported = all checks in catalog'
      )}</p>`
    );
    rows.push(
      '<table><thead><tr><th>#</th><th>Dimension</th><th>Points</th><th>Sources</th><th>Coverage</th><th>Reliability</th><th>FAIL</th><th>WARN</th><th>PARTIAL</th><th>PASS</th><th>SKIP</th></tr></thead><tbody>'
    );
    let n = 1;
    for (const dim of audit.dimensions) {
      const counts = statusCounts(dim);
      const covPct = pct(dim.coverage);
      const lowCov = dim.coverage < 0.4 ? ' low-cov' : '';
      const anyMinimal = dim.checks.some(
        (c) => c.applies && c.reliability.tag === 'minimal'
      );
      const anyNotReliable = dim.checks.some(
        (c) => c.applies && c.reliability.tag === 'not-reliable'
      );
      const relStr = anyMinimal
        ? 'minimal *'
        : anyNotReliable
          ? 'not-reliable'
          : 'maximal';
      const relTip = anyMinimal
        ? 'Some numbers here are lower bounds — the true value may be higher.'
        : anyNotReliable
          ? 'Numbers here carry rough estimates; the true value may differ significantly.'
          : 'Numbers here are upper-bound reliable for what was reachable.';
      const key = dimKey(dim);
      const href = `#dim/${esc(key)}`;
      // Sources column: cell shows SHORT labels; tooltip adds full label + lookback window.
      const dimSourcesUsed = (dim.sources_used as string[] | undefined) ?? [];
      const sourcesCell = (() => {
        if (dimSourcesUsed.length === 0) return '—';
        const cellText = dimSourcesUsed
          .map((s) => shortSourceLabel(s, audit.source_windows))
          .join(', ');
        const tooltipDetail = dimSourcesUsed
          .map((s) => formatSourceWindow(s, audit.source_windows))
          .join(' · ');
        return tip(
          cellText,
          'Data sources feeding this dimension',
          tooltipDetail
        );
      })();
      rows.push(`<tr class="dim-row${lowCov}" onclick="location.hash='dim/${esc(key)}'">
  <td>${n++}</td>
  <td><a href="${href}"><strong>${esc(titleLabel(dim))}</strong></a></td>
  <td>${tip(fmtPts(dim.score) + ' pts', `Capability earned in this area: ${dim.score} points.`, `coverage ${covPct} · ${esc(dim.dimension)} · standards.toml`)}</td>
  <td>${sourcesCell}</td>
  <td>${tip(covPct, `Share of this area's expected capability that is in place.`, `score ÷ Σ applicable weights · ${esc(dim.dimension)}`)}</td>
  <td>${tip(relStr, relTip, '')}</td>
  <td>${counts.fail > 0 ? `<span style="color:#ef4444;font-weight:600">${counts.fail}</span>` : counts.fail}</td>
  <td>${counts.warn > 0 ? `<span style="color:#eab308;font-weight:600">${counts.warn}</span>` : counts.warn}</td>
  <td>${counts.partial > 0 ? `<span style="color:#d97706;font-weight:600">${counts.partial}</span>` : counts.partial}</td>
  <td>${counts.pass > 0 ? `<span style="color:#16a34a;font-weight:600">${counts.pass}</span>` : counts.pass}</td>
  <td>${counts.skip}</td>
</tr>`);
    }
    rows.push('</tbody></table>');
    return rows.join('\n');
  }

  // ─── One drill-down sub-page per dimension ─────────────────────────────────
  function dimensionPage(
    dim: DimensionArtifact,
    idx: number,
    all: DimensionArtifact[]
  ): string {
    const key = dimKey(dim);
    const counts = statusCounts(dim);
    const covPct = pct(dim.coverage);
    const rows: string[] = [];
    rows.push(`<section class="dim-page" id="page-${esc(key)}">`);
    rows.push('<a class="backlink" href="#">← Back to overview</a>');
    // Prev/next navigation between dimension pages.
    const prev = all[idx - 1];
    const next = all[idx + 1];
    const navParts: string[] = [];
    if (prev) {
      navParts.push(
        `<a href="#dim/${esc(dimKey(prev))}">← ${esc(titleLabel(prev))}</a>`
      );
    }
    if (next) {
      navParts.push(
        `<a href="#dim/${esc(dimKey(next))}">${esc(titleLabel(next))} →</a>`
      );
    }
    const navHtml =
      navParts.length > 0
        ? `<nav class="dim-nav">${navParts.join(' ')}</nav>`
        : '';
    if (navHtml) rows.push(navHtml);
    rows.push(`<h2>${esc(titleLabel(dim))}</h2>`);
    // Weight-weighted mean confidence of applicable checks.
    {
      let totalW = 0,
        weightedC = 0;
      for (const c of dim.checks) {
        if (c.status === 'SKIP' || !c.applies) continue;
        const w = c.weight_max ?? 0;
        totalW += w;
        weightedC += (c.confidence ?? 0) * w;
      }
      const meanConfStr =
        totalW > 0 ? `${Math.round((weightedC / totalW) * 100)}%` : '—';
      rows.push(
        `<div class="dim-head">${tip(fmtPts(dim.score) + ' pts', `Capability earned in this area: ${dim.score} points.`, 'Σ awarded weights · standards.toml')} · coverage ${tip(covPct, `Share of this area's expected capability that is in place.`, 'score ÷ Σ applicable weights')} · confidence ${tip(meanConfStr, 'Weight-averaged confidence: fraction of applicable surface measured for this dimension.', 'Σ(confidence × weight_max) ÷ Σ weight_max for applicable checks')} · FAIL ${counts.fail} · WARN ${counts.warn} · PARTIAL ${counts.partial} · PASS ${counts.pass} · SKIP ${counts.skip}</div>`
      );
    }

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
      '<table class="checks"><colgroup><col style="width:3%"><col style="width:22%"><col style="width:8%"><col style="width:7%"><col style="width:9%"><col style="width:8%"><col style="width:43%"></colgroup>'
    );
    rows.push(
      '<thead><tr><th>#</th><th>Check</th><th>Status</th><th>Points</th><th>Reliability</th><th>Confidence</th><th>Evidence</th></tr></thead><tbody>'
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
      // Build evidence items; append expression/value when present (moved from removed Value column).
      const evidenceItems: string[] =
        c.evidence.length > 0 ? c.evidence.map(esc) : [];
      if (c.expression) {
        evidenceItems.push(
          tip(
            esc(fmtValue(c.value)),
            c.expression,
            c.unit ? `unit: ${c.unit}` : ''
          )
        );
      } else if (c.value != null) {
        const numStr = `${fmtValue(c.value)}${c.unit ? ' ' + c.unit : ''}`;
        const escaped = esc(fmtValue(c.value));
        if (!evidenceItems.some((item) => item.includes(escaped))) {
          evidenceItems.push(esc(numStr));
        }
      }
      const evidence =
        evidenceItems.length > 0 ? evidenceItems.join('<br>') : '—';
      // Technical detail (code · source · method) folded into the Check tooltip.
      const codeStr = c.code && c.code.length > 0 ? c.code.join(', ') : '—';
      const checkMeta = `${esc(c.definition)} — source: ${esc(c.source || '—')} · method: ${esc(c.method)} · category ${esc(codeStr)}`;
      // Points cell: tooltip enriched with standards.toml-derived meta.
      // Renders source as a clickable link when source_url is available.
      let pointsMetaHtml: string;
      if (c.source) {
        const sourceText = esc(c.source);
        if (c.source_url && c.source_date) {
          const escapedUrl = esc(c.source_url);
          const escapedDate = esc(c.source_date);
          pointsMetaHtml = `${esc(c.definition)} · ${sourceText} <a href="${escapedUrl}" target="_blank" rel="noopener">${escapedDate}</a>`;
        } else if (c.source_date) {
          pointsMetaHtml = `${esc(c.definition)} · ${sourceText} · ${esc(c.source_date)}`;
        } else {
          pointsMetaHtml = `${esc(c.definition)} · ${sourceText}`;
        }
      } else {
        pointsMetaHtml = esc(c.definition);
      }
      const pointsCell = tipHtml(
        fmtPts(c.weight_awarded) + '/' + fmtPts(c.weight_max),
        `Worth up to ${c.weight_max} points · ${c.method}`,
        pointsMetaHtml
      );
      // Confidence cell: percent for applicable checks, dash for SKIP.
      const confCell =
        c.status === 'SKIP' ? '—' : `${Math.round((c.confidence ?? 0) * 100)}%`;
      // Visible per-metric source citation link (6c.4) — shown inline under the
      // Check name, where the reader looks for what defines/standardises a check.
      const sourceCiteHtml =
        c.source_url && c.source_date
          ? `<br><small class="src-cite"><a href="${esc(c.source_url)}" target="_blank" rel="noopener">${esc(c.source)} ${esc(c.source_date)}</a></small>`
          : c.source_url
            ? `<br><small class="src-cite"><a href="${esc(c.source_url)}" target="_blank" rel="noopener">${esc(c.source)}</a></small>`
            : '';
      rows.push(`<tr data-status="${esc(c.status)}" style="background:${rowBg}">
  <td>${ckn++}</td>
  <td class="check"><span class="tip" tabindex="0"><b>${esc(c.check_id)}</b><span class="tipbox"><b>${esc(plainLead(c))}</b><span class="tipmeta">${checkMeta}</span></span></span><span class="plain">${esc(plainLead(c))}</span>${sourceCiteHtml}</td>
  <td>${statusBadge(c.status)}</td>
  <td>${pointsCell}</td>
  <td class="${relClass}">${tip(relLabel, relTipPlain, c.reliability.note ?? '')}</td>
  <td>${confCell}</td>
  <td class="evidence">${evidence}</td>
</tr>`);
    }
    rows.push('</tbody></table>');
    if (hasMinimal) {
      rows.push(
        '<p style="font-size:.78rem;color:#64748b">* lower-bound measurement (reliability tag: minimal).</p>'
      );
    }
    if (navHtml) rows.push(navHtml);
    rows.push('</section>');
    return rows.join('\n');
  }

  // ─── Repositories & Connections (org mode + single-repo note) ──────────────
  // Task 5.3: delivery columns + links to per-repo reports
  function reposSection(): string {
    const rows: string[] = ['<h2>Repositories</h2>'];
    if (isOrg && audit.per_repo && audit.per_repo.length > 0) {
      rows.push(
        '<table><thead><tr>' +
          '<th>Repo</th>' +
          '<th>Points</th>' +
          '<th>Coverage</th>' +
          '<th>Merges/active</th>' +
          '<th>LOC/active</th>' +
          '<th>Deploy freq</th>' +
          '<th>Rework rate</th>' +
          '<th>Lead time</th>' +
          '<th>Change-fail</th>' +
          '<th>Cycle time¹</th>' +
          '<th>MTTR²</th>' +
          '</tr></thead><tbody>'
      );
      for (const r of audit.per_repo) {
        const coverage = r.coverage != null ? pct(r.coverage) : '—';
        rows.push(
          `<tr>` +
            `<td><a href="per-repo/${esc(r.repo)}/report.html">${esc(r.repo)}</a></td>` +
            `<td>${tip(fmtPts(r.awarded_weight), `Capability points earned by this repo: ${r.awarded_weight}.`, '')}</td>` +
            `<td>${coverage}</td>` +
            `<td>${fmtN1dp(r.merges_per_active)}</td>` +
            `<td>${fmtN1dp(r.loc_per_active)}</td>` +
            `<td>${fmtWk(r.deploy_freq)}</td>` +
            `<td>${fmtPctMul(r.rework_rate)}</td>` +
            `<td>${fmtH(r.lead_time)}</td>` +
            `<td>${fmtPctMul(r.change_fail)}</td>` +
            `<td>—</td>` +
            `<td>—</td>` +
            `</tr>`
        );
      }
      rows.push('</tbody></table>');
      rows.push(
        '<p class="footnote">¹ Cycle time (Jira In-Progress→Done) requires a ticketing connector.</p>'
      );
      rows.push(
        '<p class="footnote">² MTTR requires an incident connector.</p>'
      );
    } else {
      rows.push(
        `<p>Single-repo audit. Project: <strong>${esc(audit.project)}</strong>. ${audit.dimensions.length} dimension(s) evaluated.</p>`
      );
    }
    return rows.join('\n');
  }

  // ─── Connections & Sources section ─────────────────────────────────────────
  function connectionsSection(): string {
    const rows: string[] = ['<h2>Connections &amp; Sources</h2>'];

    // Org mode: render the aggregated count view.
    if (isOrg && audit.org_connections) {
      const oc = audit.org_connections;
      const connHtmlItems = (
        items: OrgConnItem[],
        labelFn: (n: string) => string
      ): string =>
        items.map((i) => `${esc(labelFn(i.name))} (${i.count})`).join(', ');

      if (oc.sources.length > 0) {
        rows.push(
          `<h3>Sources</h3><p>${connHtmlItems(oc.sources, (n) => sourceFullLabel(n, audit.source_windows))}</p>`
        );
      }
      if (oc.languages.length > 0) {
        rows.push(
          `<h3>Languages</h3><p>${connHtmlItems(oc.languages, (n) => n)}</p>`
        );
      }
      if (oc.agent_tools.length > 0) {
        rows.push(
          `<h3>Agent Tools</h3><p>${connHtmlItems(oc.agent_tools, (n) => n)}</p>`
        );
      }
      if (oc.ci.length > 0) {
        rows.push(`<h3>CI</h3><p>${connHtmlItems(oc.ci, (n) => n)}</p>`);
      }
      if (oc.frameworks.length > 0) {
        rows.push(
          `<h3>Frameworks</h3><p>${connHtmlItems(oc.frameworks, (n) => n)}</p>`
        );
      }
      if (oc.linked_repos.length > 0) {
        rows.push(
          `<h3>Linked Repositories</h3><p>${connHtmlItems(oc.linked_repos, (n) => n)}</p>`
        );
      }
      return rows.join('\n');
    }

    // Single-repo mode: connected / missed sub-blocks.
    if (audit.sources && audit.sources.length > 0) {
      const connected = audit.sources.filter((s) => s.available);
      const missed = audit.sources.filter((s) => !s.available);
      if (connected.length > 0) {
        rows.push('<h3>Connected</h3><ul>');
        for (const s of connected) {
          const limitedNote =
            s.history_available_days !== null &&
            s.history_available_days > 0 &&
            s.history_available_days < LIMITED_HISTORY_DAYS
              ? ` <em>(limited history ~${s.history_available_days} days)</em>`
              : '';
          const label = sourceFullLabel(s.source, audit.source_windows);
          rows.push(`<li>${esc(label)}${limitedNote}</li>`);
        }
        rows.push('</ul>');
      }
      if (missed.length > 0) {
        rows.push('<h3>Missed / limited</h3><ul>');
        for (const s of missed) {
          const reason = s.reason_if_absent
            ? ` — ${esc(s.reason_if_absent)}`
            : '';
          const label = sourceFullLabel(s.source, audit.source_windows);
          rows.push(`<li>${esc(label)}${reason}</li>`);
        }
        rows.push('</ul>');
      }
    }

    // Linked repositories — always rendered so the reader can see it was checked.
    // Grouped by kind: Symlinks / Git submodules / MCP servers.
    rows.push('<h3>Linked repositories</h3>');
    const linked = audit.linked_repos ?? [];
    if (linked.length > 0) {
      const byKind: Record<string, LinkedRepo[]> = {};
      for (const r of linked) {
        (byKind[r.kind] ??= []).push(r);
      }
      const KIND_LABEL: Record<string, string> = {
        symlink: 'Symlinks',
        submodule: 'Git submodules',
        mcp: 'MCP servers',
      };
      // One <li> per linked repo, with every `via` path that reaches it joined
      // — so all distinct links (e.g. three symlinks into one repo) are shown
      // together rather than collapsed to the first one.
      const renderBucket = (bucket: LinkedRepo[]): void => {
        rows.push('<ul>');
        for (const g of groupLinkedByName(bucket)) {
          const vias = g.vias.map((v) => esc(v)).join(', ');
          rows.push(`<li><b>${esc(g.name)}</b> <em>via ${vias}</em></li>`);
        }
        rows.push('</ul>');
      };
      for (const kind of ['symlink', 'submodule', 'mcp']) {
        const bucket = byKind[kind];
        if (!bucket || bucket.length === 0) continue;
        rows.push(`<h4>${KIND_LABEL[kind]}</h4>`);
        renderBucket(bucket);
      }
      // Render any unknown kinds (future-proof).
      for (const [kind, bucket] of Object.entries(byKind)) {
        if (['symlink', 'submodule', 'mcp'].includes(kind) || !bucket.length)
          continue;
        rows.push(`<h4>${esc(kind)}</h4>`);
        renderBucket(bucket);
      }
    } else {
      rows.push('<p><em>No linked repositories detected.</em></p>');
    }

    return rows.join('\n');
  }

  // ─── Tech Stack section ────────────────────────────────────────────────────
  function techStackSection(): string {
    const ts = audit.tech_stack;
    if (!ts) return '';
    const rows: string[] = ['<h2>Tech Stack</h2>'];

    function techItemsHtml(items: TechItem[]): string {
      return items.map((i) => tip(i.name, i.evidence, '')).join(', ');
    }

    function listGroup(label: string, items: TechItem[]): void {
      if (items.length === 0) return;
      rows.push(`<h3>${esc(label)}</h3><p>${techItemsHtml(items)}</p>`);
    }

    listGroup('Languages', ts.languages);
    listGroup('Agent tools', ts.agent_tools);
    listGroup('CI', ts.ci);
    listGroup('Frameworks', ts.frameworks);

    const conflicts = audit.detection_conflicts ?? [];
    if (conflicts.length > 0) {
      rows.push('<h3>Ambiguous detections</h3>');
      rows.push(
        '<p>The following files were matched by more than one language detector:</p>'
      );
      rows.push('<ul>');
      for (const c of conflicts) {
        rows.push(`<li>${esc(c.file)} → ${esc(c.claimedBy.join(', '))}</li>`);
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
    if(el){window.__ovScroll=window.scrollY;ov.style.display='none';el.style.display='block';window.scrollTo(0,0);return;}
  }
  ov.style.display='block';
  if(typeof window.__ovScroll==='number'){window.scrollTo(0,window.__ovScroll);}
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
  const dimPages = audit.dimensions
    .map((d, idx, all) => dimensionPage(d, idx, all))
    .join('\n');

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
  ${measurementWindowLabel(audit.source_windows, audit.date) ? `<span><strong>Measurement window:</strong> ${esc(measurementWindowLabel(audit.source_windows, audit.date)!)}</span>` : ''}
</div>

<div id="overview">
${execBand()}
${insightsSection()}
${recommendationsSection()}
${dimensionSummary()}
${reposSection()}
${connectionsSection()}
${techStackSection()}
</div>

${dimPages}

</div>
<script>${inlineJs}</script>
</body>
</html>`;
}
