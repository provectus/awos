/**
 * adp_g8_review_rework — Review rework cycle proxy.
 *
 * kind: "computed"
 * value: average number of commits per merged branch (post-open commits proxy for
 *   review rework rounds); computed from merge_records using the number of side-branch
 *   commits between branch_first_commit and merge. Higher = more iterations.
 * categories_awarded: [801] when data is available
 * reliability_default: "not-reliable" — commit count is a very rough proxy:
 *   it cannot distinguish review-driven rework commits from normal feature work.
 *   True review-round count requires a code-host connector (GitHub/GitLab API).
 *
 * Source shape: collectedDir/git.json
 * Input raw fields: merge_records (Array<{ merged_at: string; branch_first_commit_at: string }>)
 *
 * Note: git.json does not capture per-branch commit counts directly. We use
 * merge_records length as a denominator and estimate rework as the ratio of
 * total_commits to total_merges (commits per PR on average) minus 1 (for the
 * initial commit). When total_merges is 0 or merge_records is empty, SKIP.
 *
 * SKIP: if git.json is absent, merge_records is empty, or total_merges is 0.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const gitPath = join(collectedDir, 'git.json');
  if (!existsSync(gitPath)) {
    return makeMetricResult(
      'adp_g8_review_rework',
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
  if (
    !raw ||
    !Array.isArray(raw.merge_records) ||
    raw.merge_records.length === 0
  ) {
    return makeMetricResult(
      'adp_g8_review_rework',
      null,
      'computed',
      [],
      computeReliability('not-reliable', [], ['git']),
      [],
      ['git']
    );
  }

  const totalMerges: number = raw.merge_records.length;
  const totalCommits: number = raw.total_commits ?? 0;

  // Average commits per merged PR as a rework proxy.
  // Subtract 1 to estimate "rework commits" beyond the initial commit.
  // Floor at 0 in case of edge cases (fewer commits than merges).
  const commitsPerPr = totalMerges > 0 ? totalCommits / totalMerges : 0;
  const reworkProxy = Math.max(0, commitsPerPr - 1);

  // Reliability is "not-reliable" — commit count per branch is a coarse proxy.
  // Review round count requires code-host data (PR comments, review requests).
  const reliability = computeReliability('not-reliable', ['git'], []);

  const expression = `avg ${commitsPerPr.toFixed(1)} commits/PR → ${reworkProxy.toFixed(1)} estimated rework commits`;
  return makeMetricResult(
    'adp_g8_review_rework',
    reworkProxy,
    'computed',
    [801],
    reliability,
    ['git'],
    [],
    null,
    undefined,
    undefined,
    expression,
    1.0,
    1.0
  );
}
