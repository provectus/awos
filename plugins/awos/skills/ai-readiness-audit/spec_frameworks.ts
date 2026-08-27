// ---------------------------------------------------------------------------
// spec_frameworks.ts — recognized spec-driven practices.
//
// The spec-driven-development dimension measures whether significant work is
// designed before it is built and whether that design is recorded where the
// next person (or agent) will find it. That discipline predates AWOS and is
// not owned by it: Kiro, Agent-OS, GitHub Spec Kit and a plain ADR practice
// all express it. Scoring only AWOS artifacts made the dimension read as
// vendor promotion and penalized every repo that never opted in.
//
// So: AWOS is one recognized convention among several, and the checks gate on
// whichever practice a repository actually uses.
// ---------------------------------------------------------------------------
import { readdirSync } from 'node:fs';
import { probeRepoPath, type PathOrigin } from './detectors/_base.ts';

export interface SpecFramework {
  id: string;
  label: string;
  /** Paths whose presence indicates the practice is adopted. */
  markers: string[];
  /** Directories holding individual records. */
  specRoots: string[];
  /** Files that together make one record complete. Empty for single-file practices. */
  recordTriad: string[];
  /**
   * Alternative to `recordTriad` for a convention whose record files are
   * pattern-named rather than fixed (e.g. GSD's `NN-PP-PLAN.md`). A record
   * directory is structurally complete when at least one of its files
   * matches. A framework declares one or the other, never both.
   */
  recordFilePattern?: RegExp;
  /** Headings a single-file record must carry to be complete. */
  recordSections: string[];
  /** Status values meaning the record is still in flight. */
  statusActive: string[];
  /** Status values meaning the record is settled. */
  statusTerminal: string[];
  /**
   * Repo-relative path to a single project-level status file (e.g. GSD's
   * `.planning/STATE.md`), for a convention that tracks status once for the
   * whole project rather than per record. When set, every record of this
   * framework is judged against this one file's status instead of its own.
   */
  projectStatusFile?: string;
}

/** Minimum records before a decision-record practice counts as adopted. */
export const MIN_DECISION_RECORDS = 3;

// Note on a deliberate omission: the design doc lists `DECISIONS.md` among
// recognized decision-record practices, and this registry does not include it.
// That is intentional, not an oversight. A single file cannot serve as a
// `specRoot` (records are enumerated by reading a directory), and it cannot
// clear MIN_DECISION_RECORDS, which counts discrete records. Listing it as a
// marker would create an entry that can never qualify — worse than absent,
// because a reader would assume the practice is supported. A project that
// keeps all its decisions in one file is better served by a future
// single-file-practice shape than by a marker that silently never fires.

export const SPEC_FRAMEWORKS: readonly SpecFramework[] = [
  {
    id: 'awos',
    label: 'AWOS',
    markers: ['.awos', 'context/spec', 'context/product'],
    specRoots: ['context/spec'],
    recordTriad: [
      'functional-spec.md',
      'technical-considerations.md',
      'tasks.md',
    ],
    recordSections: [],
    statusActive: ['Draft', 'In Review', 'Approved'],
    statusTerminal: ['Completed'],
  },
  {
    id: 'kiro',
    label: 'Kiro',
    markers: ['.kiro/specs'],
    specRoots: ['.kiro/specs'],
    recordTriad: ['requirements.md', 'design.md', 'tasks.md'],
    recordSections: [],
    statusActive: ['Draft', 'In Progress'],
    statusTerminal: ['Done', 'Completed'],
  },
  {
    id: 'agent-os',
    label: 'Agent-OS',
    markers: ['.agent-os/specs'],
    specRoots: ['.agent-os/specs'],
    recordTriad: ['spec.md', 'tasks.md'],
    recordSections: [],
    statusActive: ['Draft', 'In Progress'],
    statusTerminal: ['Done', 'Completed'],
  },
  {
    id: 'spec-kit',
    label: 'GitHub Spec Kit',
    markers: ['.specify', 'specs'],
    specRoots: ['specs'],
    recordTriad: ['spec.md', 'plan.md', 'tasks.md'],
    recordSections: [],
    statusActive: ['Draft', 'In Progress'],
    statusTerminal: ['Done', 'Completed'],
  },
  {
    id: 'adr',
    label: 'ADR / design-doc practice',
    markers: [
      'docs/adr',
      'doc/adr',
      'docs/decisions',
      'docs/rfcs',
      'design-docs',
    ],
    specRoots: [
      'docs/adr',
      'doc/adr',
      'docs/decisions',
      'docs/rfcs',
      'design-docs',
    ],
    recordTriad: [],
    recordSections: ['Status', 'Context', 'Decision', 'Consequences'],
    statusActive: ['Proposed', 'Draft'],
    statusTerminal: ['Accepted', 'Superseded', 'Deprecated', 'Rejected'],
  },
  {
    id: 'openspec',
    label: 'OpenSpec',
    // openspec/ also holds a project.md and an archived/deployed specs/
    // tree; changes/ is where individual proposals — the actual records —
    // live, one directory per change (proposal.md, tasks.md, and an
    // optional design.md). design.md is intentionally not required: it is
    // documented as optional, and requiring it would penalize a project
    // using OpenSpec correctly.
    markers: ['openspec'],
    specRoots: ['openspec/changes'],
    recordTriad: ['proposal.md', 'tasks.md'],
    recordSections: [],
    // OpenSpec does not publish a `Status:` field on proposal.md — a change
    // is "active" simply by living under changes/ and "terminal" once moved
    // to changes/archive/. This check reads status from record content, not
    // directory location, so these values are a best-effort placeholder: if
    // a project's proposal.md never declares one of them, its records fall
    // out of the ratio as "no recognized status" (see detectStaleSpecs)
    // rather than being scored either way.
    statusActive: ['Draft', 'In Progress', 'Proposed'],
    statusTerminal: ['Approved', 'Archived', 'Completed', 'Deployed'],
  },
  {
    id: 'gsd',
    label: 'GSD',
    // "Git. Ship. Done." — https://github.com/open-gsd/gsd-core
    markers: ['.planning'],
    specRoots: ['.planning/phases'],
    recordTriad: [],
    // GSD's records are pattern-named (03-01-PLAN.md, 03-02-PLAN.md, …)
    // rather than a fixed file set — a phase directory is structurally
    // complete once it holds at least one matching file.
    recordFilePattern: /-PLAN\.md$/,
    recordSections: [],
    // Status is tracked once for the whole project in .planning/STATE.md's
    // YAML frontmatter (`status: executing`), not per record — see
    // projectStatusFile. Every phase directory is judged against this one
    // vocabulary.
    statusActive: [
      'discussing',
      'planning',
      'executing',
      'verifying',
      'paused',
      'stopped',
    ],
    statusTerminal: ['complete', 'completed', 'done'],
    projectStatusFile: '.planning/STATE.md',
  },
];

