/**
 * active_contributors — Active contributor count over the 90-day window.
 *
 * kind: "computed"
 * value: number of active contributors (authors not excluded by the threshold rule)
 * categories_awarded: [201] when data is available
 * reliability_default: "not-reliable" (raw count; no direction without context)
 *
 * Source shape: collectedDir/git.json
 * Input raw fields: window_stats.per_author (Array<AuthorRow>)
 *
 * Active-contributor rule (locked — Phase 2 ratios reuse it):
 *   an author is excluded only when BOTH merge-share and LOC-share fall below T,
 *   where T = meta.active_contributor_threshold (from standards.toml [meta])
 *
 * SKIP: if git.json is absent or window_stats.per_author is absent/empty.
 */
import {
  computeReliability,
  makeMetricResult,
  metaNumber,
  readArtifact,
  skipMetric,
  type MetricResult,
} from './_base.ts';
import {
  activeContributors,
  ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT,
  type AuthorRow,
} from '../collectors/git.ts';

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const read = readArtifact(collectedDir, 'git');
  if ('error' in read) {
    return skipMetric(
      'active_contributors',
      'computed',
      'not-reliable',
      'git',
      read.error
    );
  }

  const raw = read.artifact?.raw;
  const perAuthor: AuthorRow[] | undefined = raw?.window_stats?.per_author;

  if (!Array.isArray(perAuthor) || perAuthor.length === 0) {
    return skipMetric('active_contributors', 'computed', 'not-reliable', 'git');
  }

  const T: number = metaNumber(
    _standards,
    'active_contributor_threshold',
    ACTIVE_CONTRIBUTOR_THRESHOLD_DEFAULT
  );

  const active = activeContributors(perAuthor, T);
  const excluded = perAuthor.length - active;
  const pct = Math.round(T * 100);
  const plural = active === 1 ? 'contributor' : 'contributors';
  const excludedClause =
    excluded > 0 ? `; ${excluded} excluded <${pct}% on merges & LOC` : '';
  const expression = `${active} active ${plural} (90d${excludedClause})`;

  const reliability = computeReliability('not-reliable', ['git'], []);

  return makeMetricResult(
    'active_contributors',
    active,
    'computed',
    [201],
    reliability,
    ['git'],
    [],
    { expression, score: 1.0, confidence: 1.0 }
  );
}
