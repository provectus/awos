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
  makeMetricResult,
  readArtifact,
  skipMetric,
  type MetricResult,
} from './_base.ts';
import { clamp01 } from './_score.ts';

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>
): MetricResult {
  // Docs source absent or unreadable → SKIP with the reason in the note.
  const read = readArtifact(collectedDir, 'docs');
  if ('error' in read) {
    return skipMetric(
      'external_spec_coverage',
      'coverage',
      'not-reliable',
      'docs',
      read.error
    );
  }
  const artifact = read.artifact;

  // available=false means no docs connector was provided.
  if (!artifact?.available) {
    return skipMetric(
      'external_spec_coverage',
      'coverage',
      'not-reliable',
      'docs'
    );
  }

  const raw = artifact?.raw ?? {};
  const pageCount: number =
    typeof raw.page_count === 'number' ? raw.page_count : 0;
  const recentlyUpdatedCount: number =
    typeof raw.recently_updated_count === 'number'
      ? raw.recently_updated_count
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
