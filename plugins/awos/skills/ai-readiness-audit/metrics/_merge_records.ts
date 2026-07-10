/**
 * _merge_records — shared git merge-record duration helper.
 *
 * The git collector stores merge_records as { merged_at, branch_first_commit_at }.
 * lead_time_for_change, pr_cycle_time, and mttr all derive per-branch durations
 * from them the same way (merged_at − branch_first_commit_at, in hours, dropping
 * unparseable and negative intervals). This is that one loop.
 */

export interface MergeRecord {
  merged_at: string;
  branch_first_commit_at: string;
}

/**
 * Durations (hours) from branch first commit to merge for each record.
 * Records with an unparseable timestamp, a negative interval, or — when
 * `windowStartMs` is provided — a merge older than the window are dropped.
 * Order follows the input; callers that need a median sort a copy themselves.
 */
export function mergeRecordDurationsHours(
  records: MergeRecord[],
  windowStartMs?: number | null
): number[] {
  const hours: number[] = [];
  for (const r of records) {
    const mergedAt = new Date(r.merged_at).getTime();
    const firstCommit = new Date(r.branch_first_commit_at).getTime();
    if (isNaN(mergedAt) || isNaN(firstCommit)) continue;
    if (windowStartMs != null && mergedAt < windowStartMs) continue;
    const diffHours = (mergedAt - firstCommit) / 3_600_000;
    if (diffHours >= 0) hours.push(diffHours);
  }
  return hours;
}
