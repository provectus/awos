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
import {
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { join, basename, dirname } from 'node:path';
import type { AuditJson, Check } from './artifact_types.ts';
import { ENGINE_PROVENANCE, hasEngineProvenance } from './provenance.ts';
import { requireStampedAudit } from './audit_patch.ts';
import { renderTicketMd, renderBacklogHtml } from './backlog_render.ts';

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

// ---------------------------------------------------------------------------
// Org mode — aggregate per-repo backlogs into one portfolio backlog.
// ---------------------------------------------------------------------------

export interface OrgMemberRef {
  repo: string;
  slug: string;
}

export interface OrgTicketDraft {
  id: string;
  title: string;
  goal: string;
  description: string;
  depends_on: string[]; // org ticket ids
  members: OrgMemberRef[]; // ≥1; refs to per-repo ticket slugs
}

export interface OrgBacklogDraft {
  org_tickets: OrgTicketDraft[];
}

export interface OrgTicketMember {
  repo: string;
  slug: string;
  title: string;
  effort_dev_days: number;
  coverage_delta: number;
  missing_weight_recovered: number;
  ticket_href: string; // "per-repo/<repo>/backlog/tickets/<slug>.md"
}

export interface OrgBacklogTicket {
  id: string;
  seq: number;
  title: string;
  goal: string;
  description: string;
  depends_on: string[]; // org ticket ids
  members: OrgTicketMember[];
  effort_dev_days: number; // Σ member effort
  missing_weight_recovered: number; // Σ member recovered points
  coverage_delta: number; // ÷ org total applicable weight
  repos_covered: number;
}

export interface OrgBacklogJson {
  org: true;
  date: string;
  project: string;
  total_repos: number;
  total_applicable_weight: number; // Σ per-repo totals
  parallelizable_share: number;
  repos: Array<{
    repo: string;
    /** null for a repo scanned via its audit-only fallback (no generated backlog to link to). */
    backlog_href: string | null;
    total_applicable_weight: number;
    /** Current standards coverage of the repo (0..1), or null when unknown. */
    coverage: number | null;
    /** Tickets in the repo's own backlog (0 for an audit-only fallback repo). */
    ticket_count: number;
    /** Σ effort_dev_days of the repo's tickets (0 for an audit-only fallback repo). */
    effort_dev_days: number;
  }>;
  tickets: OrgBacklogTicket[];
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

  if (tickets.length === 0) {
    violations.push('draft has no tickets');
  }

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

export interface GenerateSummary {
  backlog_dir: string; // <outDir>/backlog
  backlog_json: string; // path
  backlog_html: string; // path
  tickets_written: string[]; // relative paths under backlog/
  warnings: string[];
}

/**
 * Shape-check a raw single-repo ticket draft before it reaches `buildBacklog`.
 * Only called once `generateBacklog` has already classified the draft shape
 * as single-repo, so this is a safety net, not the primary discriminator.
 */
function shapeCheckDraft(draftRaw: unknown): BacklogDraft {
  if (
    draftRaw === null ||
    typeof draftRaw !== 'object' ||
    !Array.isArray((draftRaw as Record<string, unknown>).tickets)
  ) {
    throw new BacklogValidationError([
      'draft must be an object with a "tickets" array',
    ]);
  }
  return draftRaw as unknown as BacklogDraft;
}

/** Same, for an org draft. */
function shapeCheckOrgDraft(draftRaw: unknown): OrgBacklogDraft {
  if (
    draftRaw === null ||
    typeof draftRaw !== 'object' ||
    !Array.isArray((draftRaw as Record<string, unknown>).org_tickets)
  ) {
    throw new BacklogValidationError([
      'org draft must be an object with an "org_tickets" array',
    ]);
  }
  return draftRaw as unknown as OrgBacklogDraft;
}

/** Which draft shape `draftRaw` matches, or null when it matches neither. */
function classifyDraftShape(draftRaw: unknown): 'org' | 'single' | null {
  if (draftRaw === null || typeof draftRaw !== 'object') return null;
  const obj = draftRaw as Record<string, unknown>;
  if (Array.isArray(obj.org_tickets)) return 'org';
  if (Array.isArray(obj.tickets)) return 'single';
  return null;
}

/**
 * Validate the orchestrator's ticket draft, then write the rendered backlog
 * to disk. Routes on draft shape: a `tickets` array is a single-repo draft
 * (validated against the stamped `audit.json` in `outDir`); an `org_tickets`
 * array is an org draft (validated against the stamped per-repo backlogs
 * under `outDir/per-repo/*`, see `generateOrgBacklog`).
 */
export function generateBacklog(
  outDir: string,
  draftRaw: unknown
): GenerateSummary {
  const shape = classifyDraftShape(draftRaw);
  if (shape === 'org') return generateOrgBacklog(outDir, draftRaw);
  if (shape === 'single') return generateSingleRepoBacklog(outDir, draftRaw);
  throw new BacklogValidationError([
    'draft must have either a "tickets" array (single-repo backlog) or an ' +
      '"org_tickets" array (org backlog)',
  ]);
}

function generateSingleRepoBacklog(
  outDir: string,
  draftRaw: unknown
): GenerateSummary {
  const audit = requireStampedAudit(
    outDir,
    'generate-backlog'
  ) as unknown as AuditJson;
  const draft = shapeCheckDraft(draftRaw);
  const backlog = buildBacklog(audit, draft);

  const backlogDir = join(outDir, 'backlog');
  const ticketsDir = join(backlogDir, 'tickets');
  mkdirSync(ticketsDir, { recursive: true });

  const backlogJsonPath = join(backlogDir, 'backlog.json');
  writeFileSync(backlogJsonPath, JSON.stringify(backlog, null, 2));

  const ticketsWritten: string[] = [];
  for (const ticket of backlog.tickets) {
    const relPath = join('tickets', `${ticket.slug}.md`);
    writeFileSync(join(backlogDir, relPath), renderTicketMd(backlog, ticket));
    ticketsWritten.push(relPath);
  }

  const backlogHtmlPath = join(backlogDir, 'backlog.html');
  writeFileSync(backlogHtmlPath, renderBacklogHtml(backlog));

  return {
    backlog_dir: backlogDir,
    backlog_json: backlogJsonPath,
    backlog_html: backlogHtmlPath,
    tickets_written: ticketsWritten,
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Org mode internals
// ---------------------------------------------------------------------------

interface PerRepoScan {
  repo: string;
  /** Parsed, provenance-stamped per-repo backlog, when one exists. */
  backlog: BacklogJson | null;
  /** A backlog.json existed but lacked (or failed to parse for) the stamp. */
  backlogUnstamped: boolean;
  /** Applicable weight derived from audit.json, used only when no backlog exists. */
  auditWeight: number | null;
  /** Coverage derived from audit.json, used only when no backlog exists. */
  auditCoverage: number | null;
  auditUnstamped: boolean;
  auditMissing: boolean;
}

/**
 * Enumerate `<orgDir>/per-repo/*` and, per repo, load whatever tells us its
 * applicable weight: the generated backlog when one exists (preferred, since
 * it also carries the ticket data org members reference), else a fallback
 * sum over the stamped audit's applies-true check weights.
 */
function scanPerRepo(orgDir: string): PerRepoScan[] {
  const perRepoDir = join(orgDir, 'per-repo');
  let repoNames: string[] = [];
  try {
    repoNames = readdirSync(perRepoDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    repoNames = [];
  }

  return repoNames.map((repo) => {
    const repoDir = join(perRepoDir, repo);
    const backlogPath = join(repoDir, 'backlog', 'backlog.json');
    let backlog: BacklogJson | null = null;
    let backlogUnstamped = false;
    if (existsSync(backlogPath)) {
      try {
        const parsed = JSON.parse(readFileSync(backlogPath, 'utf8'));
        if (hasEngineProvenance(parsed)) backlog = parsed as BacklogJson;
        else backlogUnstamped = true;
      } catch {
        backlogUnstamped = true;
      }
    }

    let auditWeight: number | null = null;
    let auditCoverage: number | null = null;
    let auditUnstamped = false;
    let auditMissing = false;
    if (!backlog && !backlogUnstamped) {
      const auditPath = join(repoDir, 'audit.json');
      if (!existsSync(auditPath)) {
        auditMissing = true;
      } else {
        try {
          const audit = JSON.parse(
            readFileSync(auditPath, 'utf8')
          ) as AuditJson;
          if (!hasEngineProvenance(audit)) {
            auditUnstamped = true;
          } else {
            let w = 0;
            for (const dim of audit.dimensions ?? []) {
              for (const check of dim.checks as Check[]) {
                if (check.applies) w += check.weight_max;
              }
            }
            auditWeight = w;
            auditCoverage =
              typeof audit.coverage === 'number' ? audit.coverage : null;
          }
        } catch {
          auditUnstamped = true;
        }
      }
    }

    return {
      repo,
      backlog,
      backlogUnstamped,
      auditWeight,
      auditCoverage,
      auditUnstamped,
      auditMissing,
    };
  });
}

/** ISO audit-run directory name, e.g. `2026-07-15_17-59-50`. */
const AUDIT_TIMESTAMP = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;

/**
 * Human-readable project name for an org backlog. `basename(orgDir)` is wrong
 * for the canonical layout `<projectRoot>/context/audits/<timestamp>` — it
 * yields the timestamp. Prefer an explicit `project` from the org-portfolio
 * artifact; otherwise, when orgDir is a timestamped audits directory, fall back
 * to the project root's name three levels up; otherwise keep the basename.
 */
function resolveOrgProject(orgDir: string): string {
  const portfolioPath = join(orgDir, 'org-portfolio.json');
  if (existsSync(portfolioPath)) {
    try {
      const portfolio = JSON.parse(readFileSync(portfolioPath, 'utf8'));
      if (typeof portfolio?.project === 'string' && portfolio.project.trim()) {
        return portfolio.project.trim();
      }
    } catch {
      // fall through to path-based resolution
    }
  }

  const base = basename(orgDir);
  if (
    AUDIT_TIMESTAMP.test(base) &&
    basename(dirname(orgDir)) === 'audits' &&
    basename(dirname(dirname(orgDir))) === 'context'
  ) {
    return basename(dirname(dirname(dirname(orgDir))));
  }
  return base;
}

/**
 * Aggregate the per-repo backlogs referenced by an org draft's `org_tickets`
 * into one portfolio backlog. Each org ticket's members must resolve to a
 * real ticket in the named repo's own (stamped) backlog; the numbers on the
 * org ticket are pure sums/quotients over its members' already-computed
 * per-repo numbers — this function never re-derives a per-repo check's math.
 */
export function buildOrgBacklog(
  orgDir: string,
  draft: OrgBacklogDraft
): OrgBacklogJson {
  const violations: string[] = [];
  const entries = scanPerRepo(orgDir);
  if (entries.length === 0) {
    violations.push(
      `no repo subdirectories found under ${join(orgDir, 'per-repo')}`
    );
  }

  const orgTickets = draft.org_tickets ?? [];
  if (orgTickets.length === 0) {
    violations.push('draft has no org_tickets');
  }
  const referencedRepos = new Set<string>();
  for (const t of orgTickets) {
    for (const m of t.members ?? []) {
      if (m?.repo) referencedRepos.add(m.repo);
    }
  }

  const repoWeight = new Map<string, number>();
  let total_applicable_weight = 0;
  for (const e of entries) {
    if (e.backlogUnstamped) {
      violations.push(
        `repo "${e.repo}" backlog/backlog.json lacks engine provenance — run generate-backlog for it first`
      );
      continue;
    }
    if (e.backlog) {
      repoWeight.set(e.repo, e.backlog.total_applicable_weight);
      total_applicable_weight += e.backlog.total_applicable_weight;
      continue;
    }
    if (referencedRepos.has(e.repo)) {
      violations.push(
        `repo "${e.repo}" has no backlog/backlog.json — run generate-backlog for it first`
      );
      continue;
    }
    if (e.auditMissing) {
      violations.push(
        `repo "${e.repo}" has no backlog/backlog.json and no audit.json — run audit-core for it first`
      );
    } else if (e.auditUnstamped) {
      violations.push(
        `repo "${e.repo}" audit.json lacks engine provenance — run audit-core for it first`
      );
    } else {
      repoWeight.set(e.repo, e.auditWeight ?? 0);
      total_applicable_weight += e.auditWeight ?? 0;
    }
  }

  const entryByRepo = new Map(entries.map((e) => [e.repo, e]));

  // Duplicate/empty id detection.
  const seenIds = new Set<string>();
  const dupIds = new Set<string>();
  for (const t of orgTickets) {
    if (!t.id) {
      violations.push('org ticket has an empty id');
      continue;
    }
    if (seenIds.has(t.id)) dupIds.add(t.id);
    seenIds.add(t.id);
  }
  for (const id of dupIds) {
    violations.push(`duplicate org ticket id: ${id}`);
  }
  const validIds = new Set(orgTickets.map((t) => t.id).filter(Boolean));

  // repo::slug -> owning org ticket id, to catch double-counted members.
  const memberOwner = new Map<string, string>();

  for (const t of orgTickets) {
    const label = t.id || '<empty id>';
    if (!t.title) violations.push(`org ticket ${label}: empty title`);
    if (!t.goal) violations.push(`org ticket ${label}: empty goal`);
    if (!t.description)
      violations.push(`org ticket ${label}: empty description`);
    if (!t.members || t.members.length === 0) {
      violations.push(`org ticket ${label}: members must not be empty`);
    }
    const seenInTicket = new Set<string>();
    for (const m of t.members ?? []) {
      const entry = entryByRepo.get(m.repo);
      if (!entry) {
        violations.push(
          `org ticket ${label}: member repo "${m.repo}" has no per-repo/${m.repo} directory`
        );
        continue;
      }
      const repoBacklog = entry.backlog;
      if (!repoBacklog) continue; // repo-level violation already recorded above
      const found = repoBacklog.tickets.find((bt) => bt.slug === m.slug);
      if (!found) {
        violations.push(
          `org ticket ${label}: repo "${m.repo}" has no ticket "${m.slug}"`
        );
        continue;
      }
      const key = `${m.repo}::${m.slug}`;
      if (seenInTicket.has(key)) {
        violations.push(
          `org ticket ${label}: member ${m.repo}/${m.slug} is listed more than once`
        );
        continue;
      }
      seenInTicket.add(key);
      const owner = memberOwner.get(key);
      if (owner && owner !== t.id) {
        violations.push(
          `ticket ${m.repo}/${m.slug} is claimed by both org tickets "${owner}" and "${label}" — a per-repo ticket may belong to only one org ticket`
        );
      } else {
        memberOwner.set(key, t.id);
      }
    }
    for (const dep of t.depends_on ?? []) {
      if (dep === t.id) {
        violations.push(
          `org ticket ${label}: depends_on references itself (${dep})`
        );
      } else if (!validIds.has(dep)) {
        violations.push(
          `org ticket ${label}: depends_on references unknown org ticket id ${dep}`
        );
      }
    }
  }

  // Kahn topological sort over org ticket ids (draft order breaks ties).
  const idOrder = orgTickets.map((t) => t.id);
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const t of orgTickets) {
    if (!t.id || dupIds.has(t.id)) continue;
    if (!inDegree.has(t.id)) inDegree.set(t.id, 0);
  }
  for (const t of orgTickets) {
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
      `org ticket dependency cycle among: ${[...remaining].sort().join(', ')}`
    );
  }

  if (violations.length > 0) {
    throw new BacklogValidationError(violations);
  }

  const ticketById = new Map(orgTickets.map((t) => [t.id, t]));
  const orgBacklogTickets: OrgBacklogTicket[] = topoOrder.map((id, index) => {
    const t = ticketById.get(id)!;
    const seq = index + 1;
    const members: OrgTicketMember[] = t.members.map((m) => {
      const repoBacklog = entryByRepo.get(m.repo)!.backlog!;
      const bt = repoBacklog.tickets.find((x) => x.slug === m.slug)!;
      return {
        repo: m.repo,
        slug: m.slug,
        title: bt.title,
        effort_dev_days: bt.effort_dev_days,
        coverage_delta: bt.coverage_delta,
        missing_weight_recovered: bt.missing_weight_recovered,
        ticket_href: `per-repo/${m.repo}/backlog/tickets/${m.slug}.md`,
      };
    });
    const effort_dev_days = members.reduce((s, m) => s + m.effort_dev_days, 0);
    const missing_weight_recovered = members.reduce(
      (s, m) => s + m.missing_weight_recovered,
      0
    );
    const coverage_delta =
      total_applicable_weight > 0
        ? missing_weight_recovered / total_applicable_weight
        : 0;
    const repos_covered = new Set(members.map((m) => m.repo)).size;

    return {
      id: t.id,
      seq,
      title: t.title,
      goal: t.goal,
      description: t.description,
      depends_on: t.depends_on ?? [],
      members,
      effort_dev_days,
      missing_weight_recovered,
      coverage_delta,
      repos_covered,
    };
  });

  const repos = entries.map((e) => {
    if (e.backlog) {
      return {
        repo: e.repo,
        backlog_href: `per-repo/${e.repo}/backlog/backlog.html`,
        total_applicable_weight: e.backlog.total_applicable_weight,
        coverage: e.backlog.coverage,
        ticket_count: e.backlog.tickets.length,
        effort_dev_days: e.backlog.tickets.reduce(
          (s, t) => s + t.effort_dev_days,
          0
        ),
      };
    }
    // audit-only fallback repos (e.backlog null) have no generated backlog.html
    // to link to, and no tickets — only a coverage/weight headline from audit.json.
    return {
      repo: e.repo,
      backlog_href: null,
      total_applicable_weight: repoWeight.get(e.repo) ?? 0,
      coverage: e.auditCoverage,
      ticket_count: 0,
      effort_dev_days: 0,
    };
  });

  return {
    org: true,
    date: new Date().toISOString().slice(0, 10),
    project: resolveOrgProject(orgDir),
    total_repos: entries.length,
    total_applicable_weight,
    parallelizable_share: PARALLELIZABLE_SHARE,
    repos,
    tickets: orgBacklogTickets,
    engine: ENGINE_PROVENANCE,
  };
}

/** Per-repo tickets no org ticket references — reported as warnings, not violations. */
function collectUnlinkedTicketWarnings(
  orgDir: string,
  draft: OrgBacklogDraft
): string[] {
  const referenced = new Set<string>();
  for (const t of draft.org_tickets ?? []) {
    for (const m of t.members ?? []) {
      if (m?.repo && m?.slug) referenced.add(`${m.repo}::${m.slug}`);
    }
  }

  const warnings: string[] = [];
  for (const entry of scanPerRepo(orgDir)) {
    if (!entry.backlog) continue;
    for (const ticket of entry.backlog.tickets) {
      if (!referenced.has(`${entry.repo}::${ticket.slug}`)) {
        warnings.push(
          `unlinked per-repo ticket ${entry.repo}/${ticket.slug} — not referenced by any org ticket`
        );
      }
    }
  }
  return warnings;
}

/**
 * Validate an org draft against the stamped per-repo backlogs under
 * `orgDir/per-repo/*`, then write the aggregated portfolio backlog to disk:
 * `backlog/backlog.json` and `backlog/backlog.html`. Unlike the single-repo
 * path, no per-ticket markdown files are written — org tickets link back to
 * the per-repo ticket files their members already came from.
 */
export function generateOrgBacklog(
  orgDir: string,
  draftRaw: unknown
): GenerateSummary {
  const draft = shapeCheckOrgDraft(draftRaw);
  const backlog = buildOrgBacklog(orgDir, draft);

  const backlogDir = join(orgDir, 'backlog');
  mkdirSync(backlogDir, { recursive: true });

  const backlogJsonPath = join(backlogDir, 'backlog.json');
  writeFileSync(backlogJsonPath, JSON.stringify(backlog, null, 2));

  const backlogHtmlPath = join(backlogDir, 'backlog.html');
  writeFileSync(backlogHtmlPath, renderBacklogHtml(backlog));

  return {
    backlog_dir: backlogDir,
    backlog_json: backlogJsonPath,
    backlog_html: backlogHtmlPath,
    tickets_written: [],
    warnings: collectUnlinkedTicketWarnings(orgDir, draft),
  };
}
