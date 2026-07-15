/**
 * backlog.ts — validation and math core for the audit improvement backlog.
 *
 * An LLM authors a `BacklogDraft` (tickets that each claim a share of one or
 * more audit checks' missing weight). `buildBacklog` validates the draft
 * against the scored audit it was written for, then computes the derived
 * numbers (missing weight recovered, coverage delta, topo-ordered slugs) —
 * the orchestrator never computes these itself, so a hallucinated draft
 * fails loud instead of silently mis-scoring the backlog.
 */
import type { AuditJson, Check } from './artifact_types.ts';
import { ENGINE_PROVENANCE } from './provenance.ts';

/** Share of total effort assumed parallelizable across independent tickets. */
export const PARALLELIZABLE_SHARE = 0.8;

export interface TicketCheckDraft {
  check_id: string;
  share: number;
}

export interface TicketDraft {
  id: string;
  title: string;
  goal: string;
  description: string;
  effort_dev_days: number;
  definition_of_done: string[];
  depends_on: string[]; // temp ids
  checks: TicketCheckDraft[];
}

export interface BacklogDraft {
  tickets: TicketDraft[];
}

export interface TicketCheck {
  check_id: string;
  dimension: string;
  share: number;
  missing_weight: number; // weight_max - weight_awarded of the check
  contribution: number; // share * missing_weight (absolute points)
}

export interface BacklogTicket {
  slug: string; // "A001-adopt-ci"
  seq: number; // 1-based topological position
  temp_id: string;
  title: string;
  goal: string;
  description: string;
  effort_dev_days: number;
  definition_of_done: string[];
  depends_on: string[]; // slugs (resolved)
  checks: TicketCheck[];
  missing_weight_recovered: number; // Σ contributions (absolute points)
  coverage_delta: number; // missing_weight_recovered / total_applicable_weight
}

export interface BacklogJson {
  date: string;
  project: string;
  audit_total: number;
  coverage: number | null;
  total_applicable_weight: number;
  total_missing_weight: number;
  parallelizable_share: number;
  tickets: BacklogTicket[];
  engine: { generated_by: string; version?: string };
}

export class BacklogValidationError extends Error {
  violations: string[];
  constructor(violations: string[]) {
    super(`backlog draft failed validation:\n${violations.join('\n')}`);
    this.name = 'BacklogValidationError';
    this.violations = violations;
  }
}

/** lowercase, alnum-dash, ≤40 chars, fallback 'ticket' when empty. */
export function kebab(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'ticket';
}

interface CheckInfo {
  dimension: string;
  applies: boolean;
  weight_max: number;
  missing_weight: number;
}

function flattenChecks(audit: AuditJson): Map<string, CheckInfo> {
  const map = new Map<string, CheckInfo>();
  for (const dim of audit.dimensions ?? []) {
    for (const check of dim.checks as Check[]) {
      map.set(check.check_id, {
        dimension: dim.dimension,
        applies: check.applies,
        weight_max: check.weight_max,
        missing_weight: check.weight_max - check.weight_awarded,
      });
    }
  }
  return map;
}

