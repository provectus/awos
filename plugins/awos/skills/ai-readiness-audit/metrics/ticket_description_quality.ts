/**
 * ticket_description_quality — Ticket description quality/richness.
 *
 * kind: "banded"
 * value: share of eligible tickets that are well-described (number ∈ [0,1]), or null
 * band: "good" (≥0.7) | "watch" (≥0.4) | "concerning" (<0.4)
 * categories_awarded: [1105] when topology.has_tracker is true and description_length data available
 * reliability_default: "minimal"
 *
 * A ticket is "well-described" iff BOTH signals hold:
 *   - description_length ≥ MIN_DESC_CHARS (non-trivial description), AND
 *   - has_acceptance_criteria === true (the ticket states its done-criteria).
 *
 * Rationale (Agile Alliance Definition of Ready):
 *   The Agile Alliance Definition of Ready (https://www.agilealliance.org/glossary/definition-of-ready/)
 *   specifies that a story must include acceptance criteria and be sufficiently described
 *   before it enters a sprint. "Thin tickets" (e.g. "fix bug") starve both humans and
 *   AI agents of the context needed to understand scope, intent, and done-criteria.
 *   When an AI agent receives a thin ticket it either hallucinates scope or requires
 *   expensive back-and-forth clarification rounds, both of which hurt delivery throughput.
 *
 *   This metric uses two deterministic proxies: a description of ≥50 characters is
 *   treated as "non-trivial", and an explicit acceptance-criteria flag confirms the
 *   ticket states its done-criteria. The 50-char threshold is an AWOS heuristic — the
 *   Agile Alliance publishes no numeric character-count criterion. Disclose this wherever
 *   the metric is presented. Only size/structure signals (character count, AC presence)
 *   are stored; raw description text is never collected or logged.
 *
 *   Band thresholds are AWOS heuristics:
 *     ≥70%  → "good"        most tickets are well-described
 *     ≥40%  → "watch"       moderate description coverage, room to improve
 *     <40%  → "concerning"  thin tickets dominate; AI-agent context is severely limited
 *
 * Score curve: standards.toml [category.ticket_description_quality.scoring]
 *   (piecewise linear interpolation over the declared anchors, higher share = higher score).
 *
 * SKIP conditions:
 *   - tracker.json absent
 *   - tracker.json available === false (no connector provided)
 *   - raw.tickets absent or empty
 *   - no ticket has a numeric description_length (no description-quality data in the window)
 *
 * Eligibility note: a ticket is "eligible" iff it carries a numeric description_length.
 *   The has_acceptance_criteria flag does NOT affect eligibility — it only decides
 *   whether an eligible ticket counts as well-described.
 *
 * Source shape: collectedDir/tracker.json
 * Input raw fields: tickets[].description_length (number, optional),
 *                   tickets[].has_acceptance_criteria (boolean, optional)
 *
 * @see https://www.agilealliance.org/glossary/definition-of-ready/  (Agile Alliance, 2012)
 */
import {
  appendReliabilityNote,
  awardCategories,
  computeReliability,
  makeMetricResult,
  readArtifact,
  skipMetric,
  trackerFetchNote,
  type MetricResult,
} from './_base.ts';
import { scoreFromConfig, scoringFor } from './_score.ts';

const MIN_DESC_CHARS = 50;

/** Map share of well-described tickets to a band label. */
function descriptionBand(share: number): 'good' | 'watch' | 'concerning' {
  if (share >= 0.7) return 'good';
  if (share >= 0.4) return 'watch';
  return 'concerning';
}

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>
): MetricResult {
  const read = readArtifact(collectedDir, 'tracker');

  if ('error' in read) {
    return skipMetric(
      'ticket_description_quality',
      'banded',
      'minimal',
      'tracker',
      read.error
    );
  }

  const artifact = read.artifact;

  if (!artifact?.available) {
    return skipMetric(
      'ticket_description_quality',
      'banded',
      'minimal',
      'tracker'
    );
  }

  const raw = artifact?.raw ?? {};
  const tickets: Array<Record<string, unknown>> = Array.isArray(raw.tickets)
    ? (raw.tickets as Array<Record<string, unknown>>)
    : [];

  // Only tickets with a numeric description_length contribute to the metric.
  const eligible = tickets.filter(
    (t) => typeof t['description_length'] === 'number'
  );

  if (eligible.length === 0) {
    // The tracker IS connected — the generic "missing sources: tracker" SKIP
    // reason would misreport a field-mapping gap as a missing connector.
    return makeMetricResult(
      'ticket_description_quality',
      null,
      'banded',
      [],
      {
        tag: 'minimal',
        confidence: 'LOW',
        note:
          `tracker connected (${tickets.length} tickets) but none carries description_length — ` +
          `the fetch did not request/map ticket descriptions; include the description field ` +
          `and map its length per connector-shapes.md to measure this`,
      },
      [],
      ['tracker']
    );
  }

  // Well-described requires BOTH a non-trivial description AND acceptance criteria.
  const wellDescribed = eligible.filter(
    (t) =>
      (t['description_length'] as number) >= MIN_DESC_CHARS &&
      t['has_acceptance_criteria'] === true
  );
  const share = wellDescribed.length / eligible.length;
  const band = descriptionBand(share);
  // Score curve lives in standards.toml [category.ticket_description_quality.scoring].
  const score = scoreFromConfig(
    share,
    scoringFor(standards, 'ticket_description_quality')
  );

  const categories = awardCategories(
    standards,
    'ticket_description_quality',
    topology
  );
  // Surface a partial tracker fetch (fetch_meta) in the reliability note.
  const reliability = appendReliabilityNote(
    computeReliability('minimal', ['tracker'], []),
    trackerFetchNote(raw)
  );

  const expression =
    `${wellDescribed.length} of ${eligible.length} tickets with description ≥${MIN_DESC_CHARS} chars + acceptance criteria = ` +
    `${(share * 100).toFixed(1)}% (${band}; ` +
    `threshold is an AWOS heuristic — Agile Alliance publishes no numeric criterion; ` +
    `size/structure signals only, no raw text stored)`;

  return makeMetricResult(
    'ticket_description_quality',
    share,
    'banded',
    categories,
    reliability,
    ['tracker'],
    [],
    { band, unit: 'ratio', expression, score, confidence: 1.0 }
  );
}
