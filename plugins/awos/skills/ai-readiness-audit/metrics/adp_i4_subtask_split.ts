/**
 * adp_i4_subtask_split — Ticket sub-task split ratio (over-splitting is a negative signal).
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
 * Score anchors (linear piecewise interpolation):
 *   ANCHORS = [{x:0,y:1},{x:3,y:0.8},{x:6,y:0.4},{x:10,y:0}]
 *   score = clamp01(bandScore(avg, ANCHORS, 'linear'))
 *
 * Averaging denominator: all parent-eligible tickets — every ticket that is
 * not itself a sub-task (no `parent`), including those with zero sub-tasks
 * (missing subtask_count on a parent-eligible ticket counts as 0). This keeps
 * the {x:0, y:1} anchor reachable and stops one over-split epic from
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
  computeReliability,
  makeMetricResult,
  readArtifact,
  skipReliability,
  trackerFetchNote,
  type MetricResult,
} from './_base.ts';
import { bandScore, clamp01 } from './_score.ts';

const ANCHORS = [
  { x: 0, y: 1 },
  { x: 3, y: 0.8 },
  { x: 6, y: 0.4 },
  { x: 10, y: 0 },
] as const;

/** Map avg subtasks per parent to a band label. */
function subtaskBand(avg: number): 'good' | 'watch' | 'concerning' {
  if (avg <= 3) return 'good';
  if (avg <= 6) return 'watch';
  return 'concerning';
}

/** Arithmetic mean of a non-empty numeric array. */
function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>
): MetricResult {
  const read = readArtifact(collectedDir, 'tracker');

  // Tracker source file absent → SKIP.
  if ('error' in read) {
    return makeMetricResult(
      'adp_i4_subtask_split',
      null,
      'banded',
      [],
      skipReliability('minimal', 'tracker', read.error),
      [],
      ['tracker']
    );
  }

  const artifact = read.artifact;

  // available=false means no tracker connector was provided.
  if (!artifact?.available) {
    return makeMetricResult(
      'adp_i4_subtask_split',
      null,
      'banded',
      [],
      computeReliability('minimal', [], ['tracker']),
      [],
      ['tracker']
    );
  }

  const raw = artifact?.raw ?? {};
  const tickets: Array<Record<string, unknown>> = Array.isArray(raw.tickets)
    ? (raw.tickets as Array<Record<string, unknown>>)
    : [];

  // No ticket in the window carries subtask data at all → the connector did
  // not map the field; SKIP rather than guess. (An explicit subtask_count of
  // 0 counts as data.)
  const hasSubtaskData = tickets.some(
    (t) => typeof t['subtask_count'] === 'number'
  );
  if (!hasSubtaskData) {
    return makeMetricResult(
      'adp_i4_subtask_split',
      null,
      'banded',
      [],
      computeReliability('minimal', [], ['tracker']),
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
      'adp_i4_subtask_split',
      null,
      'banded',
      [],
      computeReliability('minimal', [], ['tracker']),
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
  const score = clamp01(bandScore(avgSubtasks, ANCHORS, 'linear'));

  const categories = awardCategories(
    standards,
    'adp_i4_subtask_split',
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
    'adp_i4_subtask_split',
    avgSubtasks,
    'banded',
    categories,
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