export function buildBacklog(
  audit: AuditJson,
  draft: BacklogDraft
): BacklogJson {
  const checkInfo = flattenChecks(audit);

  let total_applicable_weight = 0;
  let total_missing_weight = 0;
  for (const info of checkInfo.values()) {
    if (info.applies) {
      total_applicable_weight += info.weight_max;
      total_missing_weight += info.missing_weight;
    }
  }

  const violations: string[] = [];
  const tickets = draft.tickets;

  // Duplicate/empty id detection.
  const seenIds = new Set<string>();
  const dupIds = new Set<string>();
  for (const t of tickets) {
    if (!t.id) {
      violations.push('ticket has an empty id');
      continue;
    }
    if (seenIds.has(t.id)) dupIds.add(t.id);
    seenIds.add(t.id);
  }
  for (const id of dupIds) {
    violations.push(`duplicate ticket id: ${id}`);
  }

  const validIds = new Set(tickets.map((t) => t.id).filter(Boolean));

  for (const t of tickets) {
    const label = t.id || '<empty id>';
    if (!t.title) violations.push(`ticket ${label}: empty title`);
    if (!t.goal) violations.push(`ticket ${label}: empty goal`);
    if (!t.description) violations.push(`ticket ${label}: empty description`);
    if (
      typeof t.effort_dev_days !== 'number' ||
      !Number.isFinite(t.effort_dev_days) ||
      t.effort_dev_days <= 0
    ) {
      violations.push(
        `ticket ${label}: effort_dev_days must be a finite number > 0, got ${JSON.stringify(t.effort_dev_days)}`
      );
    }
    if (!t.checks || t.checks.length === 0) {
      violations.push(`ticket ${label}: checks must not be empty`);
    }
    for (const c of t.checks ?? []) {
      if (
        typeof c.share !== 'number' ||
        !Number.isFinite(c.share) ||
        c.share <= 0 ||
        c.share > 1
      ) {
        violations.push(
          `ticket ${label}: check ${c.check_id} share must be in (0, 1], got ${JSON.stringify(c.share)}`
        );
        continue;
      }
      const info = checkInfo.get(c.check_id);
      if (!info) {
        violations.push(`ticket ${label}: unknown check_id ${c.check_id}`);
        continue;
      }
      if (info.applies !== true) {
        violations.push(
          `ticket ${label}: check ${c.check_id} does not apply to this audit (applies !== true)`
        );
        continue;
      }
      if (info.missing_weight <= 0) {
        violations.push(
          `ticket ${label}: check ${c.check_id} has no missing weight (already fully awarded)`
        );
      }
    }
    for (const dep of t.depends_on ?? []) {
      if (dep === t.id) {
        violations.push(
          `ticket ${label}: depends_on references itself (${dep})`
        );
      } else if (!validIds.has(dep)) {
        violations.push(
          `ticket ${label}: depends_on references unknown ticket id ${dep}`
        );
      }
    }
  }

  // Per-check total share across all tickets.
  const shareByCheck = new Map<string, number>();
  for (const t of tickets) {
    for (const c of t.checks ?? []) {
      if (!checkInfo.has(c.check_id)) continue;
      if (typeof c.share !== 'number' || !Number.isFinite(c.share)) continue;
      shareByCheck.set(
        c.check_id,
        (shareByCheck.get(c.check_id) ?? 0) + c.share
      );
    }
  }
  for (const [checkId, sum] of shareByCheck) {
    if (sum > 1 + 1e-9) {
      violations.push(
        `check ${checkId}: Σ share across tickets is ${sum} (must be ≤ 1)`
      );
    }
  }

  // Kahn topological sort over temp ids (draft order breaks ties).
  const idOrder = tickets.map((t) => t.id);
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const t of tickets) {
    if (!t.id || dupIds.has(t.id)) continue;
    if (!inDegree.has(t.id)) inDegree.set(t.id, 0);
  }
  for (const t of tickets) {
    if (!t.id || dupIds.has(t.id)) continue;
    for (const dep of t.depends_on ?? []) {
      if (dep === t.id || !validIds.has(dep) || dupIds.has(dep)) continue;
      inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
      const arr = dependents.get(dep) ?? [];
      arr.push(t.id);
      dependents.set(dep, arr);
    }
  }

  const ready: string[] = [];
  for (const id of idOrder) {
    if (dupIds.has(id) || !id) continue;
    if ((inDegree.get(id) ?? 0) === 0) ready.push(id);
  }
  const topoOrder: string[] = [];
  const remaining = new Set(inDegree.keys());
  while (ready.length > 0) {
    // Stable: always take the earliest-in-draft-order ready node.
    ready.sort((a, b) => idOrder.indexOf(a) - idOrder.indexOf(b));
    const next = ready.shift()!;
    if (!remaining.has(next)) continue;
    remaining.delete(next);
    topoOrder.push(next);
    for (const dependent of dependents.get(next) ?? []) {
      const deg = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, deg);
      if (deg === 0 && remaining.has(dependent)) ready.push(dependent);
    }
  }
  if (remaining.size > 0) {
    violations.push(
      `dependency cycle among: ${[...remaining].sort().join(', ')}`
    );
  }

  if (violations.length > 0) {
    throw new BacklogValidationError(violations);
  }

  const idToSlug = new Map<string, string>();
  const ticketById = new Map(tickets.map((t) => [t.id, t]));

  const backlogTickets: BacklogTicket[] = topoOrder.map((id, index) => {
    const t = ticketById.get(id)!;
    const seq = index + 1;
    const slug = `A${String(seq).padStart(3, '0')}-${kebab(t.title)}`;
    idToSlug.set(id, slug);

    const checks: TicketCheck[] = t.checks.map((c) => {
      const info = checkInfo.get(c.check_id)!;
      const contribution = c.share * info.missing_weight;
      return {
        check_id: c.check_id,
        dimension: info.dimension,
        share: c.share,
        missing_weight: info.missing_weight,
        contribution,
      };
    });
    const missing_weight_recovered = checks.reduce(
      (s, c) => s + c.contribution,
      0
    );
    const coverage_delta =
      total_applicable_weight > 0
        ? missing_weight_recovered / total_applicable_weight
        : 0;

    return {
      slug,
      seq,
      temp_id: id,
      title: t.title,
      goal: t.goal,
      description: t.description,
      effort_dev_days: t.effort_dev_days,
      definition_of_done: t.definition_of_done,
      depends_on: [], // resolved below, once all slugs are known
      checks,
      missing_weight_recovered,
      coverage_delta,
    };
  });

  for (const ticket of backlogTickets) {
    const t = ticketById.get(ticket.temp_id)!;
    ticket.depends_on = (t.depends_on ?? []).map((dep) => idToSlug.get(dep)!);
  }

  return {
    date: audit.date,
    project: audit.project,
    audit_total: audit.audit_total,
    coverage: audit.coverage,
    total_applicable_weight,
    total_missing_weight,
    parallelizable_share: PARALLELIZABLE_SHARE,
    tickets: backlogTickets,
    engine: ENGINE_PROVENANCE,
  };
}
