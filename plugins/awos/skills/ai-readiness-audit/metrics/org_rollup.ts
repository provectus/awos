/**
 * org_rollup.ts — portfolio-level rollup from per-repo audit JSONs.
 *
 * Computes exactly three (≤3) portfolio metrics:
 *   (a) org_ai_tooling_coverage   — fraction of repos with any AI tooling,
 *       contributor-weighted when contributor counts are available.
 *   (b) org_capability_score      — Σ awarded category weights across repos,
 *       normalized by repo count.
 *   (c) org_measurement_coverage  — fraction of repos where at least one
 *       collector (git/ci/tracker/docs) returned available=true,
 *       contributor-weighted.
 *
 * Input: per-repo audit result objects (one per repo), each shaped like:
 *   {
 *     repo: string,
 *     contributors?: number,       // aggregate count, no PII
 *     awarded_weight?: number,     // Σ awarded category weights from this repo
 *     sources_reachable?: string[] // collector sources that returned available=true
 *     has_ai_tooling?: boolean,    // any AI tooling detected (codes 101–106 awarded)
 *   }
 *
 * Output:
 *   {
 *     portfolio_metrics: [PortfolioMetric, PortfolioMetric, PortfolioMetric],
 *     per_repo: PerRepoSummary[],
 *   }
 *
 * No money, no PII. Contributor counts are aggregate only.
 *
 * Beyond the three portfolio cards the rollup also emits an org **headline**
 * (Task 5.2): the per-metric MEAN of each delivery number across repos,
 * re-banded by applying the same TS band functions the single-repo headline
 * uses. This mirrors the single-repo executive band, averaged, so the org
 * report's top matrix reads like a per-repo one. The enriched `per_repo[]`
 * rows carry every delivery column so the org report's per-repo table
 * (Task 5.3) can render a full row per repo.
 */

import { doraDeployBand } from './adp_g3_deploy_frequency.ts';
import { doraLeadTimeBand } from './adp_g4_lead_time.ts';
import { doraChangeFailBand } from './adp_g7_change_fail_rate.ts';
import { reworkBand } from './adp_g14_rework_rate.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-repo delivery numbers, transcribed from the repo's audit + git artifact.
 * Only the four git-sourced DORA metrics live here. Cycle-time (Jira
 * In-Progress→Done) and MTTR (real incident recovery) are connector-gated and
 * never deterministically computed, so they are not carried in the rollup.
 */
export interface PerRepoDelivery {
  /** git.json raw.window_stats.merges_per_active. */
  merges_per_active?: number | null;
  /** git.json raw.window_stats.loc_per_active. */
  loc_per_active?: number | null;
  /** ADP-08 deployment/merge frequency (merges per week). */
  deploy_freq?: number | null;
  /** ADP-24 rework rate (0–1 fraction). */
  rework_rate?: number | null;
  /** ADP-09 lead time for change (hours). */
  lead_time?: number | null;
  /** ADP-12 change-failure rate (0–1 fraction). */
  change_fail?: number | null;
}

export interface PerRepoInput {
  /** Repository identifier (path or name). */
  repo: string;
  /** Aggregate active-contributor count for this repo. Omit when unknown. */
  contributors?: number;
  /** Sum of awarded category weights from this repo's audit. */
  awarded_weight?: number;
  /** Collector sources that returned available=true for this repo. */
  sources_reachable?: string[];
  /** True when any AI tooling category (codes 101–106) was awarded. */
  has_ai_tooling?: boolean;
  /** Weighted audit total for this repo (Σ awarded weights). */
  audit_total?: number;
  /** Coverage ratio (awarded ÷ applicable) for this repo, 0–1. */
  coverage?: number;
  /** Rich delivery numbers for the org headline + per-repo table. */
  delivery?: PerRepoDelivery;
  /**
   * Tech-stack items detected for this repo (four categories).
   * Only `name` is used for aggregation; `evidence` is not carried through.
   */
  tech_stack?: {
    languages: Array<{ name: string }>;
    agent_tools: Array<{ name: string }>;
    ci: Array<{ name: string }>;
    frameworks: Array<{ name: string }>;
  };
  /**
   * Linked repos detected for this repo (symlinks / submodules / MCP servers).
   * Only `name` is used for cross-repo counting; a repo linking the same name via
   * multiple paths counts once per repo.
   */
  linked_repos?: Array<{ name: string; via?: string; kind?: string }>;
}

// ---------------------------------------------------------------------------
// Org connections types (Task 5.4)
// ---------------------------------------------------------------------------

