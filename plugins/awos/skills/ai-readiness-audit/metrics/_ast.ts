/**
 * _ast — shared tree-sitter (web-tree-sitter) loading infrastructure.
 *
 * One grammar-loading path for every AST-based metric (adp_g10 complexity,
 * adp_g13 doc-coverage, …). Do NOT re-implement wasm path resolution or
 * Parser.init elsewhere — import from here.
 *
 * web-tree-sitter@0.24 (CJS) is bundled by esbuild; the default export IS the
 * Parser class. Grammar wasm files come from tree-sitter-wasms (source runs)
 * or dist/grammars/ (bundled runs).
 */
import { readFileSync, existsSync, readdirSync, type Dirent } from 'node:fs';
import { join, dirname, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import webTreeSitter from 'web-tree-sitter';

import { dropIgnored } from '../git_ignore.ts';
import { isGeneratedPath } from '../generated.ts';
import { LANGUAGES } from '../languages.ts';

export const MAX_FILE_BYTES = 512 * 1024; // skip files > 512 KB

// Extension → grammar wasm file name (inside dist/grammars/ or tree-sitter-wasms/out/).
export const EXT_TO_GRAMMAR: Record<string, string> = {
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

// Directories to skip while walking a repo.
export const PRUNE_DIRS = new Set([
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

// Minimal structural view of a tree-sitter node (subset of the web-tree-sitter
// Node API actually relied on by our metrics).
export type TSNode = {
  type: string;
  isNamed: boolean;
  text: string;
  childCount: number;
  namedChildCount: number;
  child(i: number): TSNode | null;
  namedChild(i: number): TSNode | null;
  parent: TSNode | null;
  previousNamedSibling: TSNode | null;
};

type ParserClass = {
  new (): {
    setLanguage(lang: unknown): void;
    parse(source: string): { rootNode: TSNode; delete(): void } | null;
    delete(): void;
  };
  init(opts?: {
    wasmBinary?: Uint8Array | Buffer;
    locateFile?: (name: string) => string;
  }): Promise<void>;
  Language: { load(data: Uint8Array): Promise<unknown> };
};

/** The web-tree-sitter Parser class (esbuild unwraps the CJS default export). */
export function getParserClass(): ParserClass {
  return webTreeSitter as unknown as ParserClass;
}

/**
 * Resolve a wasm asset shipped two ways:
 * - Bundled (dist/cli.js): `<leaf>` sits next to cli.js (grammars/ dir, or
 *   tree-sitter.wasm file).
 * - Source (tsx): under `node_modules/<pkgPath>` somewhere up the tree.
 * Returns the bundled path as the fallback when nothing resolves, so callers
 * degrade to a clean SKIP rather than throwing.
 */
function resolveWasmAsset(leaf: string, pkgPath: string[]): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const distPath = join(here, leaf);
  if (existsSync(distPath)) return distPath;
  for (const depth of [5, 4, 3]) {
    const c = join(
      here,
      ...Array(depth).fill('..'),
      'node_modules',
      ...pkgPath
    );
    if (existsSync(c)) return c;
  }
  return distPath;
}

/**
 * Resolve the directory holding grammar wasm files.
 * - Bundled (dist/cli.js): grammars are in dist/grammars/ (sibling of cli.js).
 * - Source (tsx): node_modules/tree-sitter-wasms/out/ up the tree.
 */
export function resolveGrammarsDir(): string {
  return resolveWasmAsset('grammars', ['tree-sitter-wasms', 'out']);
}

/**
 * Resolve the core tree-sitter.wasm path.
 * - Bundled (dist/): dist/tree-sitter.wasm (sibling of cli.js).
 * - Source (tsx): node_modules/web-tree-sitter/tree-sitter.wasm up the tree.
 */
export function resolveCoreWasm(): string {
  return resolveWasmAsset('tree-sitter.wasm', [
    'web-tree-sitter',
    'tree-sitter.wasm',
  ]);
}

let _initPromise: Promise<boolean> | null = null;
let _initError: string | null = null;

/**
 * Why the last initParser() attempt returned false (null when init succeeded
 * or was never attempted). Metrics append this to their SKIP note so a broken
 * wasm bundle is distinguishable from "no parseable code in the repo".
 */
export function getInitError(): string | null {
  return _initError;
}

/**
 * Initialise the core tree-sitter runtime exactly once. Returns false (no throw)
 * when the core wasm is missing or init fails — callers then SKIP cleanly, with
 * the failure reason recorded in getInitError().
 *
 * Both wasmBinary and locateFile are passed: the bundled CJS-in-ESM wrapper has
 * no __dirname, so the default path-finder fails; with both set the binary is
 * matched by locateFile and returned pre-loaded (no filesystem access at init).
 *
 * Promise-singleton: concurrent callers share one init — safe under Promise.all.
 */
export function initParser(): Promise<boolean> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const Parser = getParserClass();
    if (!Parser || typeof Parser.init !== 'function') {
      _initError = 'web-tree-sitter Parser class unavailable in this bundle';
      return false;
    }
    const coreWasmPath = resolveCoreWasm();
    if (!existsSync(coreWasmPath)) {
      _initError = `core tree-sitter.wasm not found at ${coreWasmPath}`;
      return false;
    }
    try {
      const wasmBinary = readFileSync(coreWasmPath);
      await Parser.init({ wasmBinary, locateFile: () => coreWasmPath });
      return true;
    } catch (err) {
      _initError = `tree-sitter init failed: ${err instanceof Error ? err.message : String(err)}`;
      return false;
    }
  })();
  return _initPromise;
}

