import { makeArtifact, type Period } from './_base.ts';

// ---------------------------------------------------------------------------
// Connector shape
// ---------------------------------------------------------------------------

/** Work-item / ticket record as returned by a project tracker (Jira, Linear, etc.). */
export interface TicketRecord {
  id: string;
  type?: string;
  status?: string;
  created_at?: string;
  resolved_at?: string;
  /** Count of direct sub-tasks (e.g. Jira issue.fields.subtasks.length). Used by ADP-12. */
  subtask_count?: number;
  /** Parent ticket key (e.g. Jira issue.fields.parent?.key). Used by ADP-12. */
  parent?: string | null;
  /** Character count of the ticket description (size/structure signal only — no raw text). Used by ADP-13. */
  description_length?: number;
  /** Whether the ticket body contains acceptance criteria (structure signal only — no raw text). Used by ADP-13. */
  has_acceptance_criteria?: boolean;
  [key: string]: unknown;
}

/** Connector passed in by the caller when a project tracker integration is
 *  available. `incident_source` is optional and purely a provenance label: it
 *  names the incident system, but does not upgrade MTTR reliability and does
 *  not award category 1103. Only a measurable recovery span in the incidents
 *  artifact does that (see collectors/incidents.ts). */
export interface TrackerConnector {
  tickets?: TicketRecord[];
  /** Provenance label naming the incident-management system (e.g. "pagerduty",
   *  "opsgenie"). It does not feed the MTTR value — that comes from
   *  collected/incidents.json — and its absence changes nothing. */
  incident_source?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Raw shape
// ---------------------------------------------------------------------------

export interface TrackerRaw {
  /** All ticket records from the connector within the period. */
  tickets: TicketRecord[];
  /** Breakdown of tickets by type (e.g. { bug: 3, feature: 12 }). Used by
   *  work-mix metric (work_mix_allocation). */
  type_counts: Record<string, number>;
  /** Total tickets resolved during the period (throughput, issue_throughput). */
  resolved_count: number;
  /** Provenance label for the incident-management system, echoed from the
   *  connector. Reported, never scored: it upgrades no reliability and awards
   *  no category. 1103 gates on topology.has_incident_source, which reads the
   *  incidents artifact. */
  incident_source: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Exported for the metric-side fallback: orchestrator-written tracker
 * artifacts carry only `tickets[]` (per connector-shapes.md), so the metrics
 * derive these aggregates themselves when the CLI-collect path didn't. */
export function buildTypeCounts(
  tickets: TicketRecord[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of tickets) {
    const key = (t.type ?? 'unknown').toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Exported for the metric-side fallback (see buildTypeCounts). */
export function countResolved(tickets: TicketRecord[]): number {
  return tickets.filter(
    (t) => t.status?.toLowerCase() === 'done' || t.resolved_at != null
  ).length;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect issue-tracker data for a repository.
 *
 * Availability rules:
 * - `available=false` when no connector is provided (a tracker cannot be
 *   inferred from the local filesystem alone).
 * - `available=true` when a connector object is passed (even if empty).
 *
 * MTTR note: the `incident_source` field in `raw` is always populated from
 * the connector (or set to null). It is a provenance label and nothing more —
 * it neither upgrades MTTR reliability nor awards category 1103, and it never
 * gates the metric. A measured MTTR comes only from collected/incidents.json
 * carrying at least one resolved recovery span; otherwise the metric reports
 * its git branch-lifetime proxy and 1103 stays SKIP.
 */
export function collect(
  _repoPath: string,
  period: Period,
  connector?: TrackerConnector
) {
  if (connector === undefined || connector === null) {
    return makeArtifact(
      'tracker',
      false,
      'no tracker connector provided; supply a Jira/Linear/GitHub Issues connector to enable work-mix and throughput metrics',
      { ...period, history_available_days: period.history_available_days },
      {} as TrackerRaw
    );
  }

  const tickets: TicketRecord[] = connector.tickets ?? [];
  const incident_source: string | null = connector.incident_source ?? null;

  const raw: TrackerRaw = {
    tickets,
    type_counts: buildTypeCounts(tickets),
    resolved_count: countResolved(tickets),
    incident_source,
  };

  return makeArtifact('tracker', true, null, period, raw);
}
