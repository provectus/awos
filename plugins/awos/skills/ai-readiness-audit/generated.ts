// generated.ts — shared set of generated/vendored path patterns excluded from
// fairness-sensitive metrics (file size, complexity, scale, doc coverage).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Glob-ish suffix/dir markers for generated or vendored files. */
export const GENERATED_GLOBS: string[] = [
  '**/htmlcov/**',
  '**/*_pb2.py',
  '**/*_pb2_grpc.py',
  '**/*.generated.*',
  '**/generated/**',
  '**/__generated__/**',
  '**/vendor/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/node_modules/**',
  '**/*.min.*',
];

// Directory segments that, if present anywhere in the path, mark it generated/vendored.
const DIR_MARKERS = [
  'htmlcov',
  'generated',
  '__generated__',
  'vendor',
  'dist',
  'build',
  '.next',
  'node_modules',
  // Python virtualenvs, installed packages, and tool caches
  '.venv',
  'venv',
  'env',
  'site-packages',
  '.tox',
  '.nox',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.eggs',
  // other ecosystem build/cache dirs
  '.gradle',
  '.terraform',
];

/** True if a repo-relative path looks generated or vendored. */
export function isGeneratedPath(repoRelPath: string): boolean {
  const p = repoRelPath.replace(/\\/g, '/');
  const segments = p.split('/');
  if (segments.some((s) => DIR_MARKERS.includes(s))) return true;
  if (/(?:_pb2(?:_grpc)?)\.py$/.test(p)) return true;
  if (/\.generated\.[^/]+$/.test(p)) return true;
  if (/\.min\.[^/]+$/.test(p)) return true;
  return false;
}

/**
 * Extra globs from `.gitattributes` `linguist-generated` entries, if present.
 * Returns the path patterns (left-hand column) marked linguist-generated=true.
 */
export function gitattributesGeneratedGlobs(repoPath: string): string[] {
  const f = join(repoPath, '.gitattributes');
  if (!existsSync(f)) return [];
  const out: string[] = [];
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (
      /linguist-generated(?:=true)?\b/.test(t) &&
      !/linguist-generated=false/.test(t)
    ) {
      const pat = t.split(/\s+/)[0];
      if (pat) out.push(pat);
    }
  }
  return out;
}
