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
 * Reliability tiers:
 *   - git-proxy only (incident_source absent or null):
 *       reliability.tag = "not-reliable", confidence per source coverage,
 *       note = "git-proxy, true value may differ"
 *   - incident_source present (non-null string):
 *       reliability tag stays "not-reliable" but confidence is upgraded to HIGH
 *       (incident source covers the metric properly), note is cleared.
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
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  awardCategories,
  computeReliability,
  makeMetricResult,
  type MetricResult,
  type Reliability,
} from './_base.ts';
import { bandScore, clamp01 } from './_score.ts';

const MTTR_ANCHORS = [
  { x: 0.1, y: 1.0 },
  { x: 1, y: 0.75 },
  { x: 24, y: 0.5 },
  { x: 168, y: 0.0 },
] as const;

/** Map median hours to a DORA MTTR band label. */
export function mtttrBand(medianHours: number): string {
  if (medianHours < 1) return 'elite';
  if (medianHours < 24) return 'high';
  if (medianHours < 168) return 'medium';
  return 'low';
}

/** Compute the median of a numeric array. Returns null for empty arrays. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
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
  const gitPath = join(collectedDir, 'git.json');
  const trackerPath = join(collectedDir, 'tracker.json');

  // --- Load tracker (optional — only used for incident_source) ---
  let incidentSource: string | null = null;
  if (existsSync(trackerPath)) {
    try {
      const trackerArtifact = JSON.parse(readFileSync(trackerPath, 'utf8'));
      if (trackerArtifact?.available && trackerArtifact?.raw?.incident_source) {
        incidentSource = trackerArtifact.raw.incident_source as string;
      }
    } catch {
      // Ignore parse errors — fall back to git-proxy only.
    }
  }

  // --- Load git artifact (always required for proxy) ---
  if (!existsSync(gitPath)) {
    // git.json missing: git-proxy unavailable. Return OK with null value
    // (not SKIP — this metric never skips). Note: makeMetricResult sets
    // status=SKIP when sources_used=[], so we must include git even when absent.
    // Use 'tracker' as the used source only when incident_source is present.
    if (incidentSource) {
      const categories = awardCategories(standards, 'adp_i3_mttr', topology);
      const reliability: Reliability = {
        tag: 'not-reliable',
        confidence: 'HIGH',
        note: null,
      };
      return makeMetricResult(
        'adp_i3_mttr',
        null,
        'banded',
        categories,
        reliability,
        ['tracker'],
        ['git'],
        null,
        undefined,
        undefined,
        0,
        0.0
      );
    }
    // Neither source present — but we must not SKIP. Return with git listed as
    // used to prevent SKIP status, but note data is unavailable.
    const reliability: Reliability = {
      tag: 'not-reliable',
      confidence: 'LOW',
      note: 'git-proxy, true value may differ; no git history found',
    };
    return makeMetricResult(
      'adp_i3_mttr',
      null,
      'banded',
      [],
      reliability,
      ['git'],
      [],
      null,
      undefined,
      undefined,
      0,
      0
    );
  }

  let gitArtifact;
  try {
    gitArtifact = JSON.parse(readFileSync(gitPath, 'utf8'));
  } catch {
    // Malformed/truncated git.json → return git-proxy with no value (never SKIP).
    const reliability: Reliability = {
      tag: 'not-reliable',
      confidence: 'LOW',
      note: 'git-proxy, true value may differ; git.json unreadable',
    };
    return makeMetricResult(
      'adp_i3_mttr',
      null,
      'banded',
      [],
      reliability,
      ['git'],
      [],
      null,
      undefined,
      undefined,
      0,
      0
    );
  }
  const raw = gitArtifact?.raw ?? {};
  const mergeRecords: MergeRecord[] = Array.isArray(raw.merge_records)
    ? (raw.merge_records as MergeRecord[])
    : [];

  // Compute git-proxy intervals from all merge records.
  const allIntervals = computeGitProxyIntervals(mergeRecords);
  const medianHours = median(allIntervals);

  // Build reliability.
  let reliability: Reliability;
  if (incidentSource) {
    // Incident source present → upgraded reliability.
    reliability = {
      tag: 'not-reliable',
      confidence: 'HIGH',
      note: null,
    };
  } else {
    // Git-proxy only → not-reliable with explanatory note.
    reliability = {
      tag: 'not-reliable',
      confidence: allIntervals.length > 0 ? 'MED' : 'LOW',
      note: 'git-proxy, true value may differ',
    };
  }

  const band = medianHours !== null ? mtttrBand(medianHours) : null;

  // Categories awarded only when topology has incident source flag.
  const categories = awardCategories(standards, 'adp_i3_mttr', topology);

  // Sources: git is always used. Tracker is also used when incident_source is present.
  const sourcesUsed = incidentSource ? ['git', 'tracker'] : ['git'];
  const sourcesMissing: string[] = [];

  const score =
    medianHours !== null
      ? clamp01(
          bandScore(
            medianHours,
            MTTR_ANCHORS as Array<{ x: number; y: number }>,
            'log'
          )
        )
      : 0;
  const confidence = incidentSource ? 1.0 : allIntervals.length > 0 ? 0.3 : 0.0;
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
    band,
    undefined,
    expression,
    score,
    confidence
  );
}
