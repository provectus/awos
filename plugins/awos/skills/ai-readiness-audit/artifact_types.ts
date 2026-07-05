/**
 * artifact_types.ts — the shared type spine for the JSON artifacts the engine
 * writes and consumes.
 *
 * audit_core.ts is the WRITER: what it emits is the source of truth for these
 * shapes. render.ts, cli.ts and metrics/org_rollup.ts are READERS and must
 * consume exactly what the writer emits — one declaration here instead of a
 * per-file copy that drifts. Consumers use `import type` (esbuild erases it —
 * zero bundle cost); the one value export (SOURCE_LABEL_DEFAULTS) is shared by
 * writer and renderer so source labels can't drift either.
 *
 * This module must stay leaf-level: no value imports from other engine files
 * (only erased `import type`), so any layer can import it without cycles.
 */

// LinkedRepo is declared once in topology.ts (the detector that produces it);
// re-exported here so artifact consumers get the whole spine from one module.
import type { LinkedRepo } from './topology.ts';
export type { LinkedRepo };

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

/**
 * Every status audit_core can emit:
 *   PASS/WARN/PARTIAL/FAIL — evaluated verdicts
 *   SKIP                   — not evaluated (source/precondition unavailable)
 *   INFO                   — weight-0 informational descriptor, not a verdict
 *   PENDING_JUDGMENT       — judgment check awaiting the orchestrator's patch
 */
export type CheckStatus =
  | 'PASS'
  | 'WARN'
  | 'PARTIAL'
  | 'FAIL'
  | 'SKIP'
  | 'INFO'
  | 'PENDING_JUDGMENT';

/** Canonical reliability vocabulary (see scoring.md). */
export type ReliabilityTag = 'maximal' | 'minimal' | 'not-reliable';
export type ReliabilityConfidence = 'HIGH' | 'MED' | 'LOW';

export interface CheckReliability {
  /**
   * Canonically a ReliabilityTag; standards.toml `reliability_default` may
   * carry other strings (e.g. "unknown"), so the type stays open.
   */
  tag: ReliabilityTag | (string & {});
  confidence: ReliabilityConfidence | (string & {});
  note: string | null;
}

export interface Check {
  check_id: string;
  code: number[];
  method: string;
  status: CheckStatus;
  /** Metric/detector value — number, string, or a structured object (fmtValue handles all). */
  value: unknown;
  evidence: string[];
  weight_awarded: number;
  weight_max: number;
  applies: boolean;
  reliability: CheckReliability;
  source: string;
  definition: string;
  /** "definition · derivation · reliability (conf) · source (year) · method" */
  hint: string;
  // Fields audit_core always writes today, optional here so the renderer
  // tolerates older/hand-patched artifacts; WrittenCheck requires them.
  /** One-sentence plain-language lead (summary from standards.toml, else definition). */
  plain?: string;
  /** Fraction of capability present: ∈ [0,1]. */
  score?: number;
  /** Fraction of applicable surface measured: ∈ [0,1]. */
  confidence?: number;
  unit?: string;
  expression?: string;
  source_date?: string | null;
  source_url?: string | null;
  /** Date this check's definition was last verified against its cited source. */
  last_verified?: string | null;
  /** Data sources that fed this check (from standards.toml `sources = [...]`). */
  sources?: string[];
}

/** The Check exactly as audit_core WRITES it — every enrichment field present. */
export type WrittenCheck = Check &
  Required<
    Pick<
      Check,
      | 'plain'
      | 'score'
      | 'confidence'
      | 'source_date'
      | 'source_url'
      | 'last_verified'
      | 'sources'
    >
  >;

// ---------------------------------------------------------------------------
// Dimension artifact
// ---------------------------------------------------------------------------

