/**
 * org_rollup.ts — portfolio-level rollup from per-repo audit JSONs.
 *
 * Computes exactly three (≤3) portfolio metrics:
 *   (a) org_ai_tooling_coverage   — fraction of repos with any AI tooling,
 *       contributor-weighted when contributor counts are available.
 *   (b) org_capability_score      — Σ awarded category weights across repos,
 *       normalized by repo count.
 *   (c) org_measurement_coverage  — "Standards coverage": contributor-weighted
 *       mean of the per-repo coverage ratios (awarded ÷ applicable weight).
 *       Not "any collector reachable" — git always is.
 *
 *   All three cards share ONE weighting: by active contributors per repo,
 *   falling back to equal weights when any repo lacks a contributor count.
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

import { doraDeployBand } from './merge_frequency.ts';
import { doraLeadTimeBand } from './lead_time_for_change.ts';
import { doraChangeFailBand } from './change_failure_rate.ts';
import { reworkBand } from './rework_rate.ts';

// ---------------------------------------------------------------------------
// Types — the output shapes shared with the renderer live in artifact_types.ts
// (one declaration, no drift); re-exported here for existing consumers.
// ---------------------------------------------------------------------------

import type {
  OrgConnItem,
  OrgConnections,
  OrgPreventionGap,
  PerRepoSummary,
  PortfolioMetric,
  PreventionTier,
} from '../artifact_types.ts';

export type {
  OrgConnItem,
  OrgConnections,
  OrgPreventionGap,
  PerRepoSummary,
  PortfolioMetric,
};

/**
 * Per-repo delivery numbers, transcribed from the repo's audit + git artifact.
 * The four git-sourced DORA metrics are numeric and feed the averaged org
 * headline. Cycle-time (In-Progress→Done) and MTTR (real incident recovery)
 * are connector-gated: they are carried per repo as the DISPLAY STRING the
 * per-repo audit's headline authored (e.g. "3.2 d"), null when the connector
 * was absent — they populate the org Repositories table but are never
 * averaged into the org headline.
 */
export interface PerRepoDelivery {
  /** git.json raw.window_stats.merges_per_active. */
  merges_per_active?: number | null;
  /** git.json raw.window_stats.loc_per_active. */
  loc_per_active?: number | null;
  /** DF-01 deployment/merge frequency (merges per week). */
  deploy_freq?: number | null;
  /** DF-06 rework rate (0–1 fraction). */
  rework_rate?: number | null;
  /** DF-02 lead time for change (hours). */
  lead_time?: number | null;
  /** DF-04 change-failure rate (0–1 fraction). */
  change_fail?: number | null;
  /** Tracker-gated cycle time display value (headline row, e.g. "3.2 d"); null when gated/absent. */
  cycle_time?: string | null;
  /** Incident-gated MTTR display value (headline row); null when gated/absent. */
  mttr?: string | null;
}