/** A per-run cache mapping grammar wasm file → loaded Language (or null). */
export class LanguageLoader {
  private cache = new Map<string, unknown>();
  constructor(private grammarsDir: string) {}

  async load(grammarFile: string): Promise<unknown> {
    if (this.cache.has(grammarFile)) return this.cache.get(grammarFile);
    const grammarPath = join(this.grammarsDir, grammarFile);
    if (!existsSync(grammarPath)) {
      this.cache.set(grammarFile, null);
      return null;
    }
    try {
      const bytes = readFileSync(grammarPath);
      const lang = await getParserClass().Language.load(new Uint8Array(bytes));
      this.cache.set(grammarFile, lang);
      return lang;
    } catch {
      this.cache.set(grammarFile, null);
      return null;
    }
  }
}

/**
 * Recursively walk a directory, invoking cb for each file. Prunes PRUNE_DIRS
 * and the audit's own output dir `context/audits/`, so AST metrics never score
 * artifacts the audit wrote itself.
 */
export function walkDir(dir: string, cb: (filePath: string) => void): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (PRUNE_DIRS.has(entry.name)) continue;
      if (entry.name === 'audits' && dir.endsWith(`${sep}context`)) continue;
      walkDir(join(dir, entry.name), cb);
    } else if (entry.isFile()) {
      cb(join(dir, entry.name));
    }
  }
}

// ---------------------------------------------------------------------------
// Process-wide shared state, so the AST metrics (adp_g10, adp_g11, adp_g13)
// don't each re-do the two most expensive setup steps: compiling grammar wasm
// and walking the repo. A repo is immutable for the duration of one audit, and
// tree-sitter Language objects are stateless and reusable across parsers, so
// sharing these is byte-identical to the per-metric versions — just cheaper.
// ---------------------------------------------------------------------------

let sharedLoader: LanguageLoader | null = null;

/**
 * A single LanguageLoader shared across every AST metric, so each grammar wasm
 * is compiled once per process instead of once per metric (grammar compile is
 * the dominant tree-sitter cost). The loader already caches per grammar file;
 * making it a singleton extends that cache across metrics.
 */
export function getSharedLoader(): LanguageLoader {
  if (!sharedLoader) sharedLoader = new LanguageLoader(resolveGrammarsDir());
  return sharedLoader;
}

const fileListCache = new Map<string, string[]>();

/**
 * Full list of files under `repoPath` (pruning PRUNE_DIRS), memoized per path.
 * All AST metrics call this instead of walking the tree themselves, so the repo
 * is walked once per audit rather than once per metric. Each caller applies its
 * own extension filter to the returned list.
 */
