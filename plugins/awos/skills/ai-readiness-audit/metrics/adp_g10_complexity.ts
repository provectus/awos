/**
 * adp_g10_complexity — Cyclomatic complexity via web-tree-sitter.
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
import { readFileSync, existsSync } from 'node:fs';
import { extname, relative } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';
import { bandScore, clamp01 } from './_score.ts';

const COMPLEXITY_ANCHORS = [
  { x: 1, y: 1.0 },
  { x: 5, y: 1.0 },
  { x: 10, y: 0.75 },
  { x: 15, y: 0.5 },
  { x: 30, y: 0.0 },
] as const;
import { isGeneratedPath } from '../generated.ts';
import {
  EXT_TO_GRAMMAR,
  MAX_FILE_BYTES,
  getInitError,
  getParserClass,
  getSharedLoader,
  initParser,
  listRepoFiles,
  type TSNode,
} from './_ast.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CCN_THRESHOLD = 10;

// Node types that increment the cyclomatic complexity counter.
const DECISION_NODE_TYPES = new Set([
  'if_statement',
  'elif_clause', // Python
  'elsif_clause', // Ruby
  'else_if_clause', // Kotlin
  'for_statement',
  'for_in_statement',
  'for_of_statement',
  'foreach_statement', // C#
  'while_statement',
  'do_statement',
  'switch_case',
  'catch_clause',
  'conditional_expression', // ternary ?:
  'when_expression', // Kotlin when
]);

// Node types that are function boundaries — each is a separate CCN unit.
// Note: 'function' is the keyword token inside 'function_declaration' in JS/TS;
// we use isNamed check to skip such anonymous tokens.
const FUNCTION_BOUNDARY_TYPES = new Set([
  'function_declaration',
  'function_definition',
  'function_expression', // JS: const f = function() {}
  'arrow_function',
  'method_definition',
  'method_declaration',
  'constructor_declaration',
  'function_item', // Rust fn
  'lambda_expression',
  'closure_expression', // Rust |...| {}
]);

// ---------------------------------------------------------------------------
// CCN counting from tree-sitter AST
// ---------------------------------------------------------------------------

/** Count decision points within a subtree, not recursing into nested functions. */
function countDecisions(node: TSNode): number {
  let count = 0;
  function visit(n: TSNode): void {
    if (DECISION_NODE_TYPES.has(n.type)) count++;
    // binary_expression with && or || increments CCN.
    if (n.type === 'binary_expression') {
      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (
          child &&
          (child.type === '&&' ||
            child.type === '||' ||
            child.type === 'and' ||
            child.type === 'or')
        ) {
          count++;
        }
      }
    }
    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (!child) continue;
      // Stop at nested named function boundaries — they are separate CCN units.
      if (FUNCTION_BOUNDARY_TYPES.has(child.type) && child.isNamed) continue;
      visit(child);
    }
  }
  visit(node);
  return count;
}

/** Collect all named function/method nodes from the tree (recursive). */
function collectFunctions(node: TSNode, out: TSNode[]): void {
  // Only collect named nodes — skip anonymous keyword tokens like 'function'.
  if (FUNCTION_BOUNDARY_TYPES.has(node.type) && node.isNamed) {
    out.push(node);
    // Continue recursing to find nested functions.
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) collectFunctions(child, out);
  }
}

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
    'adp_g10_complexity',
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
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>,
  repoPathOverride?: string
): Promise<MetricResult> {
  const repoPath = repoPathOverride ?? _collectedDir;

  if (!existsSync(repoPath)) return makeSkip();

  const Parser = getParserClass();
  if (!(await initParser())) {
    return makeSkip(getInitError() ?? 'tree-sitter init failed');
  }

  const loader = getSharedLoader();
  const loadLanguage = (grammarFile: string) => loader.load(grammarFile);

  // Collect source files: any file whose extension is in EXT_TO_GRAMMAR.
  // Files in languages not in EXT_TO_GRAMMAR are not collected; they are
  // neither analysed nor counted as skipped.
  const filePaths: string[] = [];
  for (const p of listRepoFiles(repoPath)) {
    if (isGeneratedPath(relative(repoPath, p))) continue;
    if (EXT_TO_GRAMMAR[extname(p).toLowerCase()]) filePaths.push(p);
  }

  if (filePaths.length === 0) return makeSkip();

  const parser = new Parser();

  let totalCcn = 0;
  let maxCcn = 0;
  let hotspotCount = 0;
  let functionsAnalysed = 0;
  let filesAnalysed = 0;
  let filesSkipped = 0;

  for (const filePath of filePaths) {
    const ext = extname(filePath).toLowerCase();
    const grammarFile = EXT_TO_GRAMMAR[ext];
    if (!grammarFile) {
      filesSkipped++;
      continue;
    }

    const lang = await loadLanguage(grammarFile);
    if (!lang) {
      filesSkipped++;
      continue;
    }

    let source: string;
    try {
      const buf = readFileSync(filePath);
      if (buf.length > MAX_FILE_BYTES) {
        filesSkipped++;
        continue;
      }
      source = buf.toString('utf8');
    } catch {
      filesSkipped++;
      continue;
    }

    try {
      parser.setLanguage(lang);
      const tree = parser.parse(source);
      if (!tree) {
        filesSkipped++;
        continue;
      }

      const fns: TSNode[] = [];
      collectFunctions(tree.rootNode, fns);
      filesAnalysed++;

      if (fns.length === 0) {
        // File-level code with no function boundaries: treat as one unit.
        const ccn = 1 + countDecisions(tree.rootNode);
        totalCcn += ccn;
        functionsAnalysed++;
        if (ccn > maxCcn) maxCcn = ccn;
        if (ccn > CCN_THRESHOLD) hotspotCount++;
      } else {
        for (const fn of fns) {
          const ccn = 1 + countDecisions(fn);
          totalCcn += ccn;
          functionsAnalysed++;
          if (ccn > maxCcn) maxCcn = ccn;
          if (ccn > CCN_THRESHOLD) hotspotCount++;
        }
      }

      tree.delete();
    } catch {
      filesSkipped++;
    }
  }

  parser.delete();

  if (functionsAnalysed === 0) return makeSkip();

  const avgCcn = totalCcn / functionsAnalysed;
  const band = bandFromAvg(avgCcn);

  const value = {
    avg_ccn: Math.round(avgCcn * 100) / 100,
    max_ccn: maxCcn,
    hotspot_count: hotspotCount,
    functions_analysed: functionsAnalysed,
    files_analysed: filesAnalysed,
    files_skipped: filesSkipped,
    band,
  };

  const filesTotal = filesAnalysed + filesSkipped;
  const complexityScore = clamp01(
    bandScore(avgCcn, COMPLEXITY_ANCHORS, 'linear')
  );
  const complexityConfidence = filesTotal > 0 ? filesAnalysed / filesTotal : 0;
  const complexityExpression = `avg_ccn=${avgCcn.toFixed(1)} (${band}), ${hotspotCount} hotspot${hotspotCount !== 1 ? 's' : ''} > CCN 10`;

  return makeMetricResult(
    'adp_g10_complexity',
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
