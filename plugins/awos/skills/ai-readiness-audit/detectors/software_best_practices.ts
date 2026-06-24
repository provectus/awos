import { makeResult, grep, iterFiles } from './_base.ts';
import { basename, relative } from 'node:path';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// detectExceptClauseDefect — category 2706 (method: detected)
//
// Python-2 multi-exception clause: `except A, B:` is a SyntaxError on Py3.
// Excludes the valid `except E as name:` and `except (A, B):` forms.
// ---------------------------------------------------------------------------

// Matches `except A, B:` and `except A, B, C:` (two or more comma-separated names).
// The two-name case is a subset, so no regression against the original pattern.
// Known limitation: matches inside string literals can still false-positive (no parser; acceptable for a detected heuristic).
const PY2_EXCEPT = /except\s+[A-Za-z_][\w.]*(\s*,\s*[A-Za-z_][\w.]*)+\s*:/;

export function detectExceptClauseDefect(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const hits = grep(repoPath, PY2_EXCEPT, ['**/*.py']);
  // Drop lines whose first non-whitespace character is `#` (Python comments).
  const realHits = hits.filter((h) => !/^\s*#/.test(h.text));
  if (realHits.length) {
    const ev = realHits.map((h) => `${h.file}:${h.line} ${h.text}`);
    return makeResult('FAIL', realHits.length, ev);
  }
  return makeResult('PASS', 0, ['no Python-2 except-clause syntax found']);
}

// ---------------------------------------------------------------------------
// detectLockfiles — category 2705 (method: detected)
//
// PASS if any recognised dependency lockfile is present.
// ---------------------------------------------------------------------------

const LOCKFILES = [
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'gradle.lockfile',
  'poetry.lock',
  'uv.lock',
  'Cargo.lock',
  'go.sum',
];

export function detectLockfiles(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const found = iterFiles(repoPath, LOCKFILES).map((p) => basename(p));
  if (found.length) {
    const uniq = [...new Set(found)].sort();
    return makeResult(
      'PASS',
      uniq.length,
      uniq.map((n) => `lock file present: ${n}`)
    );
  }
  return makeResult('FAIL', 0, ['no dependency lock file found']);
}

// ---------------------------------------------------------------------------
// detectErrorHandling — category 2704 (method: detected)
//
// Deterministic heuristic over catch/except blocks in source files.
//
// Algorithm:
//   For each Python / JS / TS / Java / Kotlin source file:
//     - Scan lines for catch/except block openers.
//     - A block is classified as "bad" (empty or unhandled) when the first
//       non-blank body line is ONLY `pass`, `{}`, a bare closing brace, or
//       when no log/raise/throw/return keyword appears within the next 4
//       lines of the opener.
//
// Note: Go is intentionally excluded — its `if err != nil` idiom does not
// use try/catch/except syntax, so Go files would contribute no signal.
//
// Scoring (over all catch blocks found across the repo):
//   bad_ratio = bad_count / total_count
//   bad_ratio >= 0.5  → FAIL
//   bad_ratio >= 0.1  → WARN
//   otherwise         → PASS (includes zero blocks found)
// ---------------------------------------------------------------------------

/** Lines that suggest the block does something useful. */
const HANDLED_RX =
  /\b(log|logger|logging|print|console\.(log|warn|error|debug)|raise|throw|re-?raise|return|traceback|sys\.exit|abort|panic)\b/i;

/** A bare except/catch opener in common languages. */
const EXCEPT_OPENER_RX = /^\s*(except\b|catch\s*\(|catch\s*$)/;

/** Python `pass` or JS/TS/Java/Kotlin bare empty block signals. */
const EMPTY_BODY_RX = /^\s*(pass|}\s*$|{\s*}\s*)$/;

interface BlockSample {
  file: string;
  line: number;
  bad: boolean;
}

function analyseFile(repoPath: string, filePath: string): BlockSample[] {
  let src: string;
  try {
    src = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const lines = src.split('\n');
  const samples: BlockSample[] = [];
  const rel = relative(repoPath, filePath);

  for (let i = 0; i < lines.length; i++) {
    if (!EXCEPT_OPENER_RX.test(lines[i])) continue;

    // Look at the next 4 body lines to determine if it is handled.
    const body = lines.slice(i + 1, i + 5).join('\n');
    const isEmptyFirst =
      lines[i + 1] !== undefined && EMPTY_BODY_RX.test(lines[i + 1]);
    const hasHandled = HANDLED_RX.test(body);

    const bad = isEmptyFirst || !hasHandled;
    samples.push({ file: rel, line: i + 1, bad });
  }

  return samples;
}

const SOURCE_GLOBS = [
  '*.py',
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.java',
  '*.kt',
];

export function detectErrorHandling(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const files = iterFiles(repoPath, SOURCE_GLOBS);
  const allSamples: BlockSample[] = files.flatMap((f) =>
    analyseFile(repoPath, f)
  );

  if (allSamples.length === 0) {
    return makeResult('PASS', 0, [
      'no catch/except blocks found — nothing to assess',
    ]);
  }

  const badSamples = allSamples.filter((s) => s.bad);
  const badRatio = badSamples.length / allSamples.length;

  const evidence = badSamples
    .slice(0, 10)
    .map((s) => `${s.file}:${s.line} empty or unhandled catch/except block`);

  if (badRatio >= 0.5) {
    return makeResult('FAIL', badSamples.length, [
      `${badSamples.length}/${allSamples.length} catch/except blocks are empty or unhandled (${Math.round(badRatio * 100)}%)`,
      ...evidence,
    ]);
  }
  if (badRatio >= 0.1) {
    return makeResult('WARN', badSamples.length, [
      `${badSamples.length}/${allSamples.length} catch/except blocks are empty or unhandled (${Math.round(badRatio * 100)}%) — mixed patterns`,
      ...evidence,
    ]);
  }
  return makeResult('PASS', allSamples.length - badSamples.length, [
    `${allSamples.length - badSamples.length}/${allSamples.length} catch/except blocks are properly handled`,
  ]);
}

// ---------------------------------------------------------------------------
// DETECTORS — maps each detected SBP category code to its function.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  2704: detectErrorHandling, // SBP-06 error-handling consistency
  2705: detectLockfiles, // SBP-07 dependency lockfiles
  2706: detectExceptClauseDefect, // SBP-06 sibling: Python-2 except-clause syntax
};
