/**
 * ticket_subtask_split — Ticket sub-task split ratio (over-splitting is a negative signal).
 *
 * kind: "banded"
 * value: avg subtasks per parent ticket (number), or null
 * band: "good" (≤3) | "watch" (≤6) | "concerning" (>6)
 * categories_awarded: [1104] when topology.has_tracker is true and subtask data available
 * reliability_default: "minimal"
 *
 * Rationale (INVEST / context-switching):
 *   The INVEST acronym (Independent, Negotiable, Valuable, Estimable, Small, Testable)
 *   originated in Bill Wake's 2003 article and remains the canonical reference for
 *   right-sizing stories. The "Small" constraint is intentional but bounded: a story
 *   should be small enough to ship within a sprint yet large enough to deliver
 *   independent value. When an AI agent auto-splits a ticket into many fine-grained
 *   sub-tasks — each potentially assigned to a different role — it departs from INVEST
 *   "Small" and introduces measurable coordination overhead: context-switching cost,
 *   increased hand-off latency, and blocked work chains. Research on multitasking
 *   cost (Rubinstein et al. 2001; Gerald Weinberg's "Quality Software Management") and
 *   DORA's flow-efficiency metrics (2019–2025 reports) all confirm that fragmentation
 *   harms throughput.
 *
 *   Band thresholds are AWOS heuristics — DORA and INVEST publish no numeric subtask
 *   threshold. Disclose this wherever the metric is presented.
 *     ≤3  → "good"        well-scoped, manageable decomposition
 *     ≤6  → "watch"       moderate decomposition, monitor for coordination cost
 *     >6  → "concerning"  likely over-splitting; coordination cost signal
 *
 * Score curve: standards.toml [category.ticket_subtask_split.scoring]
 *   (linear piecewise interpolation over the declared anchors).
 *   The first anchor is a PLATEAU: bandScore clamps values left of it to its
 *   y, so any avg ≤ 1 subtask/parent scores a full 1.0. A point-anchor at
 *   x=0 made a perfect score unreachable in practice — one subtask anywhere
 *   in the tracker pushed the average above 0 and branded a healthy project
 *   PARTIAL forever.
 *
 * Averaging denominator: all parent-eligible tickets — every ticket that is
 * not itself a sub-task (no `parent`), including those with zero sub-tasks
 * (missing subtask_count on a parent-eligible ticket counts as 0). This keeps
 * the full-score plateau reachable and stops one over-split epic from
 * dominating the mean.
 *
 * SKIP conditions:
 *   - tracker.json absent or unreadable
 *   - tracker.json available === false (no connector provided)
 *   - raw.tickets absent or empty
 *   - no ticket carries a numeric subtask_count (field not mapped by the connector)
 *   - no parent-eligible ticket in the window (every ticket is a sub-task)
 *
 * Source shape: collectedDir/tracker.json
 * Input raw field: tickets[].subtask_count (number, optional)
 *
 * @see https://agilealliance.org/glossary/invest/  (Bill Wake, 2003)
 */
import {
  appendReliabilityNote,
  awardCategories,
  clampToWindow,
  computeReliability,
  lookbackDays,
  makeMetricResult,
  readArtifact,
  skipMetric,
  trackerFetchNote,
  type MetricResult,
} from './_base.ts';
import { mean, scoreFromConfig, scoringFor } from './_score.ts';

/** Map avg subtasks per parent to a band label. */
function subtaskBand(avg: number): 'good' | 'watch' | 'concerning' {
  if (avg <= 3) return 'good';
  if (avg <= 6) return 'watch';
  return 'concerning';
}

