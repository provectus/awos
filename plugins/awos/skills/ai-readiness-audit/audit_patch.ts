// ---------------------------------------------------------------------------
// audit_patch.ts — the post-audit patch/repair verbs.
//
// Everything here operates on the artifacts audit-core already wrote (the
// per-dimension <name>.json files and audit.json): re-aggregation after
// patches, the orchestrator's judgment/report-block patch entry points, and
// the read-only report-context dump. Deterministic scoring itself lives in
// audit_core.ts; this module never runs a detector or metric.
// ---------------------------------------------------------------------------
import { writeFileSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

import { round1 } from './metrics/_score.ts';
import { ENGINE_PROVENANCE, hasEngineProvenance } from './provenance.ts';
import {
  aggregateChecks,
  computeDerivedDelivery,
  dimensionFiles,
  readCollectedArtifacts,
  deriveSources,
  deriveSourceWindows,
} from './audit_core.ts';

/**
 * Re-aggregate audit.json from the per-dimension <name>.json files in `outDir`,
 * recomputing each dimension's score/coverage from its (possibly patched) checks
 * and the audit totals. Preserves the project/date and any authored report
 * blocks (headline/insights/recommendations) already on audit.json. Run after
 * the orchestrator patches judgment or connector checks, before rendering.
 */
export function aggregate(outDir: string): void {
  let total = 0;
  let applicable = 0;
  const dimensions: Record<string, unknown>[] = [];
  for (const { file: f, dim, checks } of dimensionFiles(outDir, (f, err) =>
    process.stderr.write(
      `aggregate: ${f} is unreadable (${String(err)}) — dimension left out of the totals\n`
    )
  )) {
    // Re-derive applies from status so patched-PASS connector checks count
    // in the denominator — prevents coverage > 1 when a SKIP is patched to PASS.
    // Re-derive weight_awarded from score (Correction 3) so orchestrator-patched
    // checks that carry an explicit score re-sum correctly. The orchestrator's
    // patches are untrusted input: a score outside [0,1] is clamped (a raw
    // weight written into `score` must not inflate the audit total). Any
    // finite score is explicit — a stored 0 stays 0 (a legal {status: WARN,
    // score: 0} patch must not re-inflate to the status default). The one
    // exception: a 0 score contradicting a positive weight_awarded on a
    // passing status is a status-only patch that never touched `score` —
    // reconcile from weight_awarded so the patched credit isn't silently
    // zeroed. `score` is written back so the artifact never carries a score
    // that disagrees with its status.
    for (const c of checks) {
      c.applies = c.status !== 'SKIP';
      const passing = ['PASS', 'WARN', 'PARTIAL'].includes(c.status);
      const awardedCredit =
        (c.weight_max || 0) > 0 && (c.weight_awarded || 0) > 0;
      let s: number;
      if (c.status === 'SKIP') {
        s = 0;
      } else if (
        typeof c.score === 'number' &&
        Number.isFinite(c.score) &&
        (c.score !== 0 || !(passing && awardedCredit))
      ) {
        s = c.score;
      } else if (passing && awardedCredit) {
        s = c.weight_awarded / c.weight_max;
      } else {
        s = c.status === 'PASS' ? 1 : c.status === 'WARN' ? 0.5 : 0;
      }
      if (s < 0 || s > 1) {
        process.stderr.write(
          `aggregate: ${c.check_id} score ${s} out of [0,1] — clamped (bad judgment/connector patch?)\n`
        );
        s = Math.min(1, Math.max(0, s));
      }
      c.score = s;
      c.weight_awarded = round1((c.weight_max || 0) * s);
    }
    const agg = aggregateChecks(checks);
    dim.score = agg.score;
    dim.coverage = agg.coverage;
    dim.sources_used = agg.sources_used;
    writeFileSync(join(outDir, f), JSON.stringify(dim, null, 2));
    total = round1(total + agg.score);
    applicable += agg.applicable;
    dimensions.push(dim);
  }
  // Restore the presentation order — readdirSync is alphabetical, but each
  // per-dimension JSON carries the `order` index audit-core stamped on it.
  dimensions.sort((a, b) => {
    const ao = typeof a.order === 'number' ? (a.order as number) : 999;
    const bo = typeof b.order === 'number' ? (b.order as number) : 999;
    return ao - bo || String(a.dimension).localeCompare(String(b.dimension));
  });
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(join(outDir, 'audit.json'), 'utf8'));
  } catch (err) {
    // Absent (ENOENT) is normal on a first aggregate; anything else means a
    // prior audit.json exists but can't be read — its authored report blocks
    // (headline/insights/recommendations) will be lost. Say so.
    if ((err as { code?: string }).code !== 'ENOENT') {
      process.stderr.write(
        `aggregate: prior audit.json is unreadable (${String(err)}) — authored report blocks (headline/insights/recommendations) will be lost\n`
      );
    }
  }

  // Re-derive sources and source_windows from collected/ artifacts. An ENOENT
  // (artifact never collected) drops the entry so the stored block can win the
  // fallback below; an unreadable/corrupted artifact keeps its entry with an
  // explicit reason, never masquerading as a missing connector.
  const collectedDirAgg = join(outDir, 'collected');
  const collectedAgg = readCollectedArtifacts(collectedDirAgg);
  const derivedSources = deriveSources(collectedAgg, true);
  const derivedSourceWindows = deriveSourceWindows(collectedAgg);

  const audit: Record<string, unknown> = {
    date: existing.date ?? new Date().toISOString().slice(0, 10),
    project: existing.project ?? basename(outDir),
    audit_total: round1(total),
    coverage: applicable > 0 ? total / applicable : null,
    dimensions,
  };
  for (const block of [
    'headline',
    'insights',
    'recommendations',
    'source_probes',
    'tech_stack',
    'linked_repos',
    'detection_conflicts',
    'standards_meta',
  ]) {
    if (existing[block] !== undefined) audit[block] = existing[block];
  }
  // Connector-gated headline rows: re-derive from the collected artifacts
  // (same source of truth as `sources` below); keep the stored block when the
  // artifacts are gone.
  const derivedDelivery = computeDerivedDelivery(
    collectedDirAgg,
    collectedAgg.get('tracker')!.art
  );
  audit.derived_delivery =
    derivedDelivery.cycle_time.display_value !== undefined ||
    derivedDelivery.cycle_time.note !== undefined ||
    derivedDelivery.mttr.note !== undefined ||
    existing.derived_delivery === undefined
      ? derivedDelivery
      : existing.derived_delivery;
  // Prefer re-derived sources when collected/ artifacts are present; fall back
  // to the previously stored sources block so it is never silently dropped.
  if (derivedSources.length > 0) {
    audit.sources = derivedSources;
  } else if (existing.sources !== undefined) {
    audit.sources = existing.sources;
  }
  // Same fallback logic for source_windows.
  if (Object.keys(derivedSourceWindows).length > 0) {
    audit.source_windows = derivedSourceWindows;
  } else if (existing.source_windows !== undefined) {
    audit.source_windows = existing.source_windows;
  }
  // Carry the engine provenance stamp forward: from the prior audit.json, or
  // (repair case — audit.json deleted/corrupted) re-derive it when every
  // per-dimension artifact is engine-stamped. Hand-built dimension files
  // never carry the stamp, so aggregating them yields an unrenderable audit.
  if (
    hasEngineProvenance(existing) ||
    (dimensions.length > 0 && dimensions.every((d) => hasEngineProvenance(d)))
  ) {
    audit.engine = ENGINE_PROVENANCE;
  }
  writeFileSync(join(outDir, 'audit.json'), JSON.stringify(audit, null, 2));
}

