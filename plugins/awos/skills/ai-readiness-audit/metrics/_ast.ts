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
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import webTreeSitter from 'web-tree-sitter';

import { dropIgnored } from '../git_ignore.ts';

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
 * Resolve the directory holding grammar wasm files.
 * - Bundled (dist/cli.js): grammars are in dist/grammars/ (sibling of cli.js).
 * - Source (tsx): node_modules/tree-sitter-wasms/out/ up the tree.
 */
export function resolveGrammarsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const distGrammars = join(here, 'grammars');
  if (existsSync(distGrammars)) return distGrammars;
  const candidates = [
    join(
      here,
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
      here,
      '..',
      '..',
      '..',
      '..',
      'node_modules',
      'tree-sitter-wasms',
      'out'
    ),
    join(here, '..', '..', '..', 'node_modules', 'tree-sitter-wasms', 'out'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return distGrammars; // fallback — yields a clean SKIP per missing grammar
}

/**
 * Resolve the core tree-sitter.wasm path.
 * - Bundled (dist/): dist/tree-sitter.wasm (sibling of cli.js).
 * - Source (tsx): node_modules/web-tree-sitter/tree-sitter.wasm up the tree.
 */
export function resolveCoreWasm(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const distWasm = join(here, 'tree-sitter.wasm');
  if (existsSync(distWasm)) return distWasm;
  const candidates = [
    join(
      here,
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
      here,
      '..',
      '..',
      '..',
      '..',
      'node_modules',
      'web-tree-sitter',
      'tree-sitter.wasm'
    ),
    join(
      here,
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
