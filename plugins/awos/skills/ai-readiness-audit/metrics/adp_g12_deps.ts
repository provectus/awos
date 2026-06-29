/**
 * adp_g12_deps — Direct dependency count (manifest-based).
 *
 * kind: "computed"
 * value: { total_direct_deps, by_manifest: Record<string, number> }
 * categories_awarded: [1303] when at least one manifest is found
 * reliability_default: "not-reliable" — count without directionality
 *
 * Supported manifests:
 *   package.json         → dependencies + devDependencies
 *   pyproject.toml       → [project.dependencies] + [tool.poetry.dependencies]
 *   go.mod               → require() lines (direct, non-indirect)
 *   Cargo.toml           → [dependencies] + [dev-dependencies]
 *   requirements.txt     → non-blank, non-comment lines
 *
 * Source: walks the repo directly using stdlib (no collector artifact needed).
 *
 * SKIP: when no supported manifest is found.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import {
  computeReliability,
  makeMetricResult,
  type MetricResult,
} from './_base.ts';

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

const MANIFEST_NAMES = new Set([
  'package.json',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
  'requirements.txt',
]);

/** Walk looking for manifest files up to depth 3 (root + immediate subdirs + one more). */
function findManifests(dir: string, depth = 0): string[] {
  if (depth > 3) return [];
  const found: string[] = [];
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (PRUNE_DIRS.has(entry.name)) continue;
      found.push(...findManifests(join(dir, entry.name), depth + 1));
    } else if (entry.isFile() && MANIFEST_NAMES.has(entry.name)) {
      found.push(join(dir, entry.name));
    }
  }
  return found;
}

/** Parse package.json: count dependencies + devDependencies keys. */
function parsePackageJson(content: string): number {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    return 0;
  }
  const deps = Object.keys(
    (parsed.dependencies as Record<string, unknown>) ?? {}
  );
  const devDeps = Object.keys(
    (parsed.devDependencies as Record<string, unknown>) ?? {}
  );
  return deps.length + devDeps.length;
}

/** Parse pyproject.toml: count entries in [project.dependencies] or [tool.poetry.dependencies]. */
function parsePyprojectToml(content: string): number {
  // Simple line-based parse: look for dependency list items.
  // [project.dependencies] entries look like: "requests>=2.0"
  // [tool.poetry.dependencies] entries look like: requests = "^2.0"
  const lines = content.split('\n');
  let inDepsSection = false;
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inDepsSection =
        trimmed === '[project.dependencies]' ||
        trimmed === '[tool.poetry.dependencies]' ||
        trimmed === '[tool.poetry.dev-dependencies]' ||
        trimmed === '[project.optional-dependencies]';
      continue;
    }
    if (!inDepsSection) continue;
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Array items in [project.dependencies] are quoted strings
    if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
      count++;
    } else if (trimmed.includes('=') && !trimmed.startsWith('[')) {
      // key = "value" in poetry format
      count++;
    }
  }
  return count;
}

/** Parse go.mod: count require() entries that are not indirect. */
function parseGoMod(content: string): number {
  let count = 0;
  let inRequireBlock = false;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line === 'require (') {
      inRequireBlock = true;
      continue;
    }
    if (inRequireBlock && line === ')') {
      inRequireBlock = false;
      continue;
    }
    if (inRequireBlock) {
      if (!line || line.startsWith('//')) continue;
      // indirect dependencies have a trailing // indirect comment
      if (!line.includes('// indirect')) count++;
    } else if (line.startsWith('require ') && !line.startsWith('require (')) {
      // Single-line require
      const rest = line.slice('require '.length).trim();
      if (rest && !rest.includes('// indirect')) count++;
    }
  }
  return count;
}

/** Parse Cargo.toml: count [dependencies] + [dev-dependencies] keys. */
function parseCargoToml(content: string): number {
  const lines = content.split('\n');
  let inDeps = false;
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inDeps = trimmed === '[dependencies]' || trimmed === '[dev-dependencies]';
      continue;
    }
    if (!inDeps) continue;
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.includes('=')) count++;
  }
  return count;
}

/** Parse requirements.txt: count non-blank, non-comment lines. */
function parseRequirementsTxt(content: string): number {
  return content.split('\n').filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('#') && !t.startsWith('-r ');
  }).length;
}

function parseManifest(filePath: string, content: string): number {
  const name = basename(filePath);
  switch (name) {
    case 'package.json':
      return parsePackageJson(content);
    case 'pyproject.toml':
      return parsePyprojectToml(content);
    case 'go.mod':
      return parseGoMod(content);
    case 'Cargo.toml':
      return parseCargoToml(content);
    case 'requirements.txt':
      return parseRequirementsTxt(content);
    default:
      return 0;
  }
}

export function compute(
  _collectedDir: string,
  _standards: Record<string, unknown>,
  _topology: Record<string, boolean>,
  repoPathOverride?: string
): MetricResult {
  const repoPath = repoPathOverride ?? _collectedDir;

  if (!existsSync(repoPath)) {
    return makeMetricResult(
      'adp_g12_deps',
      null,
      'computed',
      [],
      computeReliability('not-reliable', [], ['scale']),
      [],
      ['scale']
    );
  }

  const manifests = findManifests(repoPath);

  if (manifests.length === 0) {
    return makeMetricResult(
      'adp_g12_deps',
      null,
      'computed',
      [],
      computeReliability('not-reliable', [], ['scale']),
      [],
      ['scale']
    );
  }

  const byManifest: Record<string, number> = {};
  let total = 0;

  for (const manifest of manifests) {
    let content: string;
    try {
      content = readFileSync(manifest, 'utf8');
    } catch {
      continue;
    }
    const count = parseManifest(manifest, content);
    byManifest[manifest] = count;
    total += count;
  }

  const value = { total_direct_deps: total, by_manifest: byManifest };
  const reliability = computeReliability('not-reliable', ['scale'], []);
  const expression = `${total} direct dependencies across ${Object.keys(byManifest).length} manifest${Object.keys(byManifest).length !== 1 ? 's' : ''}`;

  return makeMetricResult(
    'adp_g12_deps',
    value,
    'computed',
    [1303],
    reliability,
    ['scale'],
    [],
    null,
    undefined,
    undefined,
    expression,
    1.0,
    1.0
  );
}
