/**
 * lead_time_for_change — Lead time for change (DORA banded).
 *
 * kind: "banded"
 * value: median lead time in hours (merged_at − branch_first_commit_at)
 * band: one of "elite" | "high" | "medium" | "low" per DORA thresholds
 * categories_awarded: [401] when data is available
 * reliability_default: "minimal" (git approximation — branch_first_commit_at
 *   is earliest commit on merged branch, not actual work start; true lead time
 *   may be shorter if work predates branch or longer if review is untracked)
 *
 * DORA band thresholds (lead_time_for_change in standards.toml):
 *   elite  → < 1 day    (< 24 hours)
 *   high   → < 1 week   (< 168 hours)
 *   medium → < 1 month  (< 720 hours, ~30 days)
 *   low    → >= 1 month (>= 720 hours)
 *
 * Source shape (preferred): collectedDir/code_host.json — merged-PR records
 *   from the code-host connector (first_commit_at → merged_at). Real PR data
 *   works for every merge strategy, including squash.
 * Source shape (fallback): collectedDir/git.json
 * Input raw fields:
 *   merge_records (Array<{ merged_at: string; branch_first_commit_at: string }>)
 *   window_stats?.window_start (string | null | undefined) — when present and non-empty,
 *     only records whose merged_at >= window_start are counted; when absent or null,
 *     ALL records are used (graceful degradation for artifacts from older collectors).
 *
 * SKIP: if no code-host PR data AND git.json is absent, merge_records is
 * empty, or no in-window lead times exist.
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
import { median, scoreFromConfig, scoringFor } from './_score.ts';

interface MergeRecord {
  merged_at: string;
  branch_first_commit_at: string;
}

/** Map median lead-time hours to a DORA band label. */
export function doraLeadTimeBand(hours: number): string {
  if (hours < 24) return 'elite';
  if (hours < 168) return 'high';
  if (hours < 720) return 'medium';
  return 'low';
}

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  // Preferred source: the code-host connector's merged-PR records. Real PR
  // data works for every merge strategy — including squash, where git history
  // alone cannot reconstruct branch lifetimes.
  const codeHost = readCodeHostPrs(collectedDir);
  const prLeadTimes = codeHost.prs
    .map((p) =>
      p.mergedMs !== null && p.firstCommitMs !== null
        ? (p.mergedMs - p.firstCommitMs) / 3_600_000
        : null
    )
    .filter((h): h is number => h !== null && h >= 0);
  if (prLeadTimes.length > 0) {
    const medianHours = median(prLeadTimes)!;
    const band = doraLeadTimeBand(medianHours);
    // Score curve lives in standards.toml [category.lead_time_for_change.scoring].
    const score = scoreFromConfig(
      medianHours,
      scoringFor(standards, 'lead_time_for_change')
    );
    // "minimal" (lower-bound), not "maximal": first_commit_at is the earliest
    // commit authored on the PR — work that predates the first commit is
    // still invisible, same approximation class as the git proxy but from
    // real per-PR data.
    const reliability = computeReliability('minimal', ['code_host'], []);
    const expression = `median ${medianHours.toFixed(1)}h lead time over ${prLeadTimes.length} merged PR${prLeadTimes.length !== 1 ? 's' : ''} from the code host (${band})`;
    return makeMetricResult(
      'lead_time_for_change',
      medianHours,
      'banded',
      [401],
      reliability,
      ['code_host'],
      [],
      { band, expression, score, confidence: 1.0 }
    );
  }

  const read = readArtifact(collectedDir, 'git');
  if ('error' in read) {
    return skipMetric(
      'lead_time_for_change',
      'banded',
      'minimal',
      'git',
      read.error
    );
  }

  const artifact = read.artifact;
  const raw = artifact?.raw;
  if (
    !raw ||
    !Array.isArray(raw.merge_records) ||
    raw.merge_records.length === 0
  ) {
    return skipMetric('lead_time_for_change', 'banded', 'minimal', 'git');
  }

  // Squash/rebase-merge workflows produce no merge commits, so merge_records
  // is empty or unrepresentative (only the rare true merge). Reporting a
  // confident number from that residue would mis-measure a healthy repo —
  // admit the source is unavailable instead.
  if (raw.window_stats?.merge_strategy === 'squash') {
    return makeMetricResult(
      'lead_time_for_change',
      null,
      'banded',
      [],
      squashSkipReliability(),
      [],
      ['git']
    );
  }

  // If window_stats.window_start is available, restrict to in-window merges only.
  // When absent/null (older artifact or empty repo), fall back to all records so
  // existing test fixtures and pre-task-2.1 audits continue to produce results.
  // Compare by epoch-ms, not by ISO string: merged_at comes from git %cI in the
  // committer's LOCAL timezone offset (e.g. "...-08:00") while window_start is UTC
  // from toISOString(); lexicographic compare of mixed-offset strings is not
  // chronological and would mis-window commits near the boundary.
  const windowStart: string | null = raw.window_stats?.window_start ?? null;
  let records: MergeRecord[] = raw.merge_records;
  if (windowStart) {
    const windowStartMs = new Date(windowStart).getTime();
    records = records.filter(
      (r) => new Date(r.merged_at).getTime() >= windowStartMs
    );
  }

  // Compute lead times in hours for each (in-window) merge record.
  const leadTimesHours: number[] = [];
  for (const r of records) {
    const mergedAt = new Date(r.merged_at).getTime();
    const firstCommit = new Date(r.branch_first_commit_at).getTime();
    if (isNaN(mergedAt) || isNaN(firstCommit)) continue;
    const diffHours = (mergedAt - firstCommit) / 3_600_000;
    if (diffHours >= 0) {
      leadTimesHours.push(diffHours);
    }
  }

  if (leadTimesHours.length === 0) {
    return skipMetric('lead_time_for_change', 'banded', 'minimal', 'git');
  }

  const medianHours = median(leadTimesHours)!;
  const band = doraLeadTimeBand(medianHours);

  // Reliability is "minimal" — git-approximated: branch_first_commit_at is
  // the earliest commit on the merged branch, which may undercount review time
  // or overcount if work predated branching.
  const reliability = computeReliability('minimal', ['git'], []);

  const score = scoreFromConfig(
    medianHours,
    scoringFor(standards, 'lead_time_for_change')
  );
  const windowLabel = windowStart ? ' (in-window)' : '';
  const expression = `median ${medianHours.toFixed(1)}h lead time over ${leadTimesHours.length} merge${leadTimesHours.length !== 1 ? 's' : ''}${windowLabel} (${band})`;
  return makeMetricResult(
    'lead_time_for_change',
    medianHours,
    'banded',
    [401],
    reliability,
    ['git'],
    [],
    { band, expression, score, confidence: 1.0 }
  );
}
