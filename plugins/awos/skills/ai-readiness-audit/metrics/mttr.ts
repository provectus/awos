/**
 * mttr — Mean Time to Recovery (MTTR).
 *
 * kind: "banded"
 * value: median recovery interval in hours (number), or null when no recovery events detected
 * band: one of "elite" | "high" | "medium" | "low" per standards.toml band.mttr
 * categories_awarded: [1103] when topology.has_incident_source is true
 * reliability_default: "not-reliable"
 *
 * This metric NEVER SKIPS. It reports one of two values, in precedence order:
 *
 *   1. Real incident source (maximal reliability). When a connector-passed
 *      incidents artifact is present with at least one incident that has a
 *      measurable started→resolved span, MTTR is the median of those spans.
 *      The median is derived HERE from raw.incidents[] (via the collector's
 *      deriveIncidentAggregates) — any resolved_count / median_duration_hours
 *      the orchestrator may have written is advisory and ignored, so a
 *      transcription slip cannot masquerade as a measured DORA number. The
 *      spans are clamped to the audit window.
 *
 *   2. Git branch-lifetime proxy (not-reliable) — the fallback when no incident
 *      source is measurable. Individual merge records carry no type labels, so
 *      recovery-style merges cannot be isolated; the proxy is a uniform measure
 *      over ALL first-parent merges — each record's (merged_at −
 *      branch_first_commit_at), i.e. how long the branch lived before merging —
 *      and its median. Declaring an incident source without resolvable data
 *      does not upgrade this number; category 1103 simply stays unawarded.
 *
 * DORA band thresholds (band.mttr in standards.toml):
 *   elite  → < 1 hour    (median_hours < 1)
 *   high   → < 1 day     (median_hours < 24)
 *   medium → < 1 week    (median_hours < 168)
 *   low    → >= 1 week   (median_hours >= 168)
 *
 * Source shapes:
 *   collectedDir/incidents.json — primary; raw.incidents[] drives the measured value
 *   collectedDir/git.json       — always read (provides the git-proxy fallback)
 *   collectedDir/tracker.json   — read when present (an incident_source label adds
 *                                 an informational note on the proxy path only)
 *
 * SKIP: never. Returns OK with null value when no merge records exist (minimal git history).
 */
import {
  appendReliabilityNote,
  awardCategories,
  lookbackDays,
  makeMetricResult,
  readArtifact,
  trackerFetchNote,
  windowDropNote,
  type MetricResult,
  type Reliability,
} from './_base.ts';
import {
  mergeRecordDurationsHours,
  type MergeRecord,
} from './_merge_records.ts';
import { median, scoreFromConfig, scoringFor } from './_score.ts';
import { deriveIncidentAggregates } from '../collectors/incidents.ts';

/** Map median hours to a DORA MTTR band label. */
function mttrBand(medianHours: number): string {
  if (medianHours < 1) return 'elite';
  if (medianHours < 24) return 'high';
  if (medianHours < 168) return 'medium';
  return 'low';
}

