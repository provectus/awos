/**
 * pr_cycle_time — PR/merge cycle time proxy (DORA banded).
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
 * Source shapes (in preference order):
 *   collectedDir/code_host.json — the real thing: merged-PR records with
 *     created_at → merged_at, the literal PR open→merge duration. Works for
 *     every merge strategy, including squash.
 *   collectedDir/tracker.json — when tickets carry workflow history:
 *     tickets with BOTH in_progress_at and resolved_at yield real
 *     in-progress→done durations (median hours), replacing the git proxy.
 *   collectedDir/git.json — fallback proxy:
 *     merge_records (Array<{ merged_at: string; branch_first_commit_at: string }>)
 *
 * SKIP: if no code-host PR data, no tracker workflow history is available,
 * AND git.json is absent or merge_records is empty.
 */
import {
  appendReliabilityNote,
  computeReliability,
  makeMetricResult,
  readArtifact,
  skipMetric,
  SQUASH_MERGE_NOTE,
  trackerFetchNote,
  type MetricResult,
  type Reliability,
} from './_base.ts';
import { readCodeHostPrs } from './_code_host.ts';
import { median, scoreFromConfig, scoringFor } from './_score.ts';

interface MergeRecord {
  merged_at: string;
  branch_first_commit_at: string;
}

/** Map median cycle-time hours to a DORA band label. */
function doraCycleTimeBand(hours: number): string {
  if (hours < 24) return 'elite';
  if (hours < 168) return 'high';
  if (hours < 720) return 'medium';
  return 'low';
}

/** What the tracker artifact yields for cycle-time purposes. */
interface TrackerCycleRead {
  /** Tracker artifact present and available=true. */
  available: boolean;
  /** Number of tickets in the artifact (0 when unavailable). */
  ticketCount: number;
  /** in-progress→done durations (hours) — empty when no ticket has usable timestamps. */
  hours: number[];
  /** The artifact's raw block (for fetch_meta), null when unavailable. */
  raw: unknown;
}

/**
 * Read the tracker artifact and compute in-progress→done durations (hours)
 * from tickets that carry BOTH in_progress_at and resolved_at
 * (changelog-derived workflow history — see references/connector-shapes.md).
 * `hours` is empty when the artifact is absent/unavailable or no ticket has
 * usable timestamps; `available`/`ticketCount` distinguish "no tracker" from
 * "tracker connected but status-transition history not fetched".
 */
