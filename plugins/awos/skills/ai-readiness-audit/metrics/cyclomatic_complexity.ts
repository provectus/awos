/**
 * cyclomatic_complexity — Cyclomatic complexity via web-tree-sitter.
 *
 * kind: "computed"
 * value: {
 *   avg_ccn: number,          average cyclomatic complexity per function
 *   max_ccn: number,          highest single-function CCN
 *   hotspot_count: number,    functions with CCN > CCN_THRESHOLD (10)
 *   functions_analysed: number,
 *   files_analysed: number,
 *   files_skipped: number,    files in unbundled languages
 *   band: "elite"|"high"|"medium"|"low"
 * }
 * categories_awarded: [1301] when at least one function is analysed
 * reliability_default: "not-reliable"
 *
 * Async: Parser.init() loads the core tree-sitter.wasm.  This compute function
 * returns a Promise<MetricResult>; cli.ts awaits it.
 *
 * SKIP-when-grammar-absent: files in languages without a bundled .wasm are
 * silently skipped (files_skipped is incremented).  The metric still produces
 * a result if at least one supported file is parsed.
 *
 * Grammar API used: web-tree-sitter@0.24 (CJS) — compatible with tree-sitter-wasms
 * grammar wasm files. Accessed via createRequire to interop from ESM host.
 *
 * CCN decision points counted per node type:
 *   if_statement, elif_clause (Python), elsif_clause (Ruby), else_if_clause (Kotlin),
 *   for_statement, for_in_statement, for_of_statement, foreach_statement (C#),
 *   while_statement, do_statement, switch_case, catch_clause,
 *   conditional_expression (ternary ?:), when_expression (Kotlin),
 *   binary_expression with && / || / and / or operators.
 *
 * CCN_THRESHOLD: 10 (McCabe classic threshold for "high complexity" hotspots).
 */
import { existsSync } from 'node:fs';
import {
  computeReliability,
  makeMetricResult,
  plural,
  type MetricResult,
} from './_base.ts';
import { scoreFromConfig, scoringFor } from './_score.ts';
import { analyzeRepoAst, getInitError, initParser } from './_ast.ts';

// The repo walk, per-file parse, and CCN visitor live in analyzeRepoAst (shared
// single pass); this module owns only the banding, scoring, and result shape.

// ---------------------------------------------------------------------------
// Band helper
// ---------------------------------------------------------------------------

function bandFromAvg(avg: number): string {
  if (avg <= 5) return 'elite';
  if (avg <= 10) return 'high';
  if (avg <= 15) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Skip result helper
// ---------------------------------------------------------------------------

function makeSkip(reason?: string): MetricResult {
  const reliability = computeReliability('not-reliable', [], ['scale']);
  if (reason) {
    reliability.note = reliability.note
      ? `${reliability.note} (${reason})`
      : reason;
  }
  return makeMetricResult(
    'cyclomatic_complexity',
    null,
    'computed',
    [],
    reliability,
    [],
    ['scale']
  );
}

// ---------------------------------------------------------------------------
// Main compute (async — wasm init required)
// ---------------------------------------------------------------------------

export async function compute(
  _collectedDir: string,
  standards: Record<string, unknown>,
  _topology: Record<string, boolean>,
  repoPathOverride?: string
): Promise<MetricResult> {
  const repoPath = repoPathOverride ?? _collectedDir;

  if (!existsSync(repoPath)) return makeSkip();

  if (!(await initParser())) {
    return makeSkip(getInitError() ?? 'tree-sitter init failed');
  }

  const { complexity: cx } = await analyzeRepoAst(repoPath);

  // No grammar-supported files → nothing to analyse (was filePaths.length===0).
  if (cx.grammarFileCount === 0) return makeSkip();
  if (cx.functionsAnalysed === 0) return makeSkip();

  const avgCcn = cx.totalCcn / cx.functionsAnalysed;
  const band = bandFromAvg(avgCcn);

  const value = {
    avg_ccn: Math.round(avgCcn * 100) / 100,
    max_ccn: cx.maxCcn,
    hotspot_count: cx.hotspotCount,
    functions_analysed: cx.functionsAnalysed,
    files_analysed: cx.filesAnalysed,
    files_skipped: cx.filesSkipped,
    band,
  };

  const filesTotal = cx.filesAnalysed + cx.filesSkipped;
  // Score curve lives in standards.toml [category.cyclomatic_complexity.scoring].
  const scoring = scoringFor(standards, 'cyclomatic_complexity');
  const complexityScore = scoreFromConfig(avgCcn, scoring);
  const complexityConfidence =
    filesTotal > 0 ? cx.filesAnalysed / filesTotal : 0;
  let complexityExpression = `avg_ccn=${avgCcn.toFixed(1)} (${band}), ${cx.hotspotCount} ${plural(cx.hotspotCount, 'hotspot')} > CCN 10`;
  if (cx.filesSkipped > 0) {
    complexityExpression += `; ${cx.filesSkipped} of ${filesTotal} files skipped (unsupported grammar or parse error)`;
  }

  return makeMetricResult(
    'cyclomatic_complexity',
    value,
    'computed',
    [1301],
    computeReliability('not-reliable', ['scale'], []),
    ['scale'],
    [],
    {
      band,
      expression: complexityExpression,
      score: complexityScore,
      confidence: complexityConfidence,
    }
  );
}
