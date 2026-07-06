import { makeArtifact, type Period } from './_base.ts';

// ---------------------------------------------------------------------------
// Connector shape
// ---------------------------------------------------------------------------

/** A single documentation page record from an external docs system
 *  (Confluence, Notion, GitBook, etc.). */
export interface DocPage {
  title?: string;
  url?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** Connector passed in by the caller when an external docs integration is
 *  available. */
export interface DocsConnector {
  pages?: DocPage[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Raw shape
// ---------------------------------------------------------------------------

export interface DocsRaw {
  /** All page records from the connector. Used for coverage (external_spec_coverage). */
  pages: DocPage[];
  /** Total number of pages returned by the connector. */
  page_count: number;
  /** Pages updated within the lookback period (freshness indicator, external_spec_coverage). */
  recently_updated_count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countRecentlyUpdated(pages: DocPage[], lookbackDays: number): number {
  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000);
  return pages.filter((p) => {
    if (!p.updated_at) return false;
    const d = new Date(p.updated_at);
    return !isNaN(d.getTime()) && d >= cutoff;
  }).length;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect external documentation data for a repository.
 *
 * Availability rules:
 * - `available=false` when no connector is provided (external docs cannot be
 *   inferred from the local filesystem alone).
 * - `available=true` when a connector is passed. Raw carries coverage and
 *   freshness data for the external_spec_coverage metric.
 */
export function collect(
  _repoPath: string,
  period: Period,
  connector?: DocsConnector
) {
  if (connector === undefined || connector === null) {
    return makeArtifact(
      'docs',
      false,
      'no docs connector provided; supply a Confluence/Notion/GitBook connector to enable documentation coverage metrics',
      { ...period, history_available_days: period.history_available_days },
      {} as DocsRaw
    );
  }

  const pages: DocPage[] = connector.pages ?? [];
  const recently_updated_count = countRecentlyUpdated(
    pages,
    period.lookback_days
  );

  const raw: DocsRaw = {
    pages,
    page_count: pages.length,
    recently_updated_count,
  };

  return makeArtifact('docs', true, null, period, raw);
}