function readTrackerCycle(collectedDir: string): TrackerCycleRead {
  const empty: TrackerCycleRead = {
    available: false,
    ticketCount: 0,
    hours: [],
    raw: null,
  };
  const read = readArtifact(collectedDir, 'tracker');
  if ('error' in read) return empty;
  const artifact = read.artifact;
  if (!artifact?.available) return empty;
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
  return {
    available: true,
    ticketCount: tickets.length,
    hours,
    raw: artifact?.raw ?? null,
  };
}

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  _topology: Record<string, boolean>
): MetricResult {
  // Preferred source: the code-host connector — created_at → merged_at is the
  // literal PR open→merge duration this metric is defined as, with no proxy.
  const codeHost = readCodeHostPrs(collectedDir);
  const prCycleTimes = codeHost.prs
    .map((p) =>
      p.mergedMs !== null && p.createdMs !== null
        ? (p.mergedMs - p.createdMs) / 3_600_000
        : null
    )
    .filter((h): h is number => h !== null && h >= 0);
  if (prCycleTimes.length > 0) {
    const medianHours = median(prCycleTimes)!;
    const band = doraCycleTimeBand(medianHours);
    // Score curve lives in standards.toml [category.pr_cycle_time.scoring].
    const score = scoreFromConfig(
      medianHours,
      scoringFor(standards, 'pr_cycle_time')
    );
    const reliability = computeReliability('maximal', ['code_host'], []);
    const expression = `median ${medianHours.toFixed(1)}h PR open→merge over ${prCycleTimes.length} merged PR${prCycleTimes.length !== 1 ? 's' : ''} from the code host (${band})`;
    return makeMetricResult(
      'pr_cycle_time',
      medianHours,
      'banded',
      [501],
      reliability,
      ['code_host'],
      [],
      { band, expression, score, confidence: 1.0 }
    );
  }

  // Next: real workflow history from the tracker connector.
  // When tickets carry in_progress_at + resolved_at, the median
  // in-progress→done duration replaces the git branch-lifetime proxy.
  const tracker = readTrackerCycle(collectedDir);
  if (tracker.hours.length > 0) {
    const medianHours = median(tracker.hours)!;
    const band = doraCycleTimeBand(medianHours);
    const score = scoreFromConfig(
      medianHours,
      scoringFor(standards, 'pr_cycle_time')
    );
    const reliability: Reliability = appendReliabilityNote(
      {
        tag: 'not-reliable',
        confidence: 'HIGH',
        note: 'in-progress→done durations from tracker workflow history',
      },
      trackerFetchNote(tracker.raw)
    );
    const ticketCount = tracker.hours.length;
    const expression = `median ${medianHours.toFixed(1)}h cycle time from ${ticketCount} tracker ticket${ticketCount !== 1 ? 's' : ''} (${band})`;
    return makeMetricResult(
      'pr_cycle_time',
      medianHours,
      'banded',
      [501],
      reliability,
      ['tracker'],
      [],
      { band, expression, score, confidence: 1.0 }
    );
  }

  // Fallback: git branch-lifetime proxy.
  const read = readArtifact(collectedDir, 'git');
  if ('error' in read) {
    return skipMetric(
      'pr_cycle_time',
      'banded',
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
    return skipMetric('pr_cycle_time', 'banded', 'not-reliable', 'git');
  }

  // Squash/rebase-merge workflows produce no merge commits, so merge_records
  // is empty or unrepresentative (only the rare true merge). Reporting a
  // confident number from that residue would mis-measure a healthy repo.
  // The SKIP reason must be precise about which source is missing what:
  // a tracker that IS connected but whose tickets carry no in_progress_at
  // means the per-ticket status-transition history (changelog) was never
  // fetched — that is not "needs a connector".
  if (raw.window_stats?.merge_strategy === 'squash') {
    const note =
      tracker.available && tracker.ticketCount > 0
        ? 'squash-merge workflow: no branch merge records in git; tracker connected but tickets lack per-ticket status-transition history (changelog not fetched) — fetch ticket changelogs (or connect a code-host PR API) to measure cycle time'
        : tracker.available
          ? 'squash-merge workflow: no branch merge records in git; tracker connected but returned no tickets — connect a code-host connector (PR API) or fetch tracker tickets with status-transition history to measure this'
          : SQUASH_MERGE_NOTE;
    return makeMetricResult(
      'pr_cycle_time',
      null,
      'banded',
      [],
      appendReliabilityNote(
        {
          tag: 'not-reliable',
          confidence: 'LOW',
          note,
        },
        trackerFetchNote(tracker.raw)
      ),
      [],
      ['git']
    );
  }

  // If window_stats.window_start is available, restrict to in-window merges
  // only — mirrors lead_time_for_change exactly. When absent/null (older artifact
  // or empty repo), fall back to all records so existing fixtures and
  // pre-window audits continue to produce results. Compare by epoch-ms, not
  // ISO string: merged_at carries the committer's LOCAL timezone offset while
  // window_start is UTC — lexicographic compare is not chronological.
  const windowStart: string | null = raw.window_stats?.window_start ?? null;
  let records: MergeRecord[] = raw.merge_records;
  if (windowStart) {
    const windowStartMs = new Date(windowStart).getTime();
    records = records.filter(
      (r) => new Date(r.merged_at).getTime() >= windowStartMs
    );
  }

  // Compute cycle times in hours for each (in-window) merge record.
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
    return skipMetric('pr_cycle_time', 'banded', 'not-reliable', 'git');
  }

  const medianHours = median(cycleTimesHours)!;
  const band = doraCycleTimeBand(medianHours);

  // Reliability is "not-reliable" — git approximation: branch_first_commit_at
  // is the earliest commit on the merged branch, not the PR open time.
  // True PR cycle time requires a code-host connector (GitHub/GitLab API).
  const reliability = computeReliability('not-reliable', ['git'], []);

  const score = scoreFromConfig(
    medianHours,
    scoringFor(standards, 'pr_cycle_time')
  );
  const windowLabel = windowStart ? ' (in-window)' : '';
  const expression = `median ${medianHours.toFixed(1)}h cycle time over ${cycleTimesHours.length} merge${cycleTimesHours.length !== 1 ? 's' : ''}${windowLabel} (${band})`;
  return makeMetricResult(
    'pr_cycle_time',
    medianHours,
    'banded',
    [501],
    reliability,
    ['git'],
    [],
    { band, expression, score, confidence: 1.0 }
  );
}