/** Best-effort ticket timestamp for window clamping (resolution, else creation). */
function ticketTimestamp(t: Record<string, unknown>): unknown {
  return t['resolved_at'] ?? t['created_at'] ?? t['updated_at'];
}

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>
): MetricResult {
  const read = readArtifact(collectedDir, 'tracker');

  // Tracker source file absent → SKIP.
  if ('error' in read) {
    return skipMetric(
      'ticket_subtask_split',
      'banded',
      'minimal',
      'tracker',
      read.error
    );
  }

  const artifact = read.artifact;

  // available=false means no tracker connector was provided.
  if (!artifact?.available) {
    return skipMetric('ticket_subtask_split', 'banded', 'minimal', 'tracker');
  }

  const raw = artifact?.raw ?? {};
  // Clamp the fetched tickets to the audit window (anchored to the newest
  // ticket timestamp) — an over-fetched tracker window must not leak older
  // history into the metric.
  const tickets: Array<Record<string, unknown>> = clampToWindow(
    Array.isArray(raw.tickets)
      ? (raw.tickets as Array<Record<string, unknown>>)
      : [],
    lookbackDays(standards),
    ticketTimestamp
  ).kept;

  // No ticket in the window carries subtask data at all → the connector did
  // not map the field; SKIP rather than guess. (An explicit subtask_count of
  // 0 counts as data.)
  const hasSubtaskData = tickets.some(
    (t) => typeof t['subtask_count'] === 'number'
  );
  if (!hasSubtaskData) {
    // The tracker IS connected — the generic "missing sources: tracker" SKIP
    // reason would misreport a field-mapping gap as a missing connector.
    return makeMetricResult(
      'ticket_subtask_split',
      null,
      'banded',
      [],
      {
        tag: 'minimal',
        confidence: 'LOW',
        note:
          `tracker connected (${tickets.length} tickets) but none carries subtask_count — ` +
          `the fetch did not map sub-task counts; map issue.fields.subtasks.length per ` +
          `connector-shapes.md to measure this`,
      },
      [],
      ['tracker']
    );
  }

  // Parent-eligible tickets: every ticket that is not itself a sub-task
  // (no parent key), INCLUDING those with zero sub-tasks — a missing
  // subtask_count on a parent-eligible ticket means 0. Averaging over
  // only tickets with subtask_count > 0 would floor the mean at ≥1 (the
  // {x:0} anchor unreachable) and let a single over-split epic dominate.
  const parents = tickets.filter((t) => t['parent'] == null);
  if (parents.length === 0) {
    return makeMetricResult(
      'ticket_subtask_split',
      null,
      'banded',
      [],
      {
        tag: 'minimal',
        confidence: 'LOW',
        note: 'tracker connected, but every fetched ticket is itself a sub-task — no parent-eligible ticket in the window to average over',
      },
      [],
      ['tracker']
    );
  }

  const avgSubtasks = mean(
    parents.map((t) =>
      typeof t['subtask_count'] === 'number'
        ? (t['subtask_count'] as number)
        : 0
    )
  );
  const band = subtaskBand(avgSubtasks);
  // Score curve lives in standards.toml [category.ticket_subtask_split.scoring].
  const score = scoreFromConfig(
    avgSubtasks,
    scoringFor(standards, 'ticket_subtask_split')
  );

  const categories = awardCategories(
    standards,
    'ticket_subtask_split',
    topology
  );
  // Surface a partial tracker fetch (fetch_meta) in the reliability note.
  const reliability = appendReliabilityNote(
    computeReliability('minimal', ['tracker'], []),
    trackerFetchNote(raw)
  );

  const expression =
    `${parents.length} parent ticket${parents.length === 1 ? '' : 's'} ` +
    `avg ${avgSubtasks.toFixed(1)} subtask${avgSubtasks !== 1 ? 's' : ''} each = ${band} ` +
    `(over-splitting signal; bands are AWOS heuristics, no published numeric threshold)`;

  return makeMetricResult(
    'ticket_subtask_split',
    avgSubtasks,
    'banded',
    categories,
    reliability,
    ['tracker'],
    [],
    { band, expression, score, confidence: 1.0 }
  );
}
