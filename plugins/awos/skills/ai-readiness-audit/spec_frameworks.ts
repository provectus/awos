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
  /** Headings a single-file record must carry to be complete. */
  recordSections: string[];
  /** Status values meaning the record is still in flight. */
  statusActive: string[];
  /** Status values meaning the record is settled. */
  statusTerminal: string[];
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

/** Absolute spec-record roots for a framework, resolved through inheritance. */
export function specRootsFor(
  repoPath: string,
  fw: SpecFramework,
  params?: unknown
): Array<{ path: string; origin: PathOrigin }> {
  const roots: Array<{ path: string; origin: PathOrigin }> = [];
  for (const rel of fw.specRoots) {
    const probe = probeRepoPath(repoPath, params, rel);
    if (probe.path !== null)
      roots.push({ path: probe.path, origin: probe.origin });
  }
  return roots;
}
