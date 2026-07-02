import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DIR_MARKERS } from '../generated.ts';

export const VALID_STATUS = new Set(['PASS', 'WARN', 'FAIL', 'SKIP']);
// Deduped union of generated.ts DIR_MARKERS plus a few extras that only the
// file-walker needs (.git, __pycache__, target).  Keep this in sync by deriving
// from the single source of truth rather than duplicating the list.
export const DEFAULT_IGNORE = [
  ...new Set([...DIR_MARKERS, '.git', '__pycache__', 'target']),
];

// The audit writes its own artifacts into <repo>/context/audits/ — scanning
// that directory would let the audit score its own output (self-pollution),
// inflating every subsequent run. Every file walk must prune it.
export const AUDIT_OUTPUT_DIR = 'context/audits';

export interface DetectorResult {
  status: string;
  value: unknown;
  evidence: string[];
  method: string;
  /** Fraction of capability present: ∈ [0,1]. Default: PASS=1, WARN=0.5, FAIL=0, SKIP=0. */
  score: number;
  /** Fraction of applicable surface measured: ∈ [0,1]. Default: SKIP=0, all others=1. */
  confidence: number;
}

/** Default score mapping when no explicit score is provided. */
const STATUS_SCORE: Record<string, number> = {
  PASS: 1.0,
  WARN: 0.5,
  FAIL: 0.0,
  SKIP: 0.0,
};

export function makeResult(
  status: string,
  value: unknown,
  evidence: string[],
  method = 'detected',
  score?: number,
  confidence?: number
): DetectorResult {
  if (!VALID_STATUS.has(status)) {
    throw new Error(
      `status must be one of ${[...VALID_STATUS].sort()}, got ${status}`
    );
  }
  const resolvedScore = score ?? STATUS_SCORE[status] ?? 0;
  const resolvedConfidence = confidence ?? (status === 'SKIP' ? 0 : 1);
  return {
    status,
    value,
    evidence: [...evidence],
    method,
    score: resolvedScore,
    confidence: resolvedConfidence,
  };
}

// Use `find` for a fast, deterministic file walk (Unix host assumed); fall back is a JS walk.
export function iterFiles(
  repoPath: string,
  globs: string[],
  ignore = DEFAULT_IGNORE
): string[] {
  const pruneArgs = [
    ...ignore.flatMap((d) => ['-name', d, '-prune', '-o']),
    // Path-based prune of the audit's own output directory (see AUDIT_OUTPUT_DIR).
    '-path',
    `*/${AUDIT_OUTPUT_DIR}`,
    '-prune',
    '-o',
  ];
  const nameArgs = globs.flatMap((g, i) => {
    // Strip leading **/ glob prefix to get the bare filename pattern for find -name
    const bare = g.replace(/^\*\*\//, '');
    return i === 0 ? ['-name', bare] : ['-o', '-name', bare];
  });
  const out = execFileSync(
    'find',
    [repoPath, ...pruneArgs, '(', ...nameArgs, ')', '-type', 'f', '-print'],
    { encoding: 'utf8' }
  );
  return out.split('\n').filter(Boolean).sort();
}

export function grep(
  repoPath: string,
  pattern: RegExp,
  globs: string[],
  flags = ''
): Array<{ file: string; line: number; text: string }> {
  const hits: Array<{ file: string; line: number; text: string }> = [];
  const rx = new RegExp(pattern.source, pattern.flags || flags);
  for (const p of iterFiles(repoPath, globs)) {
    let text: string;
    try {
      text = readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    text.split('\n').forEach((line, i) => {
      if (rx.test(line))
        hits.push({
          file: relative(repoPath, p),
          line: i + 1,
          text: line.trim(),
        });
    });
  }
  return hits.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1
  );
}
