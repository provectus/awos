/**
 * adp_g5_pr_cycle_time — PR/merge cycle time proxy (DORA banded).
 *
 * kind: "banded"
 * value: median PR cycle time in hours (merged_at − branch_first_commit_at)
 * band: one of "elite" | "high" | "medium" | "low" per DORA lead-time thresholds
 * categories_awarded: [501] when data is available
 * reliability_default: "not-reliable" (git approximation — branch_first_commit_at
 *   is the earliest commit on the merged branch, not the PR open time; PR open
 *   time is only available via code-host connectors). When tracker workflow
 *   history is present, the value is computed from real in-progress→done
 *   durations and confidence is HIGH.
 *
 * DORA band thresholds (same thresholds as lead_time_for_change):
 *   elite  → < 1 day    (< 24 hours)
 *   high   → < 1 week   (< 168 hours)
 *   medium → < 1 month  (< 720 hours)
 *   low    → >= 1 month (>= 720 hours)
 *
 * Source shapes:
 *   collectedDir/tracker.json — preferred when tickets carry workflow history:
 *     tickets with BOTH in_progress_at and resolved_at yield real
 *     in-progress→done durations (median hours), replacing the git proxy.
 *   collectedDir/git.json — fallback proxy:
 *     merge_records (Array<{ merged_at: string; branch_first_commit_at: string }>)
 *
 * SKIP: if no tracker workflow history is available AND git.json is absent
 * or merge_records is empty.
 */
import {
  computeReliability,
  makeMetricResult,
  readArtifact,
  skipReliability,
  type MetricResult,
  type Reliability,
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
export function doraCycleTimeBand(hours: number): string {
  if (hours < 24) return 'elite';
  if (hours < 168) return 'high';
  if (hours < 720) return 'medium';
  return 'low';
}

/**
 * Compute in-progress→done durations (hours) from tracker tickets that carry
 * BOTH in_progress_at and resolved_at (changelog-derived workflow history —
 * see references/connector-shapes.md). Returns [] when the tracker artifact
 * is absent/unavailable or no ticket has usable timestamps.
 */
function trackerCycleTimesHours(collectedDir: string): number[] {
  const read = readArtifact(collectedDir, 'tracker');
  if ('error' in read) return [];
  const artifact = read.artifact;
  if (!artifact?.available) return [];
  const tickets: Array<Record<string, unknown>> = Array.isArray(
    artifact?.raw?.tickets
  )
    ? artifact.raw.tickets
    : [];
  const hours: number[] = [];
  for (const ticket of tickets) {
    if (
      typeof ticket['in_progress_at'] !== 'string' ||
      typeof ticket['resolved_at'] !== 'string'
    ) {
      continue;
    }
    const started = new Date(ticket['in_progress_at']).getTime();
    const resolved = new Date(ticket['resolved_at']).getTime();
    if (isNaN(started) || isNaN(resolved)) continue;
    const diffHours = (resolved - started) / 3_600_000;
    if (diffHours >= 0) hours.push(diffHours);
  }
  return hours;
}

export function compute(
  collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  // Preferred source: real workflow history from the tracker connector.
  // When tickets carry in_progress_at + resolved_at, the median
  // in-progress→done duration replaces the git branch-lifetime proxy.
  const trackerHours = trackerCycleTimesHours(collectedDir);
  if (trackerHours.length > 0) {
    trackerHours.sort((a, b) => a - b);
    const medianHours = median(trackerHours);
    const band = doraCycleTimeBand(medianHours);
    const score = clamp01(bandScore(medianHours, CYCLE_TIME_ANCHORS, 'log'));
    const reliability: Reliability = {
      tag: 'not-reliable',
      confidence: 'HIGH',
      note: 'in-progress→done durations from tracker workflow history',
    };
    const expression = `median ${medianHours.toFixed(1)}h cycle time from ${trackerHours.length} tracker ticket${trackerHours.length !== 1 ? 's' : ''} (${band})`;
    return makeMetricResult(
      'adp_g5_pr_cycle_time',
      medianHours,
      'banded',
      [501],
      reliability,
      ['tracker'],
      [],
      band,
      undefined,
      expression,
      score,
      1.0
    );
  }

  // Fallback: git branch-lifetime proxy.
  const read = readArtifact(collectedDir, 'git');
  if ('error' in read) {
    return makeMetricResult(
      'adp_g5_pr_cycle_time',
      null,
      'banded',
      [],
      skipReliability('not-reliable', 'git', read.error),
      [],
      ['git']
    );
  }

  const raw = read.artifact?.raw;
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

  // Squash/rebase-merge workflows produce no merge commits, so merge_records
  // is empty or unrepresentative (only the rare true merge). Reporting a
  // confident number from that residue would mis-measure a healthy repo.
  if (raw.window_stats?.merge_strategy === 'squash') {
    return makeMetricResult(
      'adp_g5_pr_cycle_time',
      null,
      'banded',
      [],
      {
        tag: 'not-reliable',
        confidence: 'LOW',
        note: 'squash-merge workflow: no branch merge records in git — connect a code-host connector (PR API) to measure this',
      },
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

  const score = clamp01(bandScore(medianHours, CYCLE_TIME_ANCHORS, 'log'));
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
