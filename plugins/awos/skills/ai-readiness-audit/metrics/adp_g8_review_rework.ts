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
 * score: banded on avg commits/PR via COMMITS_PER_PR_ANCHORS — ~1–2 commits/PR
 * scores 1.0, declining linearly to 0 at ≥10 commits/PR (AWOS heuristics).
 *
 * SKIP: if git.json is absent, merge_records is empty, or total_merges is 0.
 */
import {
  computeReliability,
  makeMetricResult,
  readArtifact,
  skipMetric,
  squashSkipReliability,
  type MetricResult,
} from './_base.ts';
import { bandScore, clamp01 } from './_score.ts';

/**
 * Score anchors on avg commits per merged PR (linear piecewise, clamped to
 * [0,1]) in the style of adp_g14_rework_rate. AWOS heuristics — DX Core 4
 * publishes no numeric commits-per-PR thresholds:
 *   ≤2   → 1.0   (1–2 commits/PR: focused merges, little in-review rework)
 *   4    → 0.7
 *   6    → 0.4
 *   ≥10  → 0.0   (heavy in-review thrashing)
 */
const COMMITS_PER_PR_ANCHORS = [
  { x: 2, y: 1.0 },
  { x: 4, y: 0.7 },
  { x: 6, y: 0.4 },
  { x: 10, y: 0.0 },
];

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const read = readArtifact(collectedDir, 'git');
  if ('error' in read) {
    return skipMetric(
      'adp_g8_review_rework',
      'computed',
      'not-reliable',
      'git',
      read.error
    );
  }

  const raw = read.artifact?.raw;
  if (
    !raw ||
    !Array.isArray(raw.merge_records) ||
    raw.merge_records.length === 0
  ) {
    return skipMetric(
      'adp_g8_review_rework',
      'computed',
      'not-reliable',
      'git'
    );
  }

  // Squash/rebase-merge workflows produce no merge commits, so merge_records
  // is empty or unrepresentative (only the rare true merge). Reporting a
  // confident number from that residue would mis-measure a healthy repo.
  if (raw.window_stats?.merge_strategy === 'squash') {
    return makeMetricResult(
      'adp_g8_review_rework',
      null,
      'computed',
      [],
      squashSkipReliability(),
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

  // Score from the commits-per-PR proxy: ~1–2 commits/PR is best-case (1.0),
  // declining to 0 at ≥10 commits/PR — see COMMITS_PER_PR_ANCHORS.
  const score = clamp01(
    bandScore(commitsPerPr, COMMITS_PER_PR_ANCHORS, 'linear')
  );

  const expression = `avg ${commitsPerPr.toFixed(1)} commits/PR → ${reworkProxy.toFixed(1)} estimated rework commits`;
  return makeMetricResult(
    'adp_g8_review_rework',
    reworkProxy,
    'computed',
    [801],
    reliability,
    ['git'],
    [],
    { expression, score, confidence: 1.0 }
  );
}