export function compute(
  collectedDir: string,
  standards: Record<string, unknown>,
  topology: Record<string, boolean>
): MetricResult {
  // --- Real incident source (connector-passed) takes precedence over the git
  //     proxy. The median is derived HERE from raw.incidents[] (any aggregates
  //     the orchestrator wrote are advisory and ignored), clamped to the audit
  //     window, so the reported value is always the engine's own arithmetic. ---
  let incidentsNoSpanNote: string | null = null;
  const incidentsRead = readArtifact(collectedDir, 'incidents');
  if (!('error' in incidentsRead) && incidentsRead.artifact?.available) {
    const iraw = (incidentsRead.artifact.raw ?? {}) as {
      incidents?: Parameters<typeof deriveIncidentAggregates>[0];
      source_label?: string | null;
    };
    // Window from standards ([meta].max_lookback_days), not the artifact's
    // orchestrator-authored `period` — an envelope written without one would
    // otherwise skip the clamp entirely and let an all-time export become the
    // "audit-window" median. Same source as ci_pass_rate/pipeline_duration.
    const agg = deriveIncidentAggregates(
      iraw.incidents,
      lookbackDays(standards)
    );
    if (agg.resolved_count > 0 && agg.median_duration_hours !== null) {
      const medianHours = agg.median_duration_hours;
      const band = mttrBand(medianHours);
      const categories = awardCategories(standards, 'mttr', topology);
      const measured = agg.resolved_count;
      const total = measured + agg.invalid_count;
      const ofNote =
        agg.invalid_count > 0
          ? ` (of ${total} resolved; ${agg.invalid_count} lacked a parseable span)`
          : '';
      // Say what the window clamp removed — 480 incidents clamping to 11
      // otherwise reads exactly like a source that only ever had 11.
      const dropNote = windowDropNote(
        agg.dropped_out_of_window,
        lookbackDays(standards),
        'incident'
      );
      const reliability: Reliability = {
        tag: 'maximal',
        confidence: 'HIGH',
        note: `measured from ${measured} resolved incident${measured === 1 ? '' : 's'}${iraw.source_label ? ` (${iraw.source_label})` : ''}${ofNote}${dropNote}`,
      };
      const score = scoreFromConfig(medianHours, scoringFor(standards, 'mttr'));
      return makeMetricResult(
        'mttr',
        medianHours,
        'banded',
        categories,
        reliability,
        ['incidents'],
        [],
        {
          band,
          expression: `median ${medianHours.toFixed(1)}h MTTR over ${measured} incident${measured === 1 ? '' : 's'} (${band})`,
          score,
          confidence: 0.9,
        }
      );
    }
    // Incidents artifact present but nothing measurable — surface WHY on the
    // git-proxy fallback below rather than silently reading "no incident data".
    if (agg.count > 0) {
      incidentsNoSpanNote =
        agg.invalid_count > 0
          ? `incident source connected — ${agg.count} incident${agg.count === 1 ? '' : 's'} but none had a parseable recovery span (${agg.invalid_count} unparseable)`
          : `incident source connected — no incident with a resolved recovery span in the window`;
    }
  }

  // --- Fallback: git branch-lifetime proxy (unchanged; git is already covered
  //     by change_failure_rate and this proxy — the incident source above is
  //     the upgrade). ---
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
      const categories = awardCategories(standards, 'mttr', topology);
      const reliability: Reliability = appendReliabilityNote(
        {
          tag: 'not-reliable',
          confidence: 'LOW',
          note: `incident source declared but MTTR is not computed from incident data; ${gitRead.error}`,
        },
        trackerPartialNote
      );
      return makeMetricResult(
        'mttr',
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
      'mttr',
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
  const allIntervals = mergeRecordDurationsHours(mergeRecords);
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
  const categories = awardCategories(standards, 'mttr', topology);

  // Sources: git is always used. Tracker is also used when incident_source is present.
  const sourcesUsed = incidentSource ? ['git', 'tracker'] : ['git'];
  const sourcesMissing: string[] = [];

  // Tracker path: surface a partial tracker fetch in the reliability note.
  if (incidentSource) {
    reliability = appendReliabilityNote(reliability, trackerPartialNote);
  }
  // An incidents artifact that carried records but no measurable span is worth
  // saying out loud — otherwise a whole-batch mapping mistake reads as "no data".
  reliability = appendReliabilityNote(reliability, incidentsNoSpanNote);

  // Score curve lives in standards.toml [category.mttr.scoring].
  const score =
    medianHours !== null
      ? scoreFromConfig(medianHours, scoringFor(standards, 'mttr'))
      : 0;
  const confidence = allIntervals.length > 0 ? 0.3 : 0.0;
  const expression =
    medianHours !== null
      ? `median ${medianHours.toFixed(1)}h MTTR (${band})`
      : 'no incident data';
  return makeMetricResult(
    'mttr',
    medianHours,
    'banded',
    categories,
    reliability,
    sourcesUsed,
    sourcesMissing,
    { band, expression, score, confidence }
  );
}