/** One aggregated item in the org Connections view: a name and the number of repos that have it. */
export interface OrgConnItem {
  name: string;
  /** Number of repos in which this item is present (deduplicated per repo). */
  count: number;
}

/**
 * Cross-repo aggregation of connections and stack items.
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

export interface PortfolioMetric {
  metric: string;
  value: number;
  description: string;
  /** Fraction 0–1: value is contributor-weighted (true) or equal-weighted (false). */
  contributor_weighted: boolean;
  repos_counted: number;
}

/**
 * One org-headline delivery row: the per-metric mean across repos, re-banded.
 * Shape matches the renderer's DeliveryMetric ({label, display_value, band?,
 * check_id?}); org_rollup does NOT import render.ts (layering). `repos_counted`
 * notes how many repos contributed a value to the mean (coverage).
 */
export interface OrgDeliveryMetric {
  label: string;
  display_value: string;
  band?: string;
  check_id?: string;
  repos_counted?: number;
}

export interface OrgRollupResult {
  /** Exactly ≤3 portfolio-level metrics. */
  portfolio_metrics: PortfolioMetric[];
  /**
   * Org executive band: the delivery matrix averaged across repos and
   * re-banded. Omitted when no repo supplies any delivery data.
   */
  headline?: { delivery: OrgDeliveryMetric[] };
  /** Per-repo summary rows (input echoed with computed fields). */
  per_repo: PerRepoSummary[];
  /**
   * Cross-repo aggregation of connections and stack items (Task 5.4).
   * Each list is sorted by count desc, then name asc.
   */
  org_connections?: OrgConnections;
}

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
  /** Delivery numbers, flattened for the per-repo table (Task 5.3). */
  merges_per_active: number | null;
  loc_per_active: number | null;
  deploy_freq: number | null;
  rework_rate: number | null;
  lead_time: number | null;
  change_fail: number | null;
}

// ---------------------------------------------------------------------------
// Org headline (average matrix) spec
// ---------------------------------------------------------------------------

/**
 * The 6 deterministic delivery rows of the org headline, in the same order as
 * the single-repo headline (SKILL.md). Row 1 (capability Points + Coverage)
 * stays the `org_capability_score` portfolio card — it is NOT duplicated here.
 * Cycle-time and MTTR are connector-gated (tracker / incident) and never
 * deterministically computed, so the deterministic org headline omits them.
 *
 * `key`    — field on PerRepoDelivery to average.
 * `band`   — re-band function applied to the MEAN (omit for un-banded rows).
 * `format` — turns the MEAN into a display string.
 */
interface DeliverySpec {
  key: keyof PerRepoDelivery;
  label: string;
  check_id?: string;
  band?: (v: number) => string;
  format: (v: number) => string;
}

const DELIVERY_SPECS: DeliverySpec[] = [
  {
    key: 'merges_per_active',
    label: 'Merges / active contributor',
    format: (v) => `${round1(v)} / contributor`,
  },
  {
    key: 'loc_per_active',
    label: 'LOC / active contributor',
    format: (v) => `${round1(v)} / contributor`,
  },
  {
    key: 'deploy_freq',
    label: 'Deployment frequency',
    check_id: 'ADP-08',
    band: doraDeployBand,
    format: (v) => `${round1(v)} / wk`,
  },
  {
    key: 'rework_rate',
    label: 'Rework rate (DORA)',
    check_id: 'ADP-24',
    band: reworkBand,
    format: (v) => `${round1(v * 100)}%`,
  },
  {
    key: 'lead_time',
    label: 'Lead time for change',
    check_id: 'ADP-09',
    band: doraLeadTimeBand,
    format: (v) => `${round1(v)} h`,
  },
  {
    key: 'change_fail',
    label: 'Change-failure rate',
    check_id: 'ADP-12',
    band: doraChangeFailBand,
    format: (v) => `${round1(v * 100)}%`,
  },
];

/**
 * Build the org headline: per-metric mean across repos, re-banded.
 * A metric present in only some repos is averaged over just those repos
 * (its `repos_counted` notes the coverage); a metric absent in ALL repos is
 * omitted. Returns undefined when no delivery row has any data.
 */
function buildHeadline(
  repos: PerRepoSummary[]
): { delivery: OrgDeliveryMetric[] } | undefined {
  const rows: OrgDeliveryMetric[] = [];
  for (const spec of DELIVERY_SPECS) {
    const present = repos
      .map((r) => r[spec.key] as number | null)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (present.length === 0) continue; // absent in all repos → omit
    const mean = present.reduce((s, v) => s + v, 0) / present.length;
    const row: OrgDeliveryMetric = {
      label: spec.label,
      display_value: spec.format(mean),
      repos_counted: present.length,
    };
    if (spec.band) row.band = spec.band(mean);
    if (spec.check_id) row.check_id = spec.check_id;
    rows.push(row);
  }
  return rows.length > 0 ? { delivery: rows } : undefined;
}