export function listRepoFiles(repoPath: string): string[] {
  const cached = fileListCache.get(repoPath);
  if (cached) return cached;
  let files: string[] = [];
  walkDir(repoPath, (p) => files.push(p));
  // Honor the repo's own .gitignore (plus the built-in .claude/worktrees
  // prune) — same project-file universe as the detectors' walker, so scale
  // and complexity never parse a gitignored nested checkout.
  files = dropIgnored(repoPath, files);
  fileListCache.set(repoPath, files);
  return files;
}

// ---------------------------------------------------------------------------
// Single-pass repo AST analysis
//
// loc_scale, cyclomatic_complexity, and doc_coverage each walk the repo file
// list, read every source file, and (the latter two) tree-sitter parse it. Run
// independently that is up to three reads and two parses per file. This one
// memoized pass reads each file once and parses each parseable file once,
// running both the complexity and the doc-coverage visitors over the single
// tree, and accumulates the non-blank-line counts loc_scale needs. Each metric
// then formats its result from the shared aggregates — the reported numbers
// are identical to the per-metric passes.
// ---------------------------------------------------------------------------

// Extension → display language for the LOC count (same ext universe as
// EXT_TO_GRAMMAR; a separate table because the display names differ).
const EXT_TO_LANG_LOC: Record<string, string> = {
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

/** Count non-blank lines in a source string (loc_scale's LOC definition). */
function countLines(content: string): number {
  return content.split('\n').filter((l) => l.trim().length > 0).length;
}

// --- Cyclomatic-complexity visitor (McCabe CCN) ---------------------------

const CCN_THRESHOLD = 10; // McCabe "high complexity" hotspot threshold

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

const FUNCTION_BOUNDARY_TYPES = new Set([
  'function_declaration',
  'function_definition',
  'function_expression',
  'arrow_function',
  'method_definition',
  'method_declaration',
  'constructor_declaration',
  'function_item', // Rust fn
  'lambda_expression',
  'closure_expression', // Rust |...| {}
]);

/** Count decision points within a subtree, not recursing into nested functions. */
function countDecisions(node: TSNode): number {
  let count = 0;
  function visit(n: TSNode): void {
    if (DECISION_NODE_TYPES.has(n.type)) count++;
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
      if (FUNCTION_BOUNDARY_TYPES.has(child.type) && child.isNamed) continue;
      visit(child);
    }
  }
  visit(node);
  return count;
}

/** Collect all named function/method nodes from the tree (recursive). */
function collectFunctions(node: TSNode, out: TSNode[]): void {
  if (FUNCTION_BOUNDARY_TYPES.has(node.type) && node.isNamed) {
    out.push(node);
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) collectFunctions(child, out);
  }
}

// --- Doc-coverage visitor -------------------------------------------------

// ext (".py") → language id, and language id → its documentable node-type set,
// derived from the LanguageDef registry (single source of truth).
const EXT_TO_LANG_DOC = new Map<string, string>();
const DOC_TYPES = new Map<string, Set<string>>();
for (const l of LANGUAGES) {
  if (!l.docConvention) continue;
  DOC_TYPES.set(l.id, new Set(l.docConvention.documentableNodeTypes));
  for (const glob of l.sourceGlobs) {
    const ext = glob.replace(/^\*/, '').toLowerCase(); // "*.ts" → ".ts"
    if (EXT_TO_GRAMMAR[ext]) EXT_TO_LANG_DOC.set(ext, l.id);
  }
}

function firstChildOfType(n: TSNode, type: string): TSNode | null {
  for (let i = 0; i < n.namedChildCount; i++) {
    const c = n.namedChild(i);
    if (c && c.type === type) return c;
  }
  return null;
}

function collectDocumentable(
  root: TSNode,
  types: Set<string>,
  out: TSNode[]
): void {
  if (types.has(root.type)) out.push(root);
  for (let i = 0; i < root.namedChildCount; i++) {
    const c = root.namedChild(i);
    if (c) collectDocumentable(c, types, out);
  }
}

/** Climb past a TS/JS `export_statement` wrapper to the node a comment precedes. */
function exportAnchor(n: TSNode): TSNode {
  const p = n.parent;
  return p && p.type === 'export_statement' ? p : n;
}