/**
 * Circuit-breaker shared by every post-audit verb: only an engine-produced
 * audit may be patched or read for authoring. A missing or unstamped
 * audit.json means the orchestrator hand-assembled the scores instead of
 * running audit-core — refuse, with the fix in the message. Returns the
 * parsed audit.json.
 */
export function requireStampedAudit(
  outDir: string,
  verb: string
): Record<string, unknown> {
  const auditPath = join(outDir, 'audit.json');
  let audit: Record<string, unknown> | null = null;
  try {
    audit = JSON.parse(readFileSync(auditPath, 'utf8'));
  } catch {
    // handled below — absent/unreadable fails the provenance check
  }
  if (!hasEngineProvenance(audit)) {
    throw new Error(
      `${verb}: ${auditPath} lacks engine provenance — it was not produced ` +
        `by audit-core. Hand-assembled audits are not patchable; run ` +
        `\`node dist/cli.js audit-core <repoPath> ${outDir}\` first.`
    );
  }
  return audit as Record<string, unknown>;
}

export interface JudgmentPatch {
  check_id: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
  /** Fraction of capability present ∈ [0,1]; defaults from status (PASS=1, WARN=0.5, else 0). */
  score?: number;
  /**
   * Fraction ∈ [0,1] self-reported by the grading subagent — how confident it
   * is in this verdict given the evidence it found (distinct from `score`,
   * which is how much capability is present). Defaults to 1 for PASS/WARN/FAIL
   * when omitted (back-compat with older callers), 0 for SKIP regardless of
   * what's passed. When below 1, the caller's `evidence` should say why — the
   * engine stores whatever it's given and does not enforce this.
   */
  confidence?: number;
  /**
   * Optional measurable quantity from the rubric (a count, ratio, or named
   * artifact) — number or string only. Booleans are dropped on apply: they
   * just restate `status`, and grading subagents returning `true` in one run
   * and a fraction in the next made the field flap type run-to-run.
   */
  value?: unknown;
  evidence?: string[];
}

