/**
 * doc_coverage — in-code documentation coverage via web-tree-sitter AST.
 *
 * kind: "computed"
 * value: number — public/exported doc-comment coverage ratio (0..1).
 * categories_awarded ⊆ {2204, 2205} — awarded unconditionally (2204 only when
 * a public surface exists), with a continuous per-code score modulating the
 * weight:
 *   2204 (DOC-05, weight 2) — score = public/exported doc coverage (0..1)
 *   2205 (DOC-06, weight 1) — score = overall doc coverage (0..1)
 * No threshold cliff: audit_core derives the badge from the score
 * (PASS ≈1 / PARTIAL in-between / FAIL ≈0) and awards weight × score.
 * reliability_default: "maximal"
 *
 * The repo walk, per-file parse, and the documented/public classification are
 * shared with cyclomatic_complexity and loc_scale through analyzeRepoAst
 * (./_ast.ts) — one pass reads and parses each file once. The per-language
 * documented/public rules live there. Async: analyzeRepoAst awaits Parser.init.
 *
 * SKIP (empty sources) when no file in a doc-convention language is present, or
 * when no documentable definitions are found (e.g. grammar unavailable).
 */
import { existsSync } from 'node:fs';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';
import { clamp01 } from './_score.ts';
import { analyzeRepoAst, getInitError, initParser } from './_ast.ts';

// ---------------------------------------------------------------------------
// Skip helper
// ---------------------------------------------------------------------------

function makeSkip(reason?: string): MetricResult {
  const reliability = computeReliability('maximal', [], ['audit']);
  if (reason) {
    reliability.note = reliability.note
      ? `${reliability.note} (${reason})`
      : reason;
  }
  return makeMetricResult(
    'doc_coverage',
    null,
    'computed',
    [],
    reliability,
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

  const { doc } = await analyzeRepoAst(repoPath);

  // No file in a doc-convention language → SKIP (was filePaths.length===0).
  if (doc.docFileCount === 0) return makeSkip();

  if (!(await initParser())) {
    return makeSkip(getInitError() ?? 'tree-sitter init failed');
  }

  if (doc.filesAnalysed === 0 || doc.total === 0) return makeSkip();

  const overallCoverage = doc.documented / doc.total;
  const publicCoverage =
    doc.publicTotal > 0 ? doc.publicDocumented / doc.publicTotal : 0;

  // Award unconditionally (like the other continuous metrics): the continuous
  // score modulates each code's weight, so 0.799 public coverage earns
  // ~0.8 × weight instead of falling off a threshold cliff to 0 points.
  // audit_core derives the check badge from the score (PASS ≈1, PARTIAL
  // in-between, FAIL ≈0), so status still reflects the coverage level
  // without zeroing the award. 2204 applies only when a public surface
  // exists to measure.
  const awarded: number[] = [];
  if (doc.publicTotal > 0) awarded.push(2204);
  awarded.push(2205);

  // Each code carries its own evidence line: 2204 scores the public surface,
  // 2205 scores ALL defs — reusing the public line for 2205 would show
  // "= 1.00" next to a sub-1.0 score whenever a private def is undocumented.
  const skipped = doc.docFileCount - doc.filesAnalysed;
  const skipClause =
    skipped > 0
      ? `; ${skipped} of ${doc.docFileCount} doc-convention files skipped (parse error or unsupported format)`
      : '';
  const publicLine = `${doc.publicDocumented} of ${doc.publicTotal} public defs documented = ${publicCoverage.toFixed(2)}${skipClause}`;
  const overallLine = `${doc.documented} of ${doc.total} defs documented = ${overallCoverage.toFixed(2)}${skipClause}`;
  const expression = doc.publicTotal > 0 ? publicLine : overallLine;

  const score2204 = clamp01(publicCoverage);
  const score2205 = clamp01(overallCoverage);
  const docConfidence =
    doc.docFileCount > 0 ? doc.filesAnalysed / doc.docFileCount : 0;

  return makeMetricResult(
    'doc_coverage',
    Math.round(publicCoverage * 1000) / 1000,
    'computed',
    awarded,
    computeReliability('maximal', ['audit'], []),
    ['audit'],
    [],
    {
      expression,
      score: score2204,
      confidence: docConfidence,
      scorePerCode: { 2204: score2204, 2205: score2205 },
      evidencePerCode: { 2204: [publicLine], 2205: [overallLine] },
    }
  );
}