function precededByComment(
  n: TSNode,
  commentType: string,
  requireDocPrefix: boolean
): boolean {
  const prev = exportAnchor(n).previousNamedSibling;
  if (!prev || prev.type !== commentType) return false;
  if (!requireDocPrefix) return true;
  return prev.text.trimStart().startsWith('/**');
}

function isDocumented(n: TSNode, lang: string): boolean {
  switch (lang) {
    case 'python': {
      const body = n.type === 'module' ? n : firstChildOfType(n, 'block');
      if (!body) return false;
      const first = body.namedChild(0);
      return Boolean(
        first &&
        first.type === 'expression_statement' &&
        first.namedChild(0)?.type === 'string'
      );
    }
    case 'typescript':
    case 'javascript':
      return precededByComment(n, 'comment', true);
    case 'java':
      return precededByComment(n, 'block_comment', true);
    case 'kotlin':
      return precededByComment(n, 'multiline_comment', true);
    case 'go':
      return precededByComment(n, 'comment', false);
    default:
      return false;
  }
}

/** Whether a documentable node is part of the public/exported API surface. */
function isPublic(n: TSNode, lang: string): boolean {
  switch (lang) {
    case 'python': {
      if (n.type === 'module') return false; // file node: overall only
      const name = firstChildOfType(n, 'identifier');
      return Boolean(name && !name.text.startsWith('_'));
    }
    case 'go': {
      let name: TSNode | null = null;
      if (n.type === 'function_declaration')
        name = firstChildOfType(n, 'identifier');
      else if (n.type === 'method_declaration')
        name = firstChildOfType(n, 'field_identifier');
      else if (n.type === 'type_declaration') {
        const spec = firstChildOfType(n, 'type_spec');
        name = spec ? firstChildOfType(spec, 'type_identifier') : null;
      }
      return Boolean(name && /^[A-Z]/.test(name.text));
    }
    case 'typescript':
    case 'javascript':
      return n.parent?.type === 'export_statement';
    case 'java': {
      const mods = firstChildOfType(n, 'modifiers');
      if (!mods) return true; // package-default → treated as public
      const t = mods.text;
      return !/\bprivate\b/.test(t) && !/\bprotected\b/.test(t);
    }
    case 'kotlin': {
      const mods = firstChildOfType(n, 'modifiers');
      if (!mods) return true; // no modifiers → public by default
      const vis = firstChildOfType(mods, 'visibility_modifier');
      if (!vis) return true;
      return vis.text === 'public';
    }
    default:
      return false;
  }
}

// --- Aggregate shape + single pass ----------------------------------------

export interface RepoAstAnalysis {
  loc: {
    byLanguage: Record<string, { files: number; loc: number }>;
    totalLoc: number;
    fileCount: number;
  };
  complexity: {
    /** Non-generated grammar-supported files — the empty-SKIP + confidence denominator. */
    grammarFileCount: number;
    totalCcn: number;
    maxCcn: number;
    hotspotCount: number;
    functionsAnalysed: number;
    filesAnalysed: number;
    filesSkipped: number;
  };
  doc: {
    /** Non-generated doc-convention files — the empty-SKIP + confidence denominator. */
    docFileCount: number;
    total: number;
    documented: number;
    publicTotal: number;
    publicDocumented: number;
    filesAnalysed: number;
  };
}

const repoAstCache = new Map<string, Promise<RepoAstAnalysis>>();

/**
 * Walk, read, and parse `repoPath` once, producing the aggregates loc_scale,
 * cyclomatic_complexity, and doc_coverage each format their result from.
 * Memoized per repoPath (like listRepoFiles) so the three metrics share one
 * pass. Parsing is gated on initParser(); when it fails, only the LOC counts
 * (which need no parse) are populated and the metrics SKIP off the empty
 * complexity/doc aggregates exactly as they did when they parsed themselves.
 */
export function analyzeRepoAst(repoPath: string): Promise<RepoAstAnalysis> {
  const cached = repoAstCache.get(repoPath);
  if (cached) return cached;
  const p = computeRepoAst(repoPath);
  repoAstCache.set(repoPath, p);
  return p;
}

