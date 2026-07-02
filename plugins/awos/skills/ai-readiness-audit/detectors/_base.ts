import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
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
  // Enforce the documented [0,1] invariant: clamp any explicitly provided
  // score/confidence into range rather than letting out-of-range values
  // propagate into the aggregation math.
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const resolvedScore = clamp01(score ?? STATUS_SCORE[status] ?? 0);
  const resolvedConfidence = clamp01(confidence ?? (status === 'SKIP' ? 0 : 1));
  return {
    status,
    value,
    evidence: [...evidence],
    method,
    score: resolvedScore,
    confidence: resolvedConfidence,
  };
}

// Use `find` for a fast, deterministic file walk (Unix host assumed); if
// `find` itself fails (missing binary, exec error) a minimal recursive
// readdir walk takes over so detectors still function.
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
  const matchArgs = globs.flatMap((g, i) => {
    const prefix = i === 0 ? [] : ['-o'];
    if (g.replace(/^\*\*\//, '').includes('/')) {
      // Path-qualified glob (e.g. `design/*.md`, `ci/pipeline.yml`):
      // `find -name` matches basenames only and would never match these, so
      // route them through `-path`. A leading `**/` means "at any depth";
      // otherwise the glob is anchored at the repo root. Note: `find -path`
      // lets `*` cross `/` boundaries (fnmatch without FNM_PATHNAME), which
      // is acceptable — it only widens matches, never misses them.
      // Anchored patterns are prefixed with the starting path verbatim (not
      // path.join-normalised) because find echoes the starting path as given.
      const pat = g.startsWith('**/')
        ? `*/${g.slice(3)}`
        : `${repoPath.replace(/\/+$/, '')}/${g.replace(/^\.\//, '')}`;
      return [...prefix, '-path', pat];
    }
    // Strip leading **/ glob prefix to get the bare filename pattern for find -name
    return [...prefix, '-name', g.replace(/^\*\*\//, '')];
  });
  let out: string;
  try {
    out = execFileSync(
      'find',
      [repoPath, ...pruneArgs, '(', ...matchArgs, ')', '-type', 'f', '-print'],
      // Large repos can emit path lists beyond the 1 MB default; same
      // rationale as the git collector's oversized buffer.
      { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }
    );
  } catch {
    return jsWalk(repoPath, globs, ignore);
  }
  return out.split('\n').filter(Boolean).sort();
}

/** Convert one iterFiles glob into a RegExp over the repo-relative path. */
function globToRegExp(glob: string): RegExp {
  const bare = glob.replace(/^\.\//, '');
  const anyDepth = bare.startsWith('**/');
  const rest = anyDepth ? bare.slice(3) : bare;
  const body = rest
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  if (!rest.includes('/')) {
    // Bare filename pattern — matches the basename at any depth (mirrors
    // the `find -name` behaviour of the primary implementation).
    return new RegExp(`(?:^|/)${body}$`);
  }
  return anyDepth ? new RegExp(`(?:^|/)${body}$`) : new RegExp(`^${body}$`);
}

/** Fallback file walk used when `find` is unavailable or fails. */
function jsWalk(repoPath: string, globs: string[], ignore: string[]): string[] {
  const rxs = globs.map(globToRegExp);
  const ignoreSet = new Set(ignore);
  const results: string[] = [];
  const walk = (dir: string, rel: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (
          ignoreSet.has(e.name) ||
          childRel === AUDIT_OUTPUT_DIR ||
          childRel.endsWith(`/${AUDIT_OUTPUT_DIR}`)
        )
          continue;
        walk(join(dir, e.name), childRel);
      } else if (e.isFile() && rxs.some((rx) => rx.test(childRel))) {
        results.push(join(dir, e.name));
      }
    }
  };
  walk(repoPath, '');
  return results.sort();
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
