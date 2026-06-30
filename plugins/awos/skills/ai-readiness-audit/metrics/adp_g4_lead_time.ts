/**
 * adp_g4_lead_time — Lead time for change (DORA banded).
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
 * Source shape: collectedDir/git.json
 * Input raw fields:
 *   merge_records (Array<{ merged_at: string; branch_first_commit_at: string }>)
 *   window_stats?.window_start (string | null | undefined) — when present and non-empty,
 *     only records whose merged_at >= window_start are counted; when absent or null,
 *     ALL records are used (graceful degradation for artifacts from older collectors).
 *
 * SKIP: if git.json is absent, merge_records is empty, or no in-window lead times exist.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';
import { bandScore, clamp01 } from './_score.ts';

const LEAD_TIME_ANCHORS = [
  { x: 1, y: 1.0 },
  { x: 24, y: 0.75 },
  { x: 168, y: 0.5 },
  { x: 720, y: 0.25 },
  { x: 2160, y: 0.0 },
] as const;

interface MergeRecord {
  merged_at: string;
  branch_first_commit_at: string;
}

/** Compute median of a sorted numeric array. */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Map median lead-time hours to a DORA band label. */
function doraLeadTimeBand(hours: number): string {
  if (hours < 24) return 'elite';
  if (hours < 168) return 'high';
  if (hours < 720) return 'medium';
  return 'low';
}

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  const gitPath = join(collectedDir, 'git.json');
  if (!existsSync(gitPath)) {
    return makeMetricResult(
      'adp_g4_lead_time',
      null,
      'banded',
      [],
      computeReliability('minimal', [], ['git']),
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
      'adp_g4_lead_time',
      null,
      'banded',
      [],
      computeReliability('minimal', [], ['git']),
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
    return makeMetricResult(
      'adp_g4_lead_time',
      null,
      'banded',
      [],
      computeReliability('minimal', [], ['git']),
      [],
      ['git']
    );
  }

  leadTimesHours.sort((a, b) => a - b);
  const medianHours = median(leadTimesHours);
  const band = doraLeadTimeBand(medianHours);

  // Reliability is "minimal" — git-approximated: branch_first_commit_at is
  // the earliest commit on the merged branch, which may undercount review time
  // or overcount if work predated branching.
  const reliability = computeReliability('minimal', ['git'], []);

  const score = clamp01(
    bandScore(
      medianHours,
      LEAD_TIME_ANCHORS as Array<{ x: number; y: number }>,
      'log'
    )
  );
  const windowLabel = windowStart ? ' (in-window)' : '';
  const expression = `median ${medianHours.toFixed(1)}h lead time over ${leadTimesHours.length} merge${leadTimesHours.length !== 1 ? 's' : ''}${windowLabel} (${band})`;
  return makeMetricResult(
    'adp_g4_lead_time',
    medianHours,
    'banded',
    [401],
    reliability,
    ['git'],
    [],
    band,
    undefined,
    expression,
    score,
    1.0
  );
}