async function computeRepoAst(repoPath: string): Promise<RepoAstAnalysis> {
  const analysis: RepoAstAnalysis = {
    loc: { byLanguage: {}, totalLoc: 0, fileCount: 0 },
    complexity: {
      grammarFileCount: 0,
      totalCcn: 0,
      maxCcn: 0,
      hotspotCount: 0,
      functionsAnalysed: 0,
      filesAnalysed: 0,
      filesSkipped: 0,
    },
    doc: {
      docFileCount: 0,
      total: 0,
      documented: 0,
      publicTotal: 0,
      publicDocumented: 0,
      filesAnalysed: 0,
    },
  };
  if (!existsSync(repoPath)) return analysis;

  const parseReady = await initParser();
  const loader = getSharedLoader();
  const Parser = getParserClass();
  const parser = parseReady ? new Parser() : null;
  const cx = analysis.complexity;
  const doc = analysis.doc;

  for (const filePath of listRepoFiles(repoPath)) {
    const ext = extname(filePath).toLowerCase();
    const grammarFile = EXT_TO_GRAMMAR[ext];
    if (!grammarFile) continue; // not a supported source language
    if (isGeneratedPath(relative(repoPath, filePath))) continue;

    // Every surviving file is both a LOC file and a complexity file (shared
    // ext universe); doc only for doc-convention languages.
    cx.grammarFileCount++;
    const docLang = EXT_TO_LANG_DOC.get(ext);
    if (docLang) doc.docFileCount++;

    // Read once. LOC counts every readable file (no size cap); a read failure
    // is a complexity skip and drops the file from LOC (matching loc_scale).
    let buf: Buffer;
    try {
      buf = readFileSync(filePath);
    } catch {
      cx.filesSkipped++;
      continue;
    }

    const locLang = EXT_TO_LANG_LOC[ext];
    const loc = countLines(buf.toString('utf8'));
    analysis.loc.totalLoc += loc;
    analysis.loc.fileCount++;
    const bucket =
      analysis.loc.byLanguage[locLang] ??
      (analysis.loc.byLanguage[locLang] = { files: 0, loc: 0 });
    bucket.files++;
    bucket.loc += loc;

    // Parse for the complexity + doc visitors. Grammar-missing, oversized, or
    // unparseable files are complexity skips (and simply absent from doc,
    // matching doc_coverage's per-file `continue`).
    if (!parser) {
      cx.filesSkipped++;
      continue;
    }
    const grammar = await loader.load(grammarFile);
    if (!grammar) {
      cx.filesSkipped++;
      continue;
    }
    if (buf.length > MAX_FILE_BYTES) {
      cx.filesSkipped++;
      continue;
    }
    const source = buf.toString('utf8');

    let tree: { rootNode: TSNode; delete(): void } | null;
    try {
      parser.setLanguage(grammar);
      tree = parser.parse(source);
    } catch {
      cx.filesSkipped++;
      continue;
    }
    if (!tree) {
      cx.filesSkipped++;
      continue;
    }

    try {
      // Complexity visitor.
      try {
        const fns: TSNode[] = [];
        collectFunctions(tree.rootNode, fns);
        cx.filesAnalysed++;
        const units =
          fns.length === 0
            ? [1 + countDecisions(tree.rootNode)]
            : fns.map((fn) => 1 + countDecisions(fn));
        for (const ccn of units) {
          cx.totalCcn += ccn;
          cx.functionsAnalysed++;
          if (ccn > cx.maxCcn) cx.maxCcn = ccn;
          if (ccn > CCN_THRESHOLD) cx.hotspotCount++;
        }
      } catch {
        cx.filesSkipped++;
      }

      // Doc-coverage visitor (doc-convention languages only).
      const docTypes = docLang ? DOC_TYPES.get(docLang) : undefined;
      if (docLang && docTypes) {
        try {
          doc.filesAnalysed++;
          const defs: TSNode[] = [];
          collectDocumentable(tree.rootNode, docTypes, defs);
          for (const def of defs) {
            const documented = isDocumented(def, docLang);
            const pub = isPublic(def, docLang);
            doc.total++;
            if (documented) doc.documented++;
            if (pub) {
              doc.publicTotal++;
              if (documented) doc.publicDocumented++;
            }
          }
        } catch {
          // A parse-visit failure on one file must not abort the metric.
        }
      }
    } finally {
      tree.delete();
    }
  }

  parser?.delete();
  return analysis;
}
