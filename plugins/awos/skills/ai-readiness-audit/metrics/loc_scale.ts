/**
 * loc_scale — Lines of code (LOC) and scale.
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
import { existsSync } from 'node:fs';
import {
  computeReliability,
  makeMetricResult,
  skipMetric,
  type MetricResult,
} from './_base.ts';
import { analyzeRepoAst } from './_ast.ts';

export async function compute(
  _collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>,
  repoPathOverride?: string
): Promise<MetricResult> {
  // repoPathOverride is injected by the CLI for G11 (and G12/G10) so they can
  // scan the repo directly rather than reading a collector artifact.
  const repoPath = repoPathOverride ?? _collectedDir;

  if (!existsSync(repoPath)) {
    return skipMetric('loc_scale', 'computed', 'not-reliable', 'scale');
  }

  // Shared single-pass walk/read (see analyzeRepoAst) — LOC needs no parse, so
  // its counts hold even when tree-sitter is unavailable.
  const { loc } = await analyzeRepoAst(repoPath);

  if (loc.fileCount === 0) {
    return skipMetric('loc_scale', 'computed', 'not-reliable', 'scale');
  }

  const value = {
    total_loc: loc.totalLoc,
    file_count: loc.fileCount,
    by_language: loc.byLanguage,
  };
  const reliability = computeReliability('not-reliable', ['scale'], []);

  const expression = `${loc.totalLoc} LOC across ${loc.fileCount} files`;
  return makeMetricResult(
    'loc_scale',
    value,
    'computed',
    [1302],
    reliability,
    ['scale'],
    [],
    { expression, score: 1.0, confidence: 1.0 }
  );
}