/** The numeric (averageable) PerRepoDelivery keys — the org headline spec is restricted to these. */
export type NumericDeliveryKey =
  | 'merges_per_active'
  | 'loc_per_active'
  | 'deploy_freq'
  | 'rework_rate'
  | 'lead_time'
  | 'change_fail';

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
  /** Per-source lookback windows from this repo's audit.json (passthrough). */
  source_windows?: Record<string, { days: number | null; label: string }>;
  /** Standards provenance from this repo's audit.json (passthrough). */
  standards_meta?: Record<string, unknown>;
  /** Rich delivery numbers for the org headline + per-repo table. */
  delivery?: PerRepoDelivery;
  /**
   * Tech-stack items detected for this repo (four categories), as read from
   * the per-repo audit.json (whose items carry `evidence`). Only `name` is
   * used for aggregation; `evidence` is accepted but not carried through.
   */
  tech_stack?: {
    languages: Array<{ name: string; evidence?: string }>;
    agent_tools: Array<{ name: string; evidence?: string }>;
    ci: Array<{ name: string; evidence?: string }>;
    frameworks: Array<{ name: string; evidence?: string }>;
  };
  /**
   * Linked repos detected for this repo (symlinks / submodules / MCP servers).
   * Only `name` is used for cross-repo counting; a repo linking the same name via
   * multiple paths counts once per repo.
   */
  linked_repos?: Array<{ name: string; via?: string; kind?: string }>;
  /**
   * Flattened check records from this repo's audit dimensions (Task 5.5).
   * Used by the org rollup to compute cross-repo capability gaps.
   * Absent repos contribute nothing to gap aggregation.
   */
  checks?: Array<{
    check_id: string;
    dimension: string;
    /** Human label from standards.toml — the first repo that has this check sets it. */
    definition: string;
    status: string;
  }>;
  /**
   * Compact per-cluster prevention slice from this repo's audit.prevention
   * (rollup_input derives it). Absent for repos audited before the
   * prevention-coverage dimension existed.
   */
  prevention?: {
    clusters: Array<{
      cluster: string;
      title: string;
      tier: PreventionTier;
      unguarded_passes: number;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Org gaps types (Task 5.5)
// ---------------------------------------------------------------------------

/**
 * One cross-repo capability gap: a check that FAILs in at least one repo.
 * Used as the deterministic seed for the orchestrator's org insights/recommendations.
 */
export interface OrgGap {
  /** Check identifier (e.g. "AS-12", "AI-03"). */
  check_id: string;
  /** Dimension slug the check belongs to (e.g. "security"). */
  dimension: string;
  /** Human-readable label from standards.toml — taken from the first repo that has this check. */
  definition: string;
  /** Number of repos where this check's status is FAIL. */
  fail_repos: number;
  /** Number of repos where this check is present (any status, including SKIP). */
  total_repos: number;
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
  /**
   * Per-source lookback windows merged across repos (max days per source,
   * first label) — lets the org report show the measurement window like a
   * per-repo report does.
   */
  source_windows?: Record<string, { days: number | null; label: string }>;
  /** Standards provenance (standards_date, thresholds) from the per-repo audits. */
  standards_meta?: Record<string, unknown>;
  /**
   * Deterministic cross-repo capability gap seed (Task 5.5).
   * Each entry is a check that FAILs in ≥1 repo, sorted by fail_repos desc
   * then check_id asc, capped at 15. Absent when no check FAILs anywhere.
   * The orchestrator phrases these into plain-language portfolio insights
   * and recommendations; it never invents the counts.
   */
  org_gaps?: OrgGap[];
  /**
   * Cross-repo prevention rollup: per-cluster tier counts across repos,
   * sorted by absent_repos desc then cluster asc. Only clusters with
   * absent_repos + pending_repos > 0 are listed (a fully-enforced cluster is
   * not a gap). Absent when no repo carries a prevention block. PRV checks
   * are excluded from org_gaps — this is their org-level expression.
   */
  prevention_gaps?: OrgPreventionGap[];
}

// ---------------------------------------------------------------------------
// Org headline (average matrix) spec
// ---------------------------------------------------------------------------

/**
 * The 6 deterministic delivery rows of the org headline, in the same order as
 * the single-repo headline (SKILL.md). Row 1 (capability Points + Coverage)
 * stays the `org_capability_score` portfolio card — it is NOT duplicated here.
 * Cycle-time and MTTR are connector-gated (tracker / incident) display strings
 * carried per repo for the Repositories table; they cannot be averaged, so the
 * deterministic org headline omits them.
 *
 * `key`    — numeric field on PerRepoDelivery to average.
 * `band`   — re-band function applied to the MEAN (omit for un-banded rows).
 * `format` — turns the MEAN into a display string.
 */
interface DeliverySpec {
  key: NumericDeliveryKey;
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
    check_id: 'DF-01',
    band: doraDeployBand,
    format: (v) => `${round1(v)} / wk`,
  },
  {
    key: 'rework_rate',
    label: 'Rework rate (DORA)',
    check_id: 'DF-06',
    band: reworkBand,
    format: (v) => `${round1(v * 100)}%`,
  },
  {
    key: 'lead_time',
    label: 'Lead time for change',
    check_id: 'DF-02',
    band: doraLeadTimeBand,
    format: (v) => `${round1(v)} h`,
  },
  {
    key: 'change_fail',
    label: 'Change-failure rate',
    check_id: 'DF-04',
    band: doraChangeFailBand,
    format: (v) => `${round1(v * 100)}%`,
  },
];

/**
 * Delivery check_id → the numeric PerRepoDelivery field it feeds, derived from
 * DELIVERY_SPECS so the rollup reader (rollup_input.ts) and the org headline
 * can never disagree on the mapping. Only the git-sourced DORA rows carry a
 * check_id; cycle-time/MTTR are connector-gated display strings, not averaged.
 */
export const DELIVERY_CHECK_FIELDS: Array<[string, NumericDeliveryKey]> =
  DELIVERY_SPECS.filter((s) => s.check_id !== undefined).map((s) => [
    s.check_id as string,
    s.key,
  ]);

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
// Org gap computation (Task 5.5)
// ---------------------------------------------------------------------------

/**
 * Compute the cross-repo capability gap seed from per-repo check arrays.
 *
 * Rules:
 * - total_repos counts every repo where the check is present (any status, including SKIP).
 * - fail_repos counts only repos where status === 'FAIL'; WARN and SKIP are not failures.
 * - Duplicate check_ids within one repo count once per repo (first occurrence wins).
 * - Only checks with fail_repos > 0 are included (a gap in ≥1 repo).
 * - Sorted by fail_repos desc, then check_id asc for deterministic output.
 * - Capped at 15 entries so the seed is scannable without being a per-repo dump.
 * - definition comes from the first repo in the input array that carries the check.
 */
function computeOrgGaps(perRepoResults: PerRepoInput[]): OrgGap[] {
  // Map from check_id to accumulator.
  const gapMap = new Map<
    string,
    {
      dimension: string;
      definition: string;
      fail_repos: number;
      total_repos: number;
    }
  >();

  for (const repo of perRepoResults) {
    if (!repo.checks || repo.checks.length === 0) continue;

    // Dedupe check_ids within this repo; first occurrence wins for status.
    const seenInRepo = new Set<string>();
    for (const check of repo.checks) {
      if (!check.check_id || seenInRepo.has(check.check_id)) continue;
      seenInRepo.add(check.check_id);

      const entry = gapMap.get(check.check_id);
      if (entry) {
        entry.total_repos++;
        if (check.status === 'FAIL') entry.fail_repos++;
      } else {
        gapMap.set(check.check_id, {
          dimension: check.dimension,
          definition: check.definition,
          fail_repos: check.status === 'FAIL' ? 1 : 0,
          total_repos: 1,
        });
      }
    }
  }

  return Array.from(gapMap.entries())
    .filter(([, v]) => v.fail_repos > 0)
    .sort(
      ([aId, av], [bId, bv]) =>
        bv.fail_repos - av.fail_repos || aId.localeCompare(bId)
    )
    .slice(0, 15)
    .map(([check_id, v]) => ({
      check_id,
      dimension: v.dimension,
      definition: v.definition,
      fail_repos: v.fail_repos,
      total_repos: v.total_repos,
    }));
}

// ---------------------------------------------------------------------------
// Prevention gap computation
// ---------------------------------------------------------------------------

/**
 * Aggregate the per-repo prevention slices into per-cluster tier counts.
 *
 * Rules:
 * - total_repos counts every repo reporting the cluster (any tier, incl. pending).
 * - Only clusters with absent_repos + pending_repos > 0 are included — a
 *   cluster enforced or instructed everywhere is not a gap.
 * - Sorted by absent_repos desc, then cluster asc, for deterministic output.
 * - No cap: the cluster catalog is small (8) by construction.
 * - title comes from the first repo that carries the cluster.
 */
function computePreventionGaps(
  perRepoResults: PerRepoInput[]
): OrgPreventionGap[] {
  const gapMap = new Map<string, OrgPreventionGap>();
  for (const repo of perRepoResults) {
    for (const cl of repo.prevention?.clusters ?? []) {
      let entry = gapMap.get(cl.cluster);
      if (!entry) {
        entry = {
          cluster: cl.cluster,
          title: cl.title,
          absent_repos: 0,
          instructed_repos: 0,
          enforced_repos: 0,
          pending_repos: 0,
          total_repos: 0,
          unguarded_passes_total: 0,
        };
        gapMap.set(cl.cluster, entry);
      }
      entry.total_repos++;
      entry.unguarded_passes_total += cl.unguarded_passes;
      if (cl.tier === 'enforced') entry.enforced_repos++;
      else if (cl.tier === 'instructed') entry.instructed_repos++;
      else if (cl.tier === 'pending') entry.pending_repos++;
      else entry.absent_repos++;
    }
  }
  return Array.from(gapMap.values())
    .filter((g) => g.absent_repos + g.pending_repos > 0)
    .sort(
      (a, b) =>
        b.absent_repos - a.absent_repos || a.cluster.localeCompare(b.cluster)
    );
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
        makeMetric('org_measurement_coverage', 0, false, 0),
        makeMetric('org_capability_score', 0, false, 0),
        makeMetric('org_ai_tooling_coverage', 0, false, 0),
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
      org_gaps: [],
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
      cycle_time: d.cycle_time ?? null,
      mttr: d.mttr ?? null,
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

  // All three portfolio cards use the SAME weighting for consistency: each
  // repo weighs as its active-contributor count (a 40-person repo moves the
  // portfolio average more than a 2-person one). When any repo lacks a
  // contributor count the whole set falls back to equal weighting, and each
  // card's description says which was used.
  const weightingNote = allHaveContributors
    ? 'weighted by active contributors per repo'
    : 'equal-weighted (contributor counts unavailable)';

  // Card 1: Standards coverage — contributor-weighted mean of the per-repo
  // coverage ratios (awarded ÷ applicable weight): how much of the current
  // industry standard the portfolio has in place.
  const coverageRepos = repos.filter((r) => typeof r.coverage === 'number');
  const coverageWeight = coverageRepos.reduce((s, r) => s + weight(r), 0);
  const standardsCoverage =
    coverageWeight > 0
      ? coverageRepos.reduce(
          (s, r) => s + (r.coverage as number) * weight(r),
          0
        ) / coverageWeight
      : 0;

  // Card 2: capability score — contributor-weighted mean of awarded points.
  const capabilityScore =
    totalWeight > 0
      ? repos.reduce((s, r) => s + r.awarded_weight * weight(r), 0) /
        totalWeight
      : 0;

  // Card 3: repos with AI tooling — contributor-weighted fraction, plus the
  // plain X-of-Y count for the tooltip.
  const reposWithTooling = repos.filter((r) => r.has_ai_tooling);
  const toolingCoverage =
    totalWeight > 0
      ? reposWithTooling.reduce((s, r) => s + weight(r), 0) / totalWeight
      : 0;

  const portfolio_metrics: PortfolioMetric[] = [
    {
      metric: 'org_measurement_coverage',
      value: round4(standardsCoverage),
      description: `Standards coverage — the share of the current industry standard the portfolio has in place (mean of the per-repo coverage headlines, ${weightingNote})`,
      contributor_weighted: allHaveContributors,
      repos_counted: repos.length,
    },
    {
      metric: 'org_capability_score',
      value: round4(capabilityScore),
      description: `Average capability points per repo (sum of awarded category weights, ${weightingNote})`,
      contributor_weighted: allHaveContributors,
      repos_counted: repos.length,
    },
    {
      metric: 'org_ai_tooling_coverage',
      value: round4(toolingCoverage),
      description: `Share of the portfolio working with AI tooling in the repo — ${reposWithTooling.length} of ${repos.length} repositories (${weightingNote})`,
      contributor_weighted: allHaveContributors,
      repos_counted: repos.length,
    },
  ];

  const headline = buildHeadline(repos);
  const org_connections = aggregateConnections(perRepoResults);
  const org_gaps = computeOrgGaps(perRepoResults);
  const prevention_gaps = computePreventionGaps(perRepoResults);

  // Merge per-repo source windows: max days per source, first label seen.
  const sourceWindows: Record<string, { days: number | null; label: string }> =
    {};
  for (const r of perRepoResults) {
    for (const [src, w] of Object.entries(r.source_windows ?? {})) {
      const existing = sourceWindows[src];
      if (!existing || (w.days ?? 0) > (existing.days ?? 0)) {
        sourceWindows[src] = { days: w.days ?? null, label: w.label };
      }
    }
  }
  const standardsMeta = perRepoResults.find(
    (r) => r.standards_meta
  )?.standards_meta;

  const result: OrgRollupResult = {
    portfolio_metrics,
    per_repo: repos,
    org_connections,
    org_gaps,
  };
  if (headline) result.headline = headline;
  if (prevention_gaps.length > 0) result.prevention_gaps = prevention_gaps;
  if (Object.keys(sourceWindows).length > 0)
    result.source_windows = sourceWindows;
  if (standardsMeta) result.standards_meta = standardsMeta;
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
      'Share of the portfolio working with AI tooling in the repo',
    org_capability_score: 'Average capability points per repo',
    org_measurement_coverage:
      'Standards coverage — the share of the current industry standard the portfolio has in place',
  };
  return {
    metric,
    value,
    description: descriptions[metric] ?? metric,
    contributor_weighted,
    repos_counted,
  };
}