export interface DimensionArtifact {
  dimension: string;
  date: string;
  /** Presentation-order index stamped by audit-core (standards.toml [meta].dimension_order). */
  order?: number;
  /** Display title from the dimension .md frontmatter (fallback: labelize(dimension)). */
  title?: string;
  /** One-line summary from the dimension .md frontmatter — the dimension tooltip. */
  description?: string;
  score: number;
  /** 0–1 ratio; null when nothing is applicable ("no measurable surface" ≠ "0% covered"). */
  coverage: number | null;
  checks: Check[];
  /** Union of data sources across applicable checks (audit_core / aggregate stamp it). */
  sources_used?: string[];
  /** Provenance stamp written only by audit-core — see EngineProvenance. */
  engine?: EngineProvenance;
}

/**
 * Provenance stamp written only by the deterministic engine (audit-core /
 * enrich). Downstream verbs (patch-judgment, render, rollup) refuse an
 * audit.json without it — the circuit-breaker against an orchestrator
 * hand-assembling scores instead of running the engine.
 */
export interface EngineProvenance {
  generated_by: 'audit-core';
}

/**
 * Connector-gated headline rows (Cycle time, MTTR) computed by the ENGINE
 * from the tracker artifact — never authored by the orchestrator. Derived at
 * audit-core/enrich/aggregate time so the headline row and the Connections &
 * Sources section can never disagree (both read the same artifact).
 */
export interface DerivedDelivery {
  cycle_time: {
    /** Median In-Progress→Done, e.g. "3.2 d". Absent when not computable. */
    display_value?: string;
    median_days?: number;
    tickets_used?: number;
    /** Honest state when the row stays empty (e.g. "Jira connected — per-ticket status history not fetched"). */
    note?: string;
  };
  mttr: {
    note?: string;
  };
}

/**
 * What the orchestrator actually probed for a data source before declaring it
 * unreachable (mcp.json files, CLIs, auth state). Rendered into the
 * "Missed / limited" list so the reader sees WHY a source is absent —
 * e.g. ".mcp.json has no tracker server; acli not installed".
 */
export interface SourceProbe {
  source: string;
  searched: string[];
  outcome?: string;
}

// ---------------------------------------------------------------------------
// Report blocks (orchestrator-authored; all optional on AuditJson)
// ---------------------------------------------------------------------------

export interface DeliveryMetric {
  label: string;
  display_value?: string;
  band?: string;
  reliability?: string;
  check_id?: string;
  /** When set, the metric requires an external connector. If display_value is absent the renderer shows a "needs X connector" note instead of a value. */
  gated?: 'tracker' | 'incident';
  /**
   * Precise reason for a gated-absent row (e.g. "Jira connected — tickets lack
   * status-transition history"). When set, the renderer prints "— (<note>)"
   * instead of the generic "needs X connector" default.
   */
  note?: string;
}

export interface ScaleMetric {
  label: string;
  display_value: string;
  check_id?: string;
}

