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
 * resolved_at − started_at. The engine — not the orchestrator — derives the
 * median: `deriveIncidentAggregates` is the one place that computes it, shared
 * by this collector, the MTTR metric, and the topology gate. That mirrors the
 * tracker collector, whose metrics derive their aggregates from `raw.tickets[]`
 * rather than trusting a hand-written count, so an orchestrator arithmetic slip
 * can never become a "measured" DORA number.
 */
import { clampToWindow, makeArtifact, median, type Period } from './_base.ts';

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
  /** Resolved incidents whose span could not be parsed (bad/zero/reversed timestamps). */
  invalid_count: number;
  /** Median recovery time in hours over resolved incidents; null when none. */
  median_duration_hours: number | null;
  /** Incidents dropped for starting before the audit window (see the clamp). */
  dropped_out_of_window: number;
  source_label: string | null;
}

/**
 * Recovery time in hours for a resolved incident, or null when unmeasurable.
 * A record with no `resolved_at` is still open (not invalid). A record WITH a
 * `resolved_at` but an unparseable, reversed, or zero-length span is invalid —
 * `end <= start` is rejected so an auto-resolved alert flap (a 0h span) cannot
 * band "elite".
 */
export function durationHours(inc: IncidentRecord): number | null {
  if (inc.resolved_at == null || inc.resolved_at === '') return null;
  const start = Date.parse(inc.started_at ?? '');
  const end = Date.parse(inc.resolved_at);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return (end - start) / 3_600_000;
}

/**
 * Clamp incidents to the audit window. Thin wrapper over the shared generic
 * `clampToWindow` — it inherits the newest-record anchor, the keep-unparseable
 * contract, and the no-window-no-clamp short-circuit, along with the tests
 * that pin all three.
 */
export function clampIncidentsToWindow(
  incidents: IncidentRecord[],
  lookbackDays?: number | null
): { kept: IncidentRecord[]; dropped: number } {
  return clampToWindow(incidents, lookbackDays, (inc) => inc.started_at);
}

export interface IncidentAggregates extends IncidentsRaw {
  /** In-window incidents kept after the window clamp. */
  incidents: IncidentRecord[];
}

/**
 * The single deterministic derivation of the MTTR aggregates from raw incident
 * records. Clamps to the window, then over the in-window incidents: counts
 * resolved-with-a-measurable-span, counts resolved-but-unmeasurable
 * (`invalid_count`), and takes the median span. Shared by the collector, the
 * MTTR metric, and the topology gate so the awarded category and the reported
 * value can never diverge.
 */
export function deriveIncidentAggregates(
  incidents: IncidentRecord[] | undefined | null,
  lookbackDays?: number | null
): IncidentAggregates {
  const all = Array.isArray(incidents) ? incidents : [];
  const { kept, dropped } = clampIncidentsToWindow(all, lookbackDays);
  const durations: number[] = [];
  let invalid = 0;
  for (const inc of kept) {
    if (inc.resolved_at == null || inc.resolved_at === '') continue; // still open
    const d = durationHours(inc);
    if (d === null) invalid++;
    else durations.push(d);
  }
  return {
    incidents: kept,
    count: kept.length,
    resolved_count: durations.length,
    invalid_count: invalid,
    median_duration_hours: median(durations),
    source_label: null,
    dropped_out_of_window: dropped,
  };
}

/**
 * Whether an incidents artifact carries at least one measurable recovery span
 * within the window — the predicate that gates category 1103. Shared by the
 * topology gate and the MTTR metric so "awarded" and "measured" stay in lock
 * step.
 */
export function hasMeasurableIncidents(
  incidents: IncidentRecord[] | undefined | null,
  lookbackDays?: number | null
): boolean {
  return deriveIncidentAggregates(incidents, lookbackDays).resolved_count > 0;
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

  const agg = deriveIncidentAggregates(
    connector.incidents,
    period.lookback_days
  );
  const raw: IncidentsRaw = {
    incidents: agg.incidents,
    count: agg.count,
    resolved_count: agg.resolved_count,
    invalid_count: agg.invalid_count,
    median_duration_hours: agg.median_duration_hours,
    dropped_out_of_window: agg.dropped_out_of_window,
    source_label: connector.source_label ?? null,
  };
  return makeArtifact('incidents', true, null, period, raw);
}
