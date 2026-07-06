/**
 * rollup_input.ts — read one repo's FULL audit into a rich PerRepoInput.
 *
 * Org-rollup domain logic (formerly inline in cli.ts): reads
 * <repoDir>/audit.json + <repoDir>/collected/git.json and derives the
 * delivery numbers, AI-tooling flag, and gap rows org_rollup consumes.
 * The delivery check-id mapping comes from org_rollup's DELIVERY_CHECK_FIELDS
 * (one table for reader and headline).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { AuditJson, Check } from '../artifact_types.ts';
import { hasEngineProvenance } from '../audit_core.ts';
import {
  DELIVERY_CHECK_FIELDS,
  type PerRepoDelivery,
  type PerRepoInput,
} from './org_rollup.ts';

/**
 * Fallback AI-tooling category codes (ADP-01…06) used only when standards
 * can't be loaded; normally the set is derived from standards.toml via
 * aiToolingCodes().
 */
const AI_TOOLING_CODES_FALLBACK = new Set([101, 102, 103, 104, 105, 106]);

/**
 * Category codes whose award means "this repo has AI tooling": the layers of
 * the tooling_depth metric (ADP-01…06 today). Derived from standards
 * so a new tooling layer is included automatically; falls back to the static
 * set when standards are unavailable.
 */
export function aiToolingCodes(
  standards: Record<string, unknown>
): Set<number> {
  const categoryTable = standards['category'] as
    | Record<string, Record<string, unknown>>
    | undefined;
  const codes = new Set<number>();
  for (const cat of Object.values(categoryTable ?? {})) {
    if (cat['metric'] === 'tooling_depth') {
      codes.add(cat['code'] as number);
    }
  }
  return codes.size > 0 ? codes : AI_TOOLING_CODES_FALLBACK;
}

/**
 * Loose parse-boundary shape of a per-repo audit.json read from disk: the
 * shared AuditJson contract with every top-level field optional, since the
 * rollup consumes untrusted on-disk JSON and must survive partial artifacts.
 */
type ParsedAudit = Partial<AuditJson>;

/** Coerce a check value to a finite number, else null (covers SKIP/null/NaN). */
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Read <repoDir>/audit.json + <repoDir>/collected/git.json and derive a rich
 * PerRepoInput. Returns null (logging to stderr) when audit.json is missing,
 * unparseable, or lacks the audit-core provenance stamp (hand-assembled),
 * so one bad repo never crashes the whole rollup.
 */
export function readPerRepoAudit(
  repoDir: string,
  repoName: string,
  aiCodes: Set<number>
): PerRepoInput | null {
  const auditPath = join(repoDir, 'audit.json');
  let audit: ParsedAudit;
  try {
    audit = JSON.parse(readFileSync(auditPath, 'utf8')) as ParsedAudit;
  } catch {
    process.stderr.write(
      `rollup: skipping ${repoName} — missing or unparseable audit.json\n`
    );
    return null;
  }
  if (!hasEngineProvenance(audit)) {
    process.stderr.write(
      `rollup: skipping ${repoName} — audit.json lacks engine provenance ` +
        `(not produced by audit-core; hand-assembled audits are excluded ` +
        `from the portfolio)\n`
    );
    return null;
  }

  // Flatten every check once; index by check_id and scan for AI-tooling codes.
  const checks: Check[] = (audit.dimensions ?? []).flatMap(
    (d) => d.checks ?? []
  );
  const byCheckId = new Map<string, Check>();
  let hasAiTooling = false;
  for (const c of checks) {
    if (c.check_id && !byCheckId.has(c.check_id)) byCheckId.set(c.check_id, c);
    const awarded = (c.weight_awarded ?? 0) > 0 || c.status === 'PASS';
    if (awarded && (c.code ?? []).some((code) => aiCodes.has(code)))
      hasAiTooling = true;
  }

  // Build the compact checks list for cross-repo gap aggregation (Task 5.5).
  // Iterate dimensions so each check record carries its dimension slug.
  const checksForGaps: Array<{
    check_id: string;
    dimension: string;
    definition: string;
    status: string;
  }> = [];
  for (const dim of audit.dimensions ?? []) {
    const dimSlug = dim.dimension ?? '';
    for (const c of dim.checks ?? []) {
      if (!c.check_id) continue;
      checksForGaps.push({
        check_id: c.check_id,
        dimension: dimSlug,
        definition: c.definition ?? '',
        status: c.status ?? '',
      });
    }
  }

  // Delivery check values by check_id (null when absent / SKIP / null value).
  const delivery: PerRepoDelivery = {};
  for (const [checkId, field] of DELIVERY_CHECK_FIELDS) {
    delivery[field] = numOrNull(byCheckId.get(checkId)?.value);
  }

  // Connector-gated headline rows: cycle time (gated: "tracker") and MTTR
  // (gated: "incident"). Carried as the display string the per-repo audit's
  // headline authored (e.g. "3.2 d"); null when the row is gated with no
  // connector (no display_value) or the headline is absent — the org
  // Repositories table then renders its em-dash placeholder.
  const headlineRows = audit.headline?.delivery ?? [];
  const gatedDisplay = (gate: string): string | null => {
    const row = headlineRows.find((r) => r.gated === gate);
    return typeof row?.display_value === 'string' &&
      row.display_value.length > 0
      ? row.display_value
      : null;
  };
  // Engine-derived rows (audit.derived_delivery) win over authored headline
  // rows — same precedence as the renderer, same artifact truth.
  delivery.cycle_time =
    audit.derived_delivery?.cycle_time?.display_value ??
    gatedDisplay('tracker');
  delivery.mttr = gatedDisplay('incident');

  // Merges/LOC per active contributor from the git artifact (best-effort).
  const gitPath = join(repoDir, 'collected', 'git.json');
  if (existsSync(gitPath)) {
    try {
      const git = JSON.parse(readFileSync(gitPath, 'utf8')) as {
        raw?: { window_stats?: Record<string, unknown> };
      };
      const ws = git.raw?.window_stats ?? {};
      delivery.merges_per_active = numOrNull(ws.merges_per_active);
      delivery.loc_per_active = numOrNull(ws.loc_per_active);
    } catch {
      process.stderr.write(
        `rollup: ${repoName} — unparseable collected/git.json, dropping per-active stats\n`
      );
    }
  } else {
    process.stderr.write(
      `rollup: ${repoName} — no collected/git.json, per-active stats unavailable\n`
    );
  }

  // Legacy summary fields derived from the audit (no flat <repo>.json needed).
  const auditTotal = numOrNull(audit.audit_total) ?? 0;
  const sourcesReachable = (audit.sources ?? [])
    .filter((s) => s.available)
    .map((s) => s.source ?? '')
    .filter((s) => s.length > 0);
  const contributors = numOrNull(byCheckId.get('DESC-01')?.value);

  return {
    repo: repoName,
    contributors: contributors ?? undefined,
    awarded_weight: auditTotal,
    sources_reachable: sourcesReachable,
    has_ai_tooling: hasAiTooling,
    audit_total: auditTotal,
    coverage: numOrNull(audit.coverage) ?? undefined,
    source_windows: audit.source_windows,
    standards_meta: audit.standards_meta,
    delivery,
    tech_stack: audit.tech_stack,
    linked_repos: audit.linked_repos,
    checks: checksForGaps,
  };
}
