/**
 * adp_i3_mttr — Mean Time to Recovery (MTTR).
 *
 * kind: "banded"
 * value: median recovery interval in hours (number), or null when no recovery events detected
 * band: one of "elite" | "high" | "medium" | "low" per standards.toml band.mttr
 * categories_awarded: [1103] when topology.has_incident_source is true
 * reliability_default: "not-reliable"
 *
 * This metric NEVER SKIPS. It always falls back to a git-proxy when no
 * incident data source is available. The proxy computes intervals between
 * consecutive revert/hotfix/rollback merge commits on the default branch.
 *
 * Reliability: the VALUE is always the git branch-lifetime proxy — no MTTR is
 * ever computed from incident data here — so reliability/confidence stay at
 * the proxy's minimal level ("not-reliable", low confidence, git-proxy note)
 * even when tracker.raw.incident_source is present. Declaring an incident
 * source gates category awarding (topology.has_incident_source), but it does
 * not make the proxy number any more trustworthy.
 *
 * DORA band thresholds (band.mttr in standards.toml):
 *   elite  → < 1 hour    (median_hours < 1)
 *   high   → < 1 day     (median_hours < 24)
 *   medium → < 1 week    (median_hours < 168)
 *   low    → >= 1 week   (median_hours >= 168)
 *
 * Source shapes:
 *   collectedDir/git.json     — always read (provides git-proxy via revert merge timestamps)
 *   collectedDir/tracker.json — read when present (incident_source field upgrades reliability)
 *
 * Git-proxy computation:
 *   1. The git collector stores merge_records as { merged_at, branch_first_commit_at }.
 *      Individual merge records do not carry type labels, so recovery-style merges
 *      cannot be isolated; we use a uniform proxy across all first-parent merges:
 *      the interval for each record (merged_at − branch_first_commit_at), which
 *      approximates "how long did this branch live before merging".
 *   2. Compute median of those intervals in hours.
 *
 * SKIP: never. Returns OK with null value when no merge records exist (minimal git history).
 */
import {
  appendReliabilityNote,
  awardCategories,
  makeMetricResult,
  readArtifact,
  trackerFetchNote,
  type MetricResult,
  type Reliability,
} from './_base.ts';
import { bandScore, clamp01, median } from './_score.ts';

const MTTR_ANCHORS = [
  { x: 0.1, y: 1.0 },
  { x: 1, y: 0.75 },
  { x: 24, y: 0.5 },
  { x: 168, y: 0.0 },
] as const;

/** Map median hours to a DORA MTTR band label. */
function mttrBand(medianHours: number): string {
  if (medianHours < 1) return 'elite';
  if (medianHours < 24) return 'high';
  if (medianHours < 168) return 'medium';
  return 'low';
}

interface MergeRecord {
  merged_at: string;
  branch_first_commit_at: string;
}

/**
 * Compute git-proxy MTTR intervals (hours) from merge records.
 *
 * Each merge record's interval = time from first branch commit to merge.
 * This approximates "how long it took to ship the fix/revert".
 */
