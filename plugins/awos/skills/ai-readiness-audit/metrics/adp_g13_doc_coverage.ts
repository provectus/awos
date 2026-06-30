/**
 * adp_g13_doc_coverage — in-code documentation coverage via web-tree-sitter AST.
 *
 * kind: "computed"
 * value: number — public/exported doc-comment coverage ratio (0..1).
 * categories_awarded ⊆ {2204, 2205}:
 *   2204 (DOC-05, weight 2) — public/exported coverage ≥ PUBLIC_BAND (0.8)
 *   2205 (DOC-06, weight 1) — overall coverage ≥ OVERALL_BAND (0.6)
 * reliability_default: "maximal"
 *
 * Reuses the single shared grammar-loading path (./_ast.ts) — same wasm loader
 * adp_g10_complexity uses. Async: Parser.init loads tree-sitter.wasm.
 *
 * For each non-generated source file in a language with a doc convention
 * (languages.ts → docConvention.documentableNodeTypes), every documentable AST
 * node is classified as documented/undocumented and public/non-public:
 *
 *   documented —
 *     python: first statement of the body is a docstring (expression_statement
 *             whose first child is a string).
 *     ts/js:  a `comment` beginning with "/**" immediately precedes the node
 *             (or its `export_statement` wrapper).
 *     java:   a `block_comment` beginning with "/**" immediately precedes.
 *     kotlin: a `multiline_comment` beginning with "/**" immediately precedes.
 *     go:     a `comment` immediately precedes the declaration.
 *
 *   public/exported —
 *     python: name does not start with "_" (module node: never public).
 *     go:     identifier starts uppercase.
 *     ts/js:  node is wrapped in an `export_statement`.
 *     java:   modifiers do not include `private`/`protected` (public or default).
 *     kotlin: no `private`/`protected`/`internal` visibility modifier.
 *
 * SKIP (empty sources) when no file in a doc-convention language is present, or
 * when no documentable definitions are found (e.g. grammar unavailable).
 */
import { readFileSync, existsSync } from 'node:fs';
import { extname, relative } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';
import { clamp01 } from './_score.ts';
import { isGeneratedPath } from '../generated.ts';
import { LANGUAGES } from '../languages.ts';
import {
  EXT_TO_GRAMMAR,
  MAX_FILE_BYTES,
  LanguageLoader,
  getParserClass,
  initParser,
  resolveGrammarsDir,
  walkDir,
  type TSNode,
} from './_ast.ts';

// Award bands (conservative).
const PUBLIC_BAND = 0.8;
const OVERALL_BAND = 0.6;

// ---------------------------------------------------------------------------
// Language tables derived from the LanguageDef registry (single source of truth)
// ---------------------------------------------------------------------------

// ext (".py") → language id, and language id → its documentable node-type set.
const EXT_TO_LANG = new Map<string, string>();
const DOC_TYPES = new Map<string, Set<string>>();
for (const l of LANGUAGES) {
  if (!l.docConvention) continue;
  DOC_TYPES.set(l.id, new Set(l.docConvention.documentableNodeTypes));
  for (const glob of l.sourceGlobs) {
    const ext = glob.replace(/^\*/, '').toLowerCase(); // "*.ts" → ".ts"
    if (EXT_TO_GRAMMAR[ext]) EXT_TO_LANG.set(ext, l.id);
  }
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Per-language documented / public classification
// ---------------------------------------------------------------------------

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
      // Any preceding line/block comment documents a Go declaration.
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
      // Public when the declaration is exported. Methods are never directly
      // exported, so they count toward overall coverage only.
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

// ---------------------------------------------------------------------------
// Skip helper
// ---------------------------------------------------------------------------

function makeSkip(): MetricResult {
  return makeMetricResult(
    'adp_g13_doc_coverage',
    null,
    'computed',
    [],
    computeReliability('maximal', [], ['audit']),
    [],
    ['audit']
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

  // Gather source files in doc-convention languages (non-generated).
  const filePaths: string[] = [];
  walkDir(repoPath, (p) => {
    if (isGeneratedPath(relative(repoPath, p))) return;
    if (EXT_TO_LANG.has(extname(p).toLowerCase())) filePaths.push(p);
  });
  if (filePaths.length === 0) return makeSkip();

  if (!(await initParser())) return makeSkip();
  const Parser = getParserClass();
  const loader = new LanguageLoader(resolveGrammarsDir());
  const parser = new Parser();

  let total = 0;
  let documented = 0;
  let publicTotal = 0;
  let publicDocumented = 0;
  let filesAnalysed = 0;

  for (const filePath of filePaths) {
    const ext = extname(filePath).toLowerCase();
    const lang = EXT_TO_LANG.get(ext);
    if (!lang) continue;
    const docTypes = DOC_TYPES.get(lang);
    if (!docTypes) continue;

    const grammar = await loader.load(EXT_TO_GRAMMAR[ext]);
    if (!grammar) continue;

    let source: string;
    try {
      const buf = readFileSync(filePath);
      if (buf.length > MAX_FILE_BYTES) continue;
      source = buf.toString('utf8');
    } catch {
      continue;
    }

    try {
      parser.setLanguage(grammar);
      const tree = parser.parse(source);
      if (!tree) continue;
      filesAnalysed++;

      const defs: TSNode[] = [];
      collectDocumentable(tree.rootNode, docTypes, defs);
      for (const def of defs) {
        const doc = isDocumented(def, lang);
        const pub = isPublic(def, lang);
        total++;
        if (doc) documented++;
        if (pub) {
          publicTotal++;
          if (doc) publicDocumented++;
        }
      }
      tree.delete();
    } catch {
      // Parse failure on one file should not abort the whole metric.
      continue;
    }
  }

  parser.delete();

  if (filesAnalysed === 0 || total === 0) return makeSkip();

  const overallCoverage = documented / total;
  const publicCoverage = publicTotal > 0 ? publicDocumented / publicTotal : 0;

  const awarded: number[] = [];
  if (publicTotal > 0 && publicCoverage >= PUBLIC_BAND) awarded.push(2204);
  if (overallCoverage >= OVERALL_BAND) awarded.push(2205);

  const expression =
    publicTotal > 0
      ? `${publicDocumented} of ${publicTotal} public defs documented = ${publicCoverage.toFixed(2)}`
      : `${documented} of ${total} defs documented = ${overallCoverage.toFixed(2)}`;

  const score2204 = clamp01(publicCoverage);
  const score2205 = clamp01(overallCoverage);
  const docConfidence =
    filePaths.length > 0 ? filesAnalysed / filePaths.length : 0;

  return makeMetricResult(
    'adp_g13_doc_coverage',
    Math.round(publicCoverage * 1000) / 1000,
    'computed',
    awarded,
    computeReliability('maximal', ['audit'], []),
    ['audit'],
    [],
    null,
    undefined,
    expression,
    score2204,
    docConfidence,
    { 2204: score2204, 2205: score2205 }
  );
}
