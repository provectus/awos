/**
 * adp_g11_scale — Lines of code (LOC) and scale.
 *
 * kind: "computed"
 * value: { total_loc, file_count, by_language: Record<string, { files: number; loc: number }> }
 * categories_awarded: [1302] when at least one source file is found
 * reliability_default: "not-reliable" — a count metric; direction depends on context
 *
 * Source: walks the repo directly using stdlib (no collector artifact needed).
 * collectedDir is unused; repoPath (stored as a sibling key in the scale artifact)
 * is the repo root. For the query-once path, the scale artifact provides repoPath.
 *
 * Languages detected by extension:
 *   .js .mjs .cjs → JavaScript
 *   .ts .mts .cts → TypeScript
 *   .tsx            → TSX
 *   .jsx            → JSX
 *   .py             → Python
 *   .go             → Go
 *   .java           → Java
 *   .rb             → Ruby
 *   .cs             → C#
 *   .c              → C
 *   .cpp .cc .cxx   → C++
 *   .rs             → Rust
 *   .php            → PHP
 *   .kt .kts        → Kotlin
 *
 * SKIP: if repoPath cannot be read or no recognized source files are found.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename, relative } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';
import { isGeneratedPath } from '../generated.ts';

// Extension → language name mapping.
const EXT_TO_LANG: Record<string, string> = {
  '.js': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.ts': 'TypeScript',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.tsx': 'TSX',
  '.jsx': 'JSX',
  '.py': 'Python',
  '.go': 'Go',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.cs': 'C#',
  '.c': 'C',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.cxx': 'C++',
  '.rs': 'Rust',
  '.php': 'PHP',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
};

// Directories to skip when walking.
const PRUNE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.venv',
  '__pycache__',
  '.next',
  'target',
  'vendor',
  '.cache',
  'coverage',
]);

interface LangStats {
  files: number;
  loc: number;
}

/** Count non-blank lines in a string. */
function countLines(content: string): number {
  return content.split('\n').filter((l) => l.trim().length > 0).length;
}

/** Walk the directory tree, calling cb for every file (not directory). */
function walkDir(dir: string, cb: (filePath: string) => void): void {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (PRUNE_DIRS.has(entry.name)) continue;
      walkDir(join(dir, entry.name), cb);
    } else if (entry.isFile()) {
      cb(join(dir, entry.name));
    }
  }
}

export function compute(
  _collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>,
  repoPathOverride?: string
): MetricResult {
  // repoPathOverride is injected by the CLI for G11 (and G12/G10) so they can
  // scan the repo directly rather than reading a collector artifact.
  const repoPath = repoPathOverride ?? _collectedDir;

  if (!existsSync(repoPath)) {
    return makeMetricResult(
      'adp_g11_scale',
      null,
      'computed',
      [],
      computeReliability('not-reliable', [], ['scale']),
      [],
      ['scale']
    );
  }

  const byLanguage: Record<string, LangStats> = {};
  let totalLoc = 0;
  let fileCount = 0;

  walkDir(repoPath, (filePath) => {
    if (isGeneratedPath(relative(repoPath, filePath))) return;
    const ext = extname(filePath).toLowerCase();
    const lang = EXT_TO_LANG[ext];
    if (!lang) return;
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      return;
    }
    const loc = countLines(content);
    totalLoc += loc;
    fileCount += 1;
    if (!byLanguage[lang]) {
      byLanguage[lang] = { files: 0, loc: 0 };
    }
    byLanguage[lang].files += 1;
    byLanguage[lang].loc += loc;
  });

  if (fileCount === 0) {
    return makeMetricResult(
      'adp_g11_scale',
      null,
      'computed',
      [],
      computeReliability('not-reliable', [], ['scale']),
      [],
      ['scale']
    );
  }

  const value = {
    total_loc: totalLoc,
    file_count: fileCount,
    by_language: byLanguage,
  };
  const reliability = computeReliability('not-reliable', ['scale'], []);

  const expression = `${totalLoc} LOC across ${fileCount} files`;
  return makeMetricResult(
    'adp_g11_scale',
    value,
    'computed',
    [1302],
    reliability,
    ['scale'],
    [],
    null,
    undefined,
    expression,
    1.0,
    1.0
  );
}
