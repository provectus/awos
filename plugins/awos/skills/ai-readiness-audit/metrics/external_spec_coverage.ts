/**
 * external_spec_coverage — External doc/spec coverage from a docs connector.
 *
 * kind: "coverage"
 * value: fraction of recently-updated pages out of total (0–1), or null when no pages
 * band: null (raw coverage fraction reported)
 * categories_awarded: [1201] when topology.has_docs_connector is true
 * reliability_default: "not-reliable"
 *
 * Availability rule:
 *   - available=false (no docs connector) → SKIP (sources_used=[])
 *   - available=true, pages present → OK, compute freshness coverage
 *   - available=true, pages empty → OK, value=0 (no docs at all is meaningful signal)
 *
 * Coverage definition: recently_updated_count / page_count.
 * Both fields come from the docs artifact raw as computed by the docs collector.
 *
 * Source shape: collectedDir/docs.json
 * Input raw fields: page_count (number), recently_updated_count (number)
 */
import {
  awardCategories,
  computeReliability,
  loadArtifactOrSkip,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';
import { clamp01 } from './_score.ts';
import { countRecentlyUpdated, type DocPage } from '../collectors/docs.ts';

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>
): MetricResult {
  // Docs source absent/unreadable → SKIP with the reason; available=false
  // means no docs connector was provided → SKIP.
  const loaded = loadArtifactOrSkip(collectedDir, 'docs', {
    metric: 'external_spec_coverage',
    kind: 'coverage',
    tag: 'not-reliable',
  });
  if ('skip' in loaded) return loaded.skip;

  const { raw, artifact } = loaded;
  // Prefer the CLI-collect path's pre-computed aggregates; orchestrator-written
  // artifacts carry only pages[] (per connector-shapes.md), so derive the same
  // counts from them — absent aggregates must not read as "no docs".
  const pages: DocPage[] | null = Array.isArray(raw.pages)
    ? (raw.pages as DocPage[])
    : null;
  const pageCount: number =
    typeof raw.page_count === 'number'
      ? raw.page_count
      : pages
        ? pages.length
        : 0;
  const lookbackDays: number =
    typeof artifact?.period?.lookback_days === 'number' &&
    artifact.period.lookback_days > 0
      ? artifact.period.lookback_days
      : 90;
  const recentlyUpdatedCount: number =
    typeof raw.recently_updated_count === 'number'
      ? raw.recently_updated_count
      : pages
        ? countRecentlyUpdated(pages, lookbackDays)
        : 0;

  // Freshness coverage: ratio of recently-updated pages.
  // When page_count is 0, coverage is 0 (no docs is a meaningful finding, not SKIP).
  const coverage = pageCount > 0 ? recentlyUpdatedCount / pageCount : 0;

  const categories = awardCategories(
    standards,
    'external_spec_coverage',
    topology
  );
  const reliability = computeReliability('not-reliable', ['docs'], []);

  const expression = `${recentlyUpdatedCount}/${pageCount} docs recently updated = ${(coverage * 100).toFixed(1)}% freshness`;
  return makeMetricResult(
    'external_spec_coverage',
    coverage,
    'coverage',
    categories,
    reliability,
    ['docs'],
    [],
    { expression, score: clamp01(coverage), confidence: 1.0 }
  );
}
