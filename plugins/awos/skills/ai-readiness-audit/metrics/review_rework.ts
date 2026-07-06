/**
 * review_rework — Review rework cycle proxy.
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
 * Source shape (preferred): collectedDir/code_host.json — per-PR commit
 *   counts from the code-host connector (works for squash-merge repos).
 * Source shape (fallback): collectedDir/git.json
 * Input raw fields: merge_records (Array<{ merged_at: string; branch_first_commit_at: string }>)
 *
 * Note: git.json does not capture per-branch commit counts directly. We
 * estimate rework as commits-per-merged-PR minus 1 (for the initial commit),
 * preferring the windowed trunk-scoped counts (window_stats.trunk_commits /
 * window_stats.merges) so the proxy reflects current practice; the
 * all-history total_commits / merge_records.length ratio remains only as a
 * legacy fallback for pre-window artifacts. When the usable merge count is 0
 * or merge_records is empty, SKIP.
 *
 * score: banded on avg commits/PR via the curve declared in
 *   standards.toml [category.review_rework.scoring].
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
import { readCodeHostPrs } from './_code_host.ts';
import { scoreFromConfig, scoringFor } from './_score.ts';

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  // Preferred source: per-PR commit counts from the code-host connector —
  // a real per-PR distribution instead of the total_commits/total_merges
  // average, and it works for every merge strategy, including squash.
  const codeHost = readCodeHostPrs(collectedDir);
  const prCommitCounts = codeHost.prs
    .map((p) => p.commitCount)
    .filter((n): n is number => n !== null && n > 0);
  if (prCommitCounts.length > 0) {
    const commitsPerPr =
      prCommitCounts.reduce((s, n) => s + n, 0) / prCommitCounts.length;
    const reworkProxy = Math.max(0, commitsPerPr - 1);
    // Still "minimal": commit count cannot distinguish review-driven rework
    // from normal iteration, but per-PR counts from the host beat the
    // whole-history average.
    const reliability = computeReliability('minimal', ['code_host'], []);
    // Score curve lives in standards.toml [category.review_rework.scoring].
    const score = scoreFromConfig(
      commitsPerPr,
      scoringFor(standards, 'review_rework')
    );
    const expression = `avg ${commitsPerPr.toFixed(1)} commits/PR over ${prCommitCounts.length} merged PRs from the code host → ${reworkProxy.toFixed(1)} estimated rework commits`;
    return makeMetricResult(
      'review_rework',
      reworkProxy,
      'computed',
      [801],
      reliability,
      ['code_host'],
      [],
      { expression, score, confidence: 1.0 }
    );
  }

  const read = readArtifact(collectedDir, 'git');
  if ('error' in read) {
    return skipMetric(
      'review_rework',
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
    return skipMetric('review_rework', 'computed', 'not-reliable', 'git');
  }

  // Squash/rebase-merge workflows produce no merge commits, so merge_records
  // is empty or unrepresentative (only the rare true merge). Reporting a
  // confident number from that residue would mis-measure a healthy repo.
  if (raw.window_stats?.merge_strategy === 'squash') {
    return makeMetricResult(
      'review_rework',
      null,
      'computed',
      [],
      squashSkipReliability(),
      [],
      ['git']
    );
  }

  // Prefer the windowed, trunk-scoped counts so the proxy measures current
  // practice like every other DORA metric; fall back to the all-history
  // totals only for pre-window artifacts that lack the fields. A windowed
  // artifact with zero in-window merges SKIPs — reporting a number from
  // merges outside the window would defeat the windowing.
  const ws = raw.window_stats;
  const windowed = typeof ws?.trunk_commits === 'number';
  if (windowed && !(ws.merges > 0)) {
    return skipMetric('review_rework', 'computed', 'not-reliable', 'git');
  }
  const totalMerges: number = windowed ? ws.merges : raw.merge_records.length;
  const totalCommits: number = windowed
    ? ws.trunk_commits
    : (raw.total_commits ?? 0);

  // Average commits per merged PR as a rework proxy.
  // Subtract 1 to estimate "rework commits" beyond the initial commit.
  // Floor at 0 in case of edge cases (fewer commits than merges).
  const commitsPerPr = totalMerges > 0 ? totalCommits / totalMerges : 0;
  const reworkProxy = Math.max(0, commitsPerPr - 1);

  // Reliability is "not-reliable" — commit count per branch is a coarse proxy.
  // Review round count requires code-host data (PR comments, review requests).
  const reliability = computeReliability('not-reliable', ['git'], []);

  // Score from the commits-per-PR proxy via the declared curve
  // (standards.toml [category.review_rework.scoring]).
  const score = scoreFromConfig(
    commitsPerPr,
    scoringFor(standards, 'review_rework')
  );

  const windowLabel = windowed ? ` over the last ${ws.window_days} days` : '';
  const expression = `avg ${commitsPerPr.toFixed(1)} commits/PR${windowLabel} → ${reworkProxy.toFixed(1)} estimated rework commits`;
  return makeMetricResult(
    'review_rework',
    reworkProxy,
    'computed',
    [801],
    reliability,
    ['git'],
    [],
    { expression, score, confidence: 1.0 }
  );
}
