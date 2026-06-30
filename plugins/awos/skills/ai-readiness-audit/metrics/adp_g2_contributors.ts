/**
 * adp_g2_contributors — Active contributor count over the 90-day window.
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
 *   exclude an author iff merge_share < T AND loc_share < T
 *   where T = meta.active_contributor_threshold (default 0.1)
 *
 * SKIP: if git.json is absent or window_stats.per_author is absent/empty.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';
import { activeContributors, type AuthorRow } from '../collectors/git.ts';

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const gitPath = join(collectedDir, 'git.json');
  if (!existsSync(gitPath)) {
    return makeMetricResult(
      'adp_g2_contributors',
      null,
      'computed',
      [],
      computeReliability('not-reliable', [], ['git']),
      [],
      ['git']
    );
  }

  const artifact = JSON.parse(readFileSync(gitPath, 'utf8'));
  const raw = artifact?.raw;
  const perAuthor: AuthorRow[] | undefined = raw?.window_stats?.per_author;

  if (!Array.isArray(perAuthor) || perAuthor.length === 0) {
    return makeMetricResult(
      'adp_g2_contributors',
      null,
      'computed',
      [],
      computeReliability('not-reliable', [], ['git']),
      [],
      ['git']
    );
  }

  const T: number =
    ((_standards['meta'] as Record<string, unknown>)?.[
      'active_contributor_threshold'
    ] as number | undefined) ?? 0.1;

  const active = activeContributors(perAuthor, T);
  const excluded = perAuthor.length - active;
  const pct = Math.round(T * 100);
  const plural = active === 1 ? 'contributor' : 'contributors';
  const excludedClause =
    excluded > 0 ? `; ${excluded} excluded <${pct}% on merges & LOC` : '';
  const expression = `${active} active ${plural} (90d${excludedClause})`;

  const reliability = computeReliability('not-reliable', ['git'], []);

  return makeMetricResult(
    'adp_g2_contributors',
    active,
    'computed',
    [201],
    reliability,
    ['git'],
    [],
    null,
    undefined,
    expression,
    1.0,
    1.0
  );
}
