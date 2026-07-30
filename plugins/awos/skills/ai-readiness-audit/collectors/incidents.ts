/**
 * incidents — external incident source collector (connector-passed).
 *
 * Mirrors the tracker/ci/docs collectors: it does not reach out to a service
 * itself. The orchestrator fetches incidents from whatever real incident source
 * the project uses — a dedicated tool (PagerDuty / OpsGenie / incident.io), a
 * status page (Statuspage / Atlassian), or code-host issues labelled as
 * incidents (GitHub/GitLab) — normalises them to `IncidentRecord`s, and passes
 * them here (see references/connector-shapes.md). Without a connector the
 * artifact is `available: false`, so the MTTR metric falls back to its git
 * proxy and category 1103 stays SKIP.
 *
 * The measured signal is real recovery time: for each resolved incident,
 * resolved_at − started_at. The MTTR metric reports the median of those.
 */
import { makeArtifact, type Period } from './_base.ts';

/** One incident, normalised from whatever source the orchestrator fetched. */
export interface IncidentRecord {
  id: string;
  /** ISO 8601 — when the incident was opened/detected. */
  started_at: string;
  /** ISO 8601 — when service was restored; omit/null for still-open incidents. */
  resolved_at?: string | null;
  /** Optional severity label, verbatim from the source (e.g. "SEV1", "critical"). */
  severity?: string | null;
  /** Which source this came from, e.g. "pagerduty", "github-label:incident". */
  source?: string | null;
}

export interface IncidentsConnector {
  incidents?: IncidentRecord[];
  /** Human label of the source for the report, e.g. "PagerDuty", "GitHub incident labels". */
  source_label?: string | null;
}

export interface IncidentsRaw {
  incidents: IncidentRecord[];
  count: number;
  /** Incidents with a valid started→resolved span (the only ones MTTR can measure). */
  resolved_count: number;
  /** Median recovery time in hours over resolved incidents; null when none. */
  median_duration_hours: number | null;
  source_label: string | null;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Recovery time in hours for a resolved incident, or null when unmeasurable. */
function durationHours(inc: IncidentRecord): number | null {
  if (!inc.resolved_at) return null;
  const start = Date.parse(inc.started_at);
  const end = Date.parse(inc.resolved_at);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return (end - start) / 3_600_000;
}

export function collect(
  _repoPath: string,
  period: Period,
  connector?: IncidentsConnector
) {
  if (connector === undefined || connector === null) {
    return makeArtifact(
      'incidents',
      false,
      'no incident source connected; supply a PagerDuty/OpsGenie/incident.io, Statuspage, or code-host incident-label connector to measure MTTR from real incidents',
      period,
      {} as IncidentsRaw
    );
  }

  const incidents = connector.incidents ?? [];
  const durations = incidents
    .map(durationHours)
    .filter((d): d is number => d !== null);

  const raw: IncidentsRaw = {
    incidents,
    count: incidents.length,
    resolved_count: durations.length,
    median_duration_hours: median(durations),
    source_label: connector.source_label ?? null,
  };
  return makeArtifact('incidents', true, null, period, raw);
}