/** Count markdown records directly under `dir`. */
function recordCount(dir: string): number {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter(
      (e) =>
        (e.isFile() &&
          e.name.endsWith('.md') &&
          e.name.toLowerCase() !== 'readme.md') ||
        e.isDirectory()
    ).length;
  } catch {
    return 0;
  }
}

/**
 * Which recognized practices this repository uses, and whether each was found
 * in the repo itself or inherited from an orchestration root.
 *
 * A framework with an explicit installation marker counts on presence alone. A
 * bare decision-record practice must clear MIN_DECISION_RECORDS: one stray ADR
 * is not a practice, and the dimension should not award points for it.
 */
export function detectSpecFrameworks(
  repoPath: string,
  params?: unknown
): Array<{ framework: SpecFramework; origin: PathOrigin }> {
  const out: Array<{ framework: SpecFramework; origin: PathOrigin }> = [];
  for (const fw of SPEC_FRAMEWORKS) {
    let origin: PathOrigin | null = null;
    for (const marker of fw.markers) {
      const probe = probeRepoPath(repoPath, params, marker);
      if (probe.path === null) continue;
      if (fw.id === 'adr' && recordCount(probe.path) < MIN_DECISION_RECORDS) {
        continue;
      }
      origin = probe.origin;
      break;
    }
    if (origin !== null) out.push({ framework: fw, origin });
  }
  return out;
}

/**
 * Absolute spec-record roots for a framework, resolved through inheritance.
 * `rel` is the declared marker that actually matched (e.g. "docs/adr"), so a
 * caller can report which of a framework's several possible roots is really
 * present without re-deriving that from `fw.specRoots` (which would list
 * every possible root, found or not).
 */
export function specRootsFor(
  repoPath: string,
  fw: SpecFramework,
  params?: unknown
): Array<{ path: string; origin: PathOrigin; rel: string }> {
  const roots: Array<{ path: string; origin: PathOrigin; rel: string }> = [];
  for (const rel of fw.specRoots) {
    const probe = probeRepoPath(repoPath, params, rel);
    if (probe.path !== null)
      roots.push({ path: probe.path, origin: probe.origin, rel });
  }
  return roots;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A specRoot equal to one of these is a generic conventional directory name
// also used for non-spec purposes (RSpec/Jest test suites live in specs/ and
// spec/ too) — it cannot be matched bare and is left to the generic
// filename-based pattern below instead.
const AMBIGUOUS_ROOT_NAMES = new Set(['specs', 'spec']);

/**
 * A single regex recognizing an impl-file reference to a spec/decision
 * record under any recognized convention — the single source of truth for
 * DOC-07's spec-reference matching, built from the same registry SDD-01/04/05/06
 * read instead of a hand-maintained duplicate.
 */
export function buildSpecRefPattern(): RegExp {
  const alternatives: string[] = [];

  for (const fw of SPEC_FRAMEWORKS) {
    // A decision record (ADR) is not a spec↔impl cross-reference in the
    // sense DOC-07 measures — it documents a choice, not a plan an
    // implementation traces back to.
    if (fw.id === 'adr') continue;
    for (const root of fw.specRoots) {
      if (AMBIGUOUS_ROOT_NAMES.has(root)) continue;
      alternatives.push(
        fw.id === 'awos'
          ? // AWOS numbers its records — require the numeric prefix, matching
            // its own convention (and the pre-existing behavior here).
            `${escapeRegex(root)}\\/\\d{3}-`
          : `${escapeRegex(root)}\\/`
      );
    }
  }

  // Spec Kit's specRoot ("specs") is ambiguous on its own, but its install
  // marker (.specify/) is unique enough to count as a reference by itself.
  alternatives.push('\\.specify\\/');

  // Generic multi-file record pattern: any specs?/ root — numbered or not —
  // whose record holds one of the file names a recognized multi-file
  // framework uses. Covers records living directly under a plain specs/ or
  // spec/ directory rather than a dotted framework root.
  const recordFiles = new Set<string>();
  for (const fw of SPEC_FRAMEWORKS) {
    for (const f of fw.recordTriad) recordFiles.add(f);
  }
  alternatives.push(
    `specs?\\/[\\w-]+\\/(?:${[...recordFiles].map(escapeRegex).join('|')})`
  );
  // A bare numbered spec/NNN- convention outside context/ — not owned by any
  // named framework, so not derivable from the registry.
  alternatives.push('(?<!\\/)spec\\/\\d{3}-');

  return new RegExp(alternatives.join('|'), 'i');
}