function computeGitProxyIntervals(mergeRecords: MergeRecord[]): number[] {
  const intervals: number[] = [];
  for (const rec of mergeRecords) {
    const mergedAt = new Date(rec.merged_at);
    const firstCommit = new Date(rec.branch_first_commit_at);
    if (isNaN(mergedAt.getTime()) || isNaN(firstCommit.getTime())) continue;
    const diffMs = mergedAt.getTime() - firstCommit.getTime();
    if (diffMs < 0) continue;
    intervals.push(diffMs / 3_600_000); // ms → hours
  }
  return intervals;
}

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>
): MetricResult {
  // --- Load tracker (optional — only used for incident_source) ---
  let incidentSource: string | null = null;
  // Partial-fetch note for the tracker path (null when fetch_meta absent/complete).
  let trackerPartialNote: string | null = null;
  const trackerRead = readArtifact(collectedDir, 'tracker');
  if (!('error' in trackerRead)) {
    const trackerArtifact = trackerRead.artifact;
    if (trackerArtifact?.available && trackerArtifact?.raw?.incident_source) {
      incidentSource = trackerArtifact.raw.incident_source as string;
    }
    if (trackerArtifact?.available) {
      trackerPartialNote = trackerFetchNote(trackerArtifact?.raw);
    }
  }

  // --- Load git artifact (always required for proxy) ---
  const gitRead = readArtifact(collectedDir, 'git');
  if ('error' in gitRead) {
    // git.json missing/unreadable: git-proxy unavailable. Return OK with null
    // value (not SKIP — this metric never skips). Note: makeMetricResult sets
    // status=SKIP when sources_used=[], so we must include git even when
    // absent. incident_source presence does NOT upgrade reliability here —
    // there is no value at all, let alone one computed from incident data.
    if (incidentSource) {
      const categories = awardCategories(standards, 'adp_i3_mttr', topology);
      const reliability: Reliability = appendReliabilityNote(
        {
          tag: 'not-reliable',
          confidence: 'LOW',
          note: `incident source declared but MTTR is not computed from incident data; ${gitRead.error}`,
        },
        trackerPartialNote
      );
      return makeMetricResult(
        'adp_i3_mttr',
        null,
        'banded',
        categories,
        reliability,
        ['tracker'],
        ['git'],
        { score: 0, confidence: 0.0 }
      );
    }
    // Neither source present — but we must not SKIP. Return with git listed as
    // used to prevent SKIP status, but note data is unavailable.
    const reliability: Reliability = {
      tag: 'not-reliable',
      confidence: 'LOW',
      note: `git-proxy, true value may differ; ${gitRead.error}`,
    };
    return makeMetricResult(
      'adp_i3_mttr',
      null,
      'banded',
      [],
      reliability,
      ['git'],
      [],
      { score: 0, confidence: 0 }
    );
  }
  const raw = gitRead.artifact?.raw ?? {};
  const mergeRecords: MergeRecord[] = Array.isArray(raw.merge_records)
    ? (raw.merge_records as MergeRecord[])
    : [];

  // Compute git-proxy intervals from all merge records.
  const allIntervals = computeGitProxyIntervals(mergeRecords);
  const medianHours = median(allIntervals);

  // Build reliability. The value below is ALWAYS the git branch-lifetime
  // proxy, so the proxy's minimal reliability/confidence applies regardless
  // of incident-source presence — an upgrade is only justified once the value
  // is computed from real incident data, which never happens here.
  let reliability: Reliability;
  if (raw.window_stats?.merge_strategy === 'squash') {
    // Squash-merge workflow: merge_records holds only the rare true merge, so
    // the git proxy rests on unrepresentative residue. Contract says MTTR is
    // always included, so degrade confidence and say why instead of skipping.
    reliability = {
      tag: 'not-reliable',
      confidence: 'LOW',
      note: 'git-proxy over a squash-merge repo (merge records unrepresentative) — connect an incident source for a real MTTR',
    };
  } else {
    // Git-proxy only → not-reliable with explanatory note.
    reliability = {
      tag: 'not-reliable',
      confidence: allIntervals.length > 0 ? 'MED' : 'LOW',
      note: 'git-proxy, true value may differ',
    };
  }

  const band = medianHours !== null ? mttrBand(medianHours) : null;

  // Categories awarded only when topology has incident source flag.
  const categories = awardCategories(standards, 'adp_i3_mttr', topology);

  // Sources: git is always used. Tracker is also used when incident_source is present.
  const sourcesUsed = incidentSource ? ['git', 'tracker'] : ['git'];
  const sourcesMissing: string[] = [];

  // Tracker path: surface a partial tracker fetch in the reliability note.
  if (incidentSource) {
    reliability = appendReliabilityNote(reliability, trackerPartialNote);
  }

  const score =
    medianHours !== null
      ? clamp01(bandScore(medianHours, MTTR_ANCHORS, 'log'))
      : 0;
  const confidence = allIntervals.length > 0 ? 0.3 : 0.0;
  const expression =
    medianHours !== null
      ? `median ${medianHours.toFixed(1)}h MTTR (${band})`
      : 'no incident data';
  return makeMetricResult(
    'adp_i3_mttr',
    medianHours,
    'banded',
    categories,
    reliability,
    sourcesUsed,
    sourcesMissing,
    { band, expression, score, confidence }
  );
}
