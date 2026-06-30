/**
 * adp_g5_pr_cycle_time — PR/merge cycle time proxy (DORA banded).
 *
 * kind: "banded"
 * value: median PR cycle time in hours (merged_at − branch_first_commit_at)
 * band: one of "elite" | "high" | "medium" | "low" per DORA lead-time thresholds
 * categories_awarded: [501] when data is available
 * reliability_default: "not-reliable" (git approximation — branch_first_commit_at
 *   is the earliest commit on the merged branch, not the PR open time; PR open
 *   time is only available via code-host connectors)
 *
 * DORA band thresholds (same thresholds as lead_time_for_change):
 *   elite  → < 1 day    (< 24 hours)
 *   high   → < 1 week   (< 168 hours)
 *   medium → < 1 month  (< 720 hours)
 *   low    → >= 1 month (>= 720 hours)
 *
 * Source shape: collectedDir/git.json
 * Input raw fields: merge_records (Array<{ merged_at: string; branch_first_commit_at: string }>)
 *
 * SKIP: if git.json is absent or merge_records is empty.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';
import { bandScore, clamp01 } from './_score.ts';

const CYCLE_TIME_ANCHORS = [
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

/** Map median cycle-time hours to a DORA band label. */
function doraCycleTimeBand(hours: number): string {
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
      'adp_g5_pr_cycle_time',
      null,
      'banded',
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
      'adp_g5_pr_cycle_time',
      null,
      'banded',
      [],
      computeReliability('not-reliable', [], ['git']),
      [],
      ['git']
    );
  }

  const records: MergeRecord[] = raw.merge_records;

  // Compute cycle times in hours for each merge record.
  const cycleTimesHours: number[] = [];
  for (const r of records) {
    const mergedAt = new Date(r.merged_at).getTime();
    const firstCommit = new Date(r.branch_first_commit_at).getTime();
    if (isNaN(mergedAt) || isNaN(firstCommit)) continue;
    const diffHours = (mergedAt - firstCommit) / 3_600_000;
    if (diffHours >= 0) {
      cycleTimesHours.push(diffHours);
    }
  }

  if (cycleTimesHours.length === 0) {
    return makeMetricResult(
      'adp_g5_pr_cycle_time',
      null,
      'banded',
      [],
      computeReliability('not-reliable', [], ['git']),
      [],
      ['git']
    );
  }

  cycleTimesHours.sort((a, b) => a - b);
  const medianHours = median(cycleTimesHours);
  const band = doraCycleTimeBand(medianHours);

  // Reliability is "not-reliable" — git approximation: branch_first_commit_at
  // is the earliest commit on the merged branch, not the PR open time.
  // True PR cycle time requires a code-host connector (GitHub/GitLab API).
  const reliability = computeReliability('not-reliable', ['git'], []);

  const score = clamp01(
    bandScore(
      medianHours,
      CYCLE_TIME_ANCHORS as Array<{ x: number; y: number }>,
      'log'
    )
  );
  const expression = `median ${medianHours.toFixed(1)}h cycle time (${band})`;
  return makeMetricResult(
    'adp_g5_pr_cycle_time',
    medianHours,
    'banded',
    [501],
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
