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
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, extname, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';
import { isGeneratedPath } from '../generated.ts';

// Static import of web-tree-sitter (bundled by esbuild as CJS→ESM).
// web-tree-sitter@0.24 exports the Parser class as module.exports (CJS default).
// esbuild wraps this into a default export that we destructure.
import webTreeSitter from 'web-tree-sitter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CCN_THRESHOLD = 10;
const MAX_FILE_BYTES = 512 * 1024; // skip files > 512 KB

// Extension → grammar wasm file name (inside dist/grammars/)
const EXT_TO_GRAMMAR: Record<string, string> = {
  '.js': 'tree-sitter-javascript.wasm',
  '.mjs': 'tree-sitter-javascript.wasm',
  '.cjs': 'tree-sitter-javascript.wasm',
  '.jsx': 'tree-sitter-javascript.wasm',
  '.ts': 'tree-sitter-typescript.wasm',
  '.mts': 'tree-sitter-typescript.wasm',
  '.cts': 'tree-sitter-typescript.wasm',
  '.tsx': 'tree-sitter-tsx.wasm',
  '.py': 'tree-sitter-python.wasm',
  '.go': 'tree-sitter-go.wasm',
  '.java': 'tree-sitter-java.wasm',
  '.rb': 'tree-sitter-ruby.wasm',
  '.cs': 'tree-sitter-c_sharp.wasm',
  '.c': 'tree-sitter-c.wasm',
  '.cpp': 'tree-sitter-cpp.wasm',
  '.cc': 'tree-sitter-cpp.wasm',
  '.cxx': 'tree-sitter-cpp.wasm',
  '.rs': 'tree-sitter-rust.wasm',
  '.php': 'tree-sitter-php.wasm',
  '.kt': 'tree-sitter-kotlin.wasm',
  '.kts': 'tree-sitter-kotlin.wasm',
};

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

// Directories to skip.
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

// ---------------------------------------------------------------------------
// Locate wasm assets
// ---------------------------------------------------------------------------

/**
 * Resolve the directory that holds grammar wasm files.
 * - Bundled (dist/cli.js): grammars are in dist/grammars/
 * - Source (tsx metrics/): look up to node_modules/tree-sitter-wasms/out/
 */
function resolveGrammarsDir(): string {
  const metricsDir = dirname(fileURLToPath(import.meta.url));
  // When bundled, dist/cli.js is in dist/ → grammars/ is sibling of cli.js
  const distGrammars = join(metricsDir, 'grammars');
  if (existsSync(distGrammars)) return distGrammars;
  // When running from source (tsx), try common relative paths to node_modules
  const candidates = [
    join(
      metricsDir,
      '..',
      '..',
      '..',
      '..',
      '..',
      'node_modules',
      'tree-sitter-wasms',
      'out'
    ),
    join(
      metricsDir,
      '..',
      '..',
      '..',
      '..',
      'node_modules',
      'tree-sitter-wasms',
      'out'
    ),
    join(
      metricsDir,
      '..',
      '..',
      '..',
      'node_modules',
      'tree-sitter-wasms',
      'out'
    ),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return distGrammars; // fallback — will cause clean SKIP for each grammar
}

/**
 * Resolve the core tree-sitter.wasm path.
 * - Bundled (dist/): dist/tree-sitter.wasm
 * - Source (tsx): node_modules/web-tree-sitter/tree-sitter.wasm
 */
function resolveCoreWasm(): string {
  const metricsDir = dirname(fileURLToPath(import.meta.url));
  // Bundled: dist/ has tree-sitter.wasm at the same level as cli.js
  const distWasm = join(metricsDir, 'tree-sitter.wasm');
  if (existsSync(distWasm)) return distWasm;
  // Source: search upward for node_modules/web-tree-sitter/tree-sitter.wasm
  const candidates = [
    join(
      metricsDir,
      '..',
      '..',
      '..',
      '..',
      '..',
      'node_modules',
      'web-tree-sitter',
      'tree-sitter.wasm'
    ),
    join(
      metricsDir,
      '..',
      '..',
      '..',
      '..',
      'node_modules',
      'web-tree-sitter',
      'tree-sitter.wasm'
    ),
    join(
      metricsDir,
      '..',
      '..',
      '..',
      'node_modules',
      'web-tree-sitter',
      'tree-sitter.wasm'
    ),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return distWasm; // fallback
}

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CCN counting from tree-sitter AST
// ---------------------------------------------------------------------------

type TSNode = {
  type: string;
  isNamed: boolean;
  childCount: number;
  child(i: number): TSNode | null;
};

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

function makeSkip(): MetricResult {
  return makeMetricResult(
    'adp_g10_complexity',
    null,
    'computed',
    [],
    computeReliability('not-reliable', [], ['scale']),
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

  const grammarsDir = resolveGrammarsDir();
  const coreWasmPath = resolveCoreWasm();

  // Use web-tree-sitter (statically bundled by esbuild from CJS module).
  // web-tree-sitter@0.24 exports the Parser class as module.exports (CJS).
  // esbuild wraps CJS modules: the default export IS the Parser class.
  const Parser = webTreeSitter as unknown as {
    new (): {
      setLanguage(lang: unknown): void;
      parse(source: string): { rootNode: TSNode; delete(): void } | null;
      delete(): void;
    };
    init(opts?: { locateFile?: (name: string) => string }): Promise<void>;
    Language: { load(data: Uint8Array): Promise<unknown> };
  };

  if (!Parser || typeof Parser.init !== 'function') return makeSkip();

  // Initialise the core runtime.
  // We pass BOTH wasmBinary (the file contents) AND locateFile (to fix the
  // wasmBinaryFile path check) because the bundled CJS wrapper inside ESM
  // does not have __dirname, causing the default path-finder to fail.
  // With both options set, getBinarySync matches `wasmBinaryFile` via locateFile
  // and returns the pre-loaded binary — no filesystem access needed at init.
  try {
    if (!existsSync(coreWasmPath)) return makeSkip();
    const wasmBinary = readFileSync(coreWasmPath);
    await Parser.init({
      wasmBinary,
      locateFile: () => coreWasmPath,
    });
  } catch {
    return makeSkip();
  }

  // Cache loaded Language objects.
  const languageCache = new Map<string, unknown>();

  async function loadLanguage(grammarFile: string): Promise<unknown> {
    if (languageCache.has(grammarFile)) return languageCache.get(grammarFile);
    const grammarPath = join(grammarsDir, grammarFile);
    if (!existsSync(grammarPath)) {
      languageCache.set(grammarFile, null);
      return null;
    }
    try {
      const grammarBytes = readFileSync(grammarPath);
      const lang = await Parser.Language.load(new Uint8Array(grammarBytes));
      languageCache.set(grammarFile, lang);
      return lang;
    } catch {
      languageCache.set(grammarFile, null);
      return null;
    }
  }

  // Collect source files: any file whose extension is in EXT_TO_GRAMMAR.
  // Files in languages not in EXT_TO_GRAMMAR are not collected; they are
  // neither analysed nor counted as skipped.
  const filePaths: string[] = [];
  walkDir(repoPath, (p) => {
    if (isGeneratedPath(relative(repoPath, p))) return;
    if (EXT_TO_GRAMMAR[extname(p).toLowerCase()]) filePaths.push(p);
  });

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

  return makeMetricResult(
    'adp_g10_complexity',
    value,
    'computed',
    [1301],
    computeReliability('not-reliable', ['scale'], []),
    ['scale'],
    [],
    band
  );
}