// ---------------------------------------------------------------------------
// Org connections aggregation (Task 5.4)
// ---------------------------------------------------------------------------

/**
 * Build a sorted OrgConnItem list from a count map.
 * Sort order: count desc, then name asc for stable deterministic output.
 */
function sortedConnItems(counts: Map<string, number>): OrgConnItem[] {
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Aggregate cross-repo connections from per-repo inputs.
 *
 * Sources: uses `sources_reachable` (the available source keys per repo).
 * Tech-stack categories and linked_repos: uses the optional `tech_stack` /
 * `linked_repos` fields added in Task 5.4 (absent repos contribute nothing).
 * All deduplication is per-repo: an item that appears twice in one repo's
 * list (e.g. same linked-repo name via two paths) is counted once for that
 * repo.
 */
function aggregateConnections(perRepoResults: PerRepoInput[]): OrgConnections {
  const srcCounts = new Map<string, number>();
  const langCounts = new Map<string, number>();
  const fwCounts = new Map<string, number>();
  const toolCounts = new Map<string, number>();
  const ciCounts = new Map<string, number>();
  const linkedCounts = new Map<string, number>();

  for (const repo of perRepoResults) {
    // Sources: dedupe within this repo before counting.
    const seenSrc = new Set(repo.sources_reachable ?? []);
    for (const src of seenSrc) {
      srcCounts.set(src, (srcCounts.get(src) ?? 0) + 1);
    }

    // Tech-stack categories: dedupe by name within this repo.
    if (repo.tech_stack) {
      for (const item of dedupeByName(repo.tech_stack.languages)) {
        langCounts.set(item, (langCounts.get(item) ?? 0) + 1);
      }
      for (const item of dedupeByName(repo.tech_stack.frameworks)) {
        fwCounts.set(item, (fwCounts.get(item) ?? 0) + 1);
      }
      for (const item of dedupeByName(repo.tech_stack.agent_tools)) {
        toolCounts.set(item, (toolCounts.get(item) ?? 0) + 1);
      }
      for (const item of dedupeByName(repo.tech_stack.ci)) {
        ciCounts.set(item, (ciCounts.get(item) ?? 0) + 1);
      }
    }

    // Linked repos: dedupe by name within this repo.
    if (repo.linked_repos) {
      const seenLinked = new Set(repo.linked_repos.map((r) => r.name));
      for (const name of seenLinked) {
        linkedCounts.set(name, (linkedCounts.get(name) ?? 0) + 1);
      }
    }
  }

  return {
    sources: sortedConnItems(srcCounts),
    languages: sortedConnItems(langCounts),
    frameworks: sortedConnItems(fwCounts),
    agent_tools: sortedConnItems(toolCounts),
    ci: sortedConnItems(ciCounts),
    linked_repos: sortedConnItems(linkedCounts),
  };
}

/** Return the unique names from an array of {name, ...} items. */
function dedupeByName(items: Array<{ name: string }>): string[] {
  return Array.from(new Set(items.map((i) => i.name)));
}

// ---------------------------------------------------------------------------
// Rollup implementation
// ---------------------------------------------------------------------------

/**
 * Compute the three portfolio metrics from an array of per-repo inputs.
 *
 * Rules:
 * - Contributor-weighted means each repo's value is multiplied by its
 *   contributor count; repos with no contributor count are treated as weight 1.
 * - "has_ai_tooling" is true when at least one AI tooling category was awarded
 *   (i.e. the awarded_weight for that repo includes any code 101–106).
 *   When the caller supplies has_ai_tooling directly, that value is used.
 * - The rollup NEVER exposes per-person data — only aggregate counts.
 */
export function rollup(
  perRepoResults: PerRepoInput[],
  // Standards is accepted but currently unused; reserved for future
  // standards-aware normalization (e.g. read max possible weight per repo).
  _standards?: Record<string, unknown>
): OrgRollupResult {
  if (perRepoResults.length === 0) {
    return {
      portfolio_metrics: [
        makeMetric('org_ai_tooling_coverage', 0, false, 0),
        makeMetric('org_capability_score', 0, false, 0),
        makeMetric('org_measurement_coverage', 0, false, 0),
      ],
      per_repo: [],
      org_connections: {
        sources: [],
        languages: [],
        frameworks: [],
        agent_tools: [],
        ci: [],
        linked_repos: [],
      },
    };
  }

  // Normalize inputs.
  const repos: PerRepoSummary[] = perRepoResults.map((r) => {
    const d = r.delivery ?? {};
    return {
      repo: r.repo,
      contributors: r.contributors ?? null,
      awarded_weight: r.awarded_weight ?? 0,
      sources_reachable: r.sources_reachable ?? [],
      has_ai_tooling: r.has_ai_tooling ?? false,
      audit_total: r.audit_total ?? null,
      coverage: r.coverage ?? null,
      merges_per_active: d.merges_per_active ?? null,
      loc_per_active: d.loc_per_active ?? null,
      deploy_freq: d.deploy_freq ?? null,
      rework_rate: d.rework_rate ?? null,
      lead_time: d.lead_time ?? null,
      change_fail: d.change_fail ?? null,
    };
  });

  // Determine whether contributor weighting is available (all repos have
  // a non-zero contributor count).
  const allHaveContributors = repos.every(
    (r) => r.contributors !== null && r.contributors > 0
  );

  // Helper: contributor weight for a repo (1 when unavailable).
  const weight = (r: PerRepoSummary): number =>
    allHaveContributors && r.contributors !== null ? r.contributors : 1;

  const totalWeight = repos.reduce((s, r) => s + weight(r), 0);

  // -------------------------------------------------------------------------
  // Metric (a): portfolio AI-tooling coverage
  // Fraction of repos (contributor-weighted) with any AI tooling present.
  // -------------------------------------------------------------------------
  const toolingNumerator = repos
    .filter((r) => r.has_ai_tooling)
    .reduce((s, r) => s + weight(r), 0);
  const toolingCoverage = totalWeight > 0 ? toolingNumerator / totalWeight : 0;

  // -------------------------------------------------------------------------
  // Metric (b): portfolio capability score
  // Σ awarded_weight across repos, normalized by repo count so it is
  // independent of portfolio size and comparable across portfolios.
  // -------------------------------------------------------------------------
  const totalAwarded = repos.reduce((s, r) => s + r.awarded_weight, 0);
  const capabilityScore = repos.length > 0 ? totalAwarded / repos.length : 0;

  // -------------------------------------------------------------------------
  // Metric (c): portfolio measurement coverage
  // Fraction of repos (contributor-weighted) where ≥1 collector reached.
  // -------------------------------------------------------------------------
  const measuredNumerator = repos
    .filter((r) => r.sources_reachable.length > 0)
    .reduce((s, r) => s + weight(r), 0);
  const measurementCoverage =
    totalWeight > 0 ? measuredNumerator / totalWeight : 0;

  const portfolio_metrics: PortfolioMetric[] = [
    {
      metric: 'org_ai_tooling_coverage',
      value: round4(toolingCoverage),
      description:
        'Fraction of portfolio repos with any AI tooling present' +
        (allHaveContributors ? ' (contributor-weighted)' : ' (equal-weighted)'),
      contributor_weighted: allHaveContributors,
      repos_counted: repos.length,
    },
    {
      metric: 'org_capability_score',
      value: round4(capabilityScore),
      description:
        'Average awarded category-weight score across portfolio repos',
      contributor_weighted: false,
      repos_counted: repos.length,
    },
    {
      metric: 'org_measurement_coverage',
      value: round4(measurementCoverage),
      description:
        'Fraction of portfolio repos with ≥1 reachable data-source collector' +
        (allHaveContributors ? ' (contributor-weighted)' : ' (equal-weighted)'),
      contributor_weighted: allHaveContributors,
      repos_counted: repos.length,
    },
  ];

  const headline = buildHeadline(repos);
  const org_connections = aggregateConnections(perRepoResults);
  const result: OrgRollupResult = {
    portfolio_metrics,
    per_repo: repos,
    org_connections,
  };
  if (headline) result.headline = headline;
  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Round to 1 decimal place (drops a trailing ".0" via Number coercion). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function makeMetric(
  metric: string,
  value: number,
  contributor_weighted: boolean,
  repos_counted: number
): PortfolioMetric {
  const descriptions: Record<string, string> = {
    org_ai_tooling_coverage:
      'Fraction of portfolio repos with any AI tooling present',
    org_capability_score:
      'Average awarded category-weight score across portfolio repos',
    org_measurement_coverage:
      'Fraction of portfolio repos with ≥1 reachable data-source collector',
  };
  return {
    metric,
    value,
    description: descriptions[metric] ?? metric,
    contributor_weighted,
    repos_counted,
  };
}