/**
 * Apply the orchestrator's judgment verdicts to the per-dimension JSONs in ONE
 * call, then re-aggregate. Replaces the per-check JSON surgery the model used
 * to do by hand (dozens of serial shell edits — the dominant wall-clock cost
 * of Step 5). Only `method: "judgment"` checks are patchable; anything else is
 * reported and left untouched. Returns a summary for the caller to print.
 */
export function patchJudgments(
  outDir: string,
  patches: JudgmentPatch[]
): { patched: string[]; warnings: string[] } {
  requireStampedAudit(outDir, 'patch-judgment');
  const patched: string[] = [];
  const warnings: string[] = [];
  const validStatuses = ['PASS', 'WARN', 'FAIL', 'SKIP'];
  const byId = new Map<string, JudgmentPatch>();
  for (const p of patches) {
    if (!p || typeof p.check_id !== 'string' || typeof p.status !== 'string') {
      warnings.push(`malformed patch skipped: ${JSON.stringify(p)}`);
      continue;
    }
    if (!validStatuses.includes(p.status)) {
      warnings.push(
        `${p.check_id}: invalid status "${p.status}" — must be one of ${validStatuses.join('/')}; patch skipped`
      );
      continue;
    }
    byId.set(p.check_id, p);
  }

  for (const { file: f, dim, checks } of dimensionFiles(outDir)) {
    let changed = false;
    for (const c of checks) {
      const p = byId.get(c.check_id);
      if (!p) continue;
      byId.delete(c.check_id);
      if (c.method !== 'judgment') {
        warnings.push(
          `${c.check_id} is method "${c.method}", not judgment — left untouched (connector checks are re-scored by enrich)`
        );
        continue;
      }
      const statusDefault =
        p.status === 'PASS' ? 1 : p.status === 'WARN' ? 0.5 : 0;
      let s = typeof p.score === 'number' ? p.score : statusDefault;
      if (s < 0 || s > 1) {
        warnings.push(
          `${c.check_id}: score ${s} out of [0,1] — clamped (pass a fraction, not a weight)`
        );
        s = Math.min(1, Math.max(0, s));
      }
      if (p.status === 'SKIP') s = 0;
      let conf = typeof p.confidence === 'number' ? p.confidence : 1;
      if (conf < 0 || conf > 1) {
        warnings.push(
          `${c.check_id}: confidence ${conf} out of [0,1] — clamped`
        );
        conf = Math.min(1, Math.max(0, conf));
      }
      if (p.status === 'SKIP') conf = 0;
      c.status = p.status;
      c.score = s;
      c.confidence = conf;
      c.applies = p.status !== 'SKIP';
      c.weight_awarded = round1((c.weight_max || 0) * s);
      if (p.value !== undefined) {
        if (typeof p.value === 'boolean') {
          warnings.push(
            `${c.check_id}: boolean value dropped — it restates status; pass a measurable quantity (number/string) or omit value`
          );
        } else {
          c.value = p.value;
        }
      }
      if (Array.isArray(p.evidence)) c.evidence = p.evidence;
      changed = true;
      patched.push(c.check_id);
    }
    if (changed) {
      writeFileSync(join(outDir, f), JSON.stringify(dim, null, 2));
    }
  }
  for (const id of byId.keys()) {
    warnings.push(`${id}: no such check in any dimension artifact — ignored`);
  }

  aggregate(outDir);
  return { patched, warnings };
}

/** The orchestrator-authored plain-language blocks patch-report accepts. */
export interface ReportBlocksPatch {
  headline?: Record<string, unknown>;
  insights?: unknown[];
  recommendations?: Array<Record<string, unknown>>;
  /** Probe log per unreachable source — what was searched (mcp.json files, CLIs) and the outcome. */
  source_probes?: Array<Record<string, unknown>>;
}

const REPORT_BLOCK_KEYS = [
  'headline',
  'insights',
  'recommendations',
  'source_probes',
] as const;

/**
 * Apply the orchestrator's plain-language report blocks (headline / insights /
 * recommendations) to audit.json in ONE call, and emit recommendations.md
 * from the same recommendations array. Replaces the orchestrator editing
 * audit.json by hand (inline python/node scripts — the last remaining reason
 * a run had to touch a scoring artifact directly). audit.json stays fully
 * engine-managed: unknown top-level keys in the patch are rejected with a
 * warning, and the engine provenance stamp is required and preserved.
 */