export interface Headline {
  delivery?: DeliveryMetric[];
  scale?: ScaleMetric[];
  reach?: {
    ai_tooling?: string;
    contributors?: string;
    spec_coverage?: string;
  };
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

// ---------------------------------------------------------------------------
// Org-mode blocks (written by metrics/org_rollup.ts)
// ---------------------------------------------------------------------------

export interface PortfolioMetric {
  metric: string;
  value: number;
  description: string;
  /** Value is contributor-weighted (true) or equal-weighted (false). */
  contributor_weighted: boolean;
  repos_counted: number;
}

/** One per-repo row of the org Repositories table (org_rollup writer truth). */
export interface PerRepoSummary {
  repo: string;
  contributors: number | null;
  awarded_weight: number;
  sources_reachable: string[];
  has_ai_tooling: boolean;
  /** Weighted audit total for this repo. */
  audit_total: number | null;
  /** Coverage ratio for this repo, 0–1. */
  coverage: number | null;
  /** Delivery numbers, flattened for the per-repo table. */
  merges_per_active: number | null;
  loc_per_active: number | null;
  deploy_freq: number | null;
  rework_rate: number | null;
  lead_time: number | null;
  change_fail: number | null;
  /** Connector-gated display values (e.g. "3.2 d") for the per-repo table; null when gated/absent. */
  cycle_time: string | null;
  mttr: string | null;
}

/** One item in the org Connections aggregated view: name + number of repos that have it (deduplicated per repo). */
export interface OrgConnItem {
  name: string;
  count: number;
}

/**
 * Cross-repo aggregation of connections and stack items, produced by
 * org_rollup and stored in org-portfolio.json for the renderer.
 * Each list is sorted by count desc, then name asc, for deterministic output.
 */
export interface OrgConnections {
  /** Source keys (e.g. "git", "tracker") → count of repos where that source is available. */
  sources: OrgConnItem[];
  languages: OrgConnItem[];
  frameworks: OrgConnItem[];
  agent_tools: OrgConnItem[];
  ci: OrgConnItem[];
  /** Linked-repo names → count of repos that link each one. */
  linked_repos: OrgConnItem[];
}

// ---------------------------------------------------------------------------
// Provenance / metadata blocks (engine-stamped)
// ---------------------------------------------------------------------------

export interface SourceSummary {
  source: string;
  available: boolean;
  reason_if_absent: string | null;
  history_available_days: number | null;
  /** Optional provenance detail shown next to the source in the report's
   * Connections & Sources section (e.g. which trunk ref the git walks used). */
  note?: string | null;
}

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

// ---------------------------------------------------------------------------
// Aggregated audit.json
// ---------------------------------------------------------------------------

export interface AuditJson {
  date: string;
  project: string;
  /** Σ awarded weights across all dimensions. */
  audit_total: number;
  /** 0–1 ratio; null when nothing is applicable. */
  coverage: number | null;
  /**
   * Per-dimension scoring detail. Always present on a single-repo audit
   * (audit-core writes it); absent on an org portfolio JSON — org rollup
   * emits none, per-repo dimensions live in the per-repo reports, and the
   * renderer ignores any that are injected (a concatenation across repos
   * would render duplicate rows).
   */
  dimensions?: DimensionArtifact[];
  // plain-language blocks (orchestrator-authored; optional)
  headline?: Headline;
  insights?: Insight[];
  recommendations?: Recommendation[];
  // org-mode fields (optional)
  portfolio_metrics?: PortfolioMetric[];
  per_repo?: PerRepoSummary[];
  org_connections?: OrgConnections;
  // collector availability
  sources?: SourceSummary[];
  // per-source lookback window (populated by audit_core from collected/ artifacts)
  source_windows?: Record<string, { days: number | null; label: string }>;
  /** Standards provenance stamped by audit-core: last-verified date + tunables. */
  standards_meta?: {
    standards_date?: string;
    active_contributor_threshold?: number;
  };
  // linked repos + tech-stack metadata (optional; populated by audit_core)
  linked_repos?: LinkedRepo[];
  tech_stack?: TechStack;
  detection_conflicts?: DetectionConflict[];
  /** Engine-computed connector-gated headline rows — see DerivedDelivery. */
  derived_delivery?: DerivedDelivery;
  /** Orchestrator probe log per unreachable source — see SourceProbe. */
  source_probes?: SourceProbe[];
  /** Provenance stamp written only by audit-core — see EngineProvenance. */
  engine?: EngineProvenance;
}

// ---------------------------------------------------------------------------
// Shared values
// ---------------------------------------------------------------------------

/**
 * Fallback human label for each source key — used by audit_core when a
 * collector artifact carries no source_label, and by the renderer when
 * source_windows is absent, so the two can never disagree.
 */
/**
 * The collector sources, in canonical order. Shared by audit_core (which
 * derives `sources`/`source_windows` from them) and render (which orders the
 * connections section by them). `code_host` is orchestrator-fetched (merged-PR
 * history via gh/glab or a code-host MCP), like `ci`/`tracker`/`docs`.
 */
export const COLLECTOR_SOURCES = [
  'git',
  'ci',
  'tracker',
  'docs',
  'code_host',
] as const;

export const SOURCE_LABEL_DEFAULTS: Record<string, string> = {
  git: 'git history',
  ci: 'CI runs',
  tracker: 'issue tracker',
  docs: 'docs/wiki',
  code_host: 'code host PRs',
  scale: 'source code (AST)',
  audit: 'source code',
  incident: 'incident source',
  'org-rollup': 'portfolio',
};
