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
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
}

export interface PortfolioMetric {
  metric: string;
  value: number;
  description: string;
  /** Fraction 0–1: value is contributor-weighted (true) or equal-weighted (false). */
  contributor_weighted: boolean;
  repos_counted: number;
}

export interface OrgRollupResult {
  /** Exactly ≤3 portfolio-level metrics. */
  portfolio_metrics: PortfolioMetric[];
  /** Per-repo summary rows (input echoed with computed fields). */
  per_repo: PerRepoSummary[];
}

export interface PerRepoSummary {
  repo: string;
  contributors: number | null;
  awarded_weight: number;
  sources_reachable: string[];
  has_ai_tooling: boolean;
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
    };
  }

  // Normalize inputs.
  const repos: PerRepoSummary[] = perRepoResults.map((r) => ({
    repo: r.repo,
    contributors: r.contributors ?? null,
    awarded_weight: r.awarded_weight ?? 0,
    sources_reachable: r.sources_reachable ?? [],
    has_ai_tooling: r.has_ai_tooling ?? false,
  }));

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

  return { portfolio_metrics, per_repo: repos };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
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