export function patchReportBlocks(
  outDir: string,
  blocks: ReportBlocksPatch
): {
  patched: string[];
  recommendations_md: string | null;
  warnings: string[];
} {
  const auditPath = join(outDir, 'audit.json');
  const audit = requireStampedAudit(outDir, 'patch-report');
  const warnings: string[] = [];
  const patched: string[] = [];
  for (const key of Object.keys(blocks as Record<string, unknown>)) {
    if (!(REPORT_BLOCK_KEYS as readonly string[]).includes(key)) {
      warnings.push(
        `unknown block "${key}" ignored — patch-report accepts only ${REPORT_BLOCK_KEYS.join('/')}`
      );
    }
  }
  const b = blocks as Record<string, unknown>;
  if (b.headline !== undefined) {
    if (typeof b.headline !== 'object' || Array.isArray(b.headline)) {
      warnings.push('headline must be an object — skipped');
    } else {
      audit.headline = b.headline;
      patched.push('headline');
    }
  }
  for (const key of ['insights', 'recommendations', 'source_probes'] as const) {
    if (b[key] === undefined) continue;
    if (!Array.isArray(b[key])) {
      warnings.push(`${key} must be an array — skipped`);
      continue;
    }
    audit[key] = b[key];
    patched.push(key);
  }
  writeFileSync(auditPath, JSON.stringify(audit, null, 2));

  // recommendations.md — the long-form file /awos:roadmap consumes, derived
  // from the exact same array so the two can never drift.
  let recommendationsMd: string | null = null;
  const recs = (audit.recommendations ?? []) as Array<Record<string, unknown>>;
  if (patched.includes('recommendations') && recs.length > 0) {
    const prioRank = (p: unknown) => ({ P0: 0, P1: 1, P2: 2 })[String(p)] ?? 3;
    const sorted = [...recs].sort(
      (a, r) => prioRank(a.priority) - prioRank(r.priority)
    );
    const lines: string[] = [
      `# Audit Recommendations — ${audit.project ?? ''} (${audit.date ?? ''})`.trim(),
      '',
    ];
    for (const r of sorted) {
      lines.push(`## ${r.priority ?? 'P?'} — ${r.title ?? r.id ?? ''}`);
      const meta = [
        r.dimension ? `Dimension: ${r.dimension}` : null,
        r.check_id ? `Check: ${r.check_id}` : null,
        r.effort ? `Effort: ${r.effort}` : null,
      ].filter(Boolean);
      if (meta.length) lines.push('', meta.join(' · '));
      if (r.detail) lines.push('', String(r.detail));
      lines.push('');
    }
    recommendationsMd = join(outDir, 'recommendations.md');
    writeFileSync(recommendationsMd, lines.join('\n'));
  }
  return { patched, recommendations_md: recommendationsMd, warnings };
}

/**
 * Read-only authoring context for the report blocks: everything Step 5.4
 * transcribes (check values/hints, git window stats, tracker fetch metadata),
 * flattened from the artifacts in ONE call — so the orchestrator never opens
 * or parses audit.json / collected/*.json itself. Requires the provenance
 * stamp like every other post-audit verb.
 */
export function reportContext(outDir: string): Record<string, unknown> {
  const audit = requireStampedAudit(outDir, 'report-context');
  const readCollected = (src: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(
        readFileSync(join(outDir, 'collected', `${src}.json`), 'utf8')
      );
    } catch {
      return null;
    }
  };
  const git = readCollected('git');
  const tracker = readCollected('tracker');
  const checks: Array<Record<string, unknown>> = [];
  for (const dim of (audit.dimensions ?? []) as Array<
    Record<string, unknown>
  >) {
    for (const c of (dim.checks ?? []) as Array<Record<string, unknown>>) {
      checks.push({
        check_id: c.check_id,
        dimension: dim.dimension,
        status: c.status,
        value: c.value,
        hint: c.hint,
        weight_awarded: c.weight_awarded,
        weight_max: c.weight_max,
        evidence: c.evidence,
      });
    }
  }
  return {
    date: audit.date,
    project: audit.project,
    audit_total: audit.audit_total,
    coverage: audit.coverage,
    window_stats:
      (git?.raw as Record<string, unknown> | undefined)?.window_stats ?? null,
    tracker_fetch_meta:
      (tracker?.raw as Record<string, unknown> | undefined)?.fetch_meta ?? null,
    incident_source:
      (tracker?.raw as Record<string, unknown> | undefined)?.incident_source ??
      null,
    sources: audit.sources ?? [],
    checks,
  };
}
