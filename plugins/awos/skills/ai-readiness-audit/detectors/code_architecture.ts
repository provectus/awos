import { makeResult, iterFiles } from './_base.ts';
import { readFileSync } from 'node:fs';
import { basename, dirname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ALL_SOURCE_GLOBS } from '../languages.ts';

// ---------------------------------------------------------------------------
// detectArchPattern — category 2100 (ARCH-01, method: detected)
//
// PASS if an architecture doc is present (ARCHITECTURE.md, docs/architecture.md,
//   docs/ARCHITECTURE.md, or any *.md whose name contains "architecture").
// WARN if no explicit doc, but the repo has a recognizable layered directory
//   layout (≥ 3 of the canonical layer dirs).
// FAIL if neither is found.
// ---------------------------------------------------------------------------

// Arch doc patterns: root-level files, docs/ subdirectory, design/ subdirectory.
// Supported extensions: .md, .rst, .txt, .adoc
const ARCH_DOC_PATTERNS = [
  'ARCHITECTURE.md',
  'ARCHITECTURE.rst',
  'ARCHITECTURE.txt',
  'ARCHITECTURE.adoc',
  'architecture.md',
  'architecture.rst',
  'architecture.txt',
  'architecture.adoc',
  'docs/architecture.md',
  'docs/architecture.rst',
  'docs/architecture.txt',
  'docs/architecture.adoc',
  'docs/ARCHITECTURE.md',
  'docs/ARCHITECTURE.rst',
  'docs/ARCHITECTURE.txt',
  'docs/ARCHITECTURE.adoc',
  'design/*.md',
];
const LAYERED_DIRS = [
  'routes',
  'controllers',
  'handlers',
  'services',
  'repositories',
  'models',
  'domain',
  'infra',
  'infrastructure',
  'application',
  'api',
  'lib',
  'core',
  'adapters',
  'ports',
  'usecases',
];

export function detectArchPattern(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  // Check for explicit architecture doc files
  const archDocs = iterFiles(repoPath, ARCH_DOC_PATTERNS);
  if (archDocs.length > 0) {
    const found = archDocs.map((p) => relative(repoPath, p));
    return makeResult('PASS', archDocs.length, [
      `architecture documentation found: ${found.join(', ')}`,
    ]);
  }

  // Check for recognizable layered directory layout
  let out: string;
  try {
    out = execFileSync(
      'find',
      [repoPath, '-maxdepth', '3', '-type', 'd', '-print'],
      { encoding: 'utf8' }
    );
  } catch {
    out = '';
  }
  const dirs = out
    .split('\n')
    .filter(Boolean)
    .map((d) => basename(d).toLowerCase());
  const layeredMatches = LAYERED_DIRS.filter((layer) => dirs.includes(layer));

  if (layeredMatches.length >= 3) {
    return makeResult('WARN', layeredMatches.length, [
      `recognizable layered directory structure detected (${layeredMatches.length} canonical dirs: ${layeredMatches.join(', ')}) but no explicit architecture document`,
    ]);
  }

  return makeResult('FAIL', 0, [
    'no architecture documentation or recognizable layered directory structure found',
  ]);
}

// ---------------------------------------------------------------------------
// detectImportGraph — category 2101 (ARCH-02, method: detected)
//
// Grep-based import scanner. Identifies layer violations where lower-level
// modules (models, services) import from higher-level modules (routes, handlers).
//
// Layer hierarchy (lowest → highest):
//   models/domain < repositories < services < controllers < routes/handlers/api
//
// A violation is when a lower layer imports from a higher layer, e.g.:
//   - models/ importing from routes/, controllers/, handlers/
//   - services/ importing from routes/, controllers/, handlers/
//   - repositories/ importing from routes/, controllers/, handlers/, services/
//
// FAIL if >= 2 violations (or 1 clear cycle).
// WARN if 1 violation.
// PASS if no violations.
// ---------------------------------------------------------------------------

// Layer order — lower index = lower layer (should never import from higher-indexed layers)
const LAYER_TIERS: Record<string, number> = {
  models: 0,
  model: 0,
  domain: 0,
  entities: 0,
  entity: 0,
  repositories: 1,
  repository: 1,
  repos: 1,
  repo: 1,
  services: 2,
  service: 2,
  usecases: 2,
  usecase: 2,
  controllers: 3,
  controller: 3,
  handlers: 4,
  handler: 4,
  routes: 5,
  route: 5,
  api: 5,
};

// Import statement patterns for common languages
const IMPORT_RX =
  /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|from\s+([^\s]+)\s+import)/;

const SOURCE_GLOBS = ALL_SOURCE_GLOBS;

function getLayerTier(dir: string): number | undefined {
  const lower = dir.toLowerCase();
  // Try exact match first, then prefix match
  for (const [key, tier] of Object.entries(LAYER_TIERS)) {
    if (lower === key) return tier;
  }
  for (const [key, tier] of Object.entries(LAYER_TIERS)) {
    if (lower.startsWith(key)) return tier;
  }
  return undefined;
}

interface LayerViolation {
  file: string;
  line: number;
  importPath: string;
  sourceLayer: string;
  targetLayer: string;
}

export function detectImportGraph(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const files = iterFiles(repoPath, SOURCE_GLOBS);
  if (files.length === 0) {
    return makeResult('PASS', 0, [
      'no source files found — no import violations possible',
    ]);
  }

  const violations: LayerViolation[] = [];

  for (const filePath of files) {
    const relPath = relative(repoPath, filePath);
    // Determine the layer of the current file by its parent directory
    const fileDir = basename(dirname(relPath)).toLowerCase();
    const sourceTier = getLayerTier(fileDir);
    if (sourceTier === undefined) continue; // not in a known layer

    let src: string;
    try {
      src = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = IMPORT_RX.exec(line);
      if (!m) continue;

      const importPath = (m[1] || m[2] || m[3] || '').trim();
      if (!importPath) continue;

      // Extract the target directory from the import path.
      // Strip ALL leading ../ segments so that deep relative imports like
      // '../../routes/index' resolve to 'routes' correctly (not '..' which
      // has no tier match and silently drops the violation).
      // Known limitation: aliased/absolute imports (@/…, ~/…, src/…) are
      // not tier-checked — no false positives but possible false negatives.
      // Known limitation: the grep approach catches one import per line only.
      const parts = importPath
        .replace(/^(?:\.\.\/)+/, '')
        .replace(/^\.\//, '')
        .split('/');
      const targetDir = parts[0].toLowerCase();
      const targetTier = getLayerTier(targetDir);

      if (targetTier !== undefined && targetTier > sourceTier) {
        // Lower-tier module importing from a higher-tier module → violation
        violations.push({
          file: relPath,
          line: i + 1,
          importPath,
          sourceLayer: fileDir,
          targetLayer: targetDir,
        });
      }
    }
  }

  if (violations.length === 0) {
    return makeResult('PASS', 0, ['no import layer violations detected']);
  }

  const evidence = violations
    .slice(0, 10)
    .map(
      (v) =>
        `${v.file}:${v.line} layer violation: ${v.sourceLayer}/ imports from ${v.targetLayer}/ (${v.importPath})`
    );

  // Any layer violation is a clear architectural defect → FAIL
  return makeResult('FAIL', violations.length, [
    `${violations.length} import layer violation(s) detected`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectSeparationOfConcerns — category 2103 (ARCH-04, method: detected)
//
// Count data-access calls inline in route/presentation files.
// Scans files in routes/, controllers/, handlers/, views/, templates/ directories.
//
// Data-access patterns (both SQL and ORM style):
//   - db.query(...), db.execute(...), conn.execute(...)
//   - db.session.query(...), db.session.add(...), db.session.commit(...)
//   - Model.objects.filter(...), Model.find(...), Model.findOne(...)
//   - cursor.execute(...)
//
// Per-file thresholds:
//   FAIL if any presentation-layer file has >= 3 data-access calls.
//   WARN if any has 1–2 data-access calls.
//   PASS if none found.
// ---------------------------------------------------------------------------

const PRESENTATION_DIRS = [
  'routes',
  'route',
  'controllers',
  'controller',
  'handlers',
  'handler',
  'views',
  'view',
  'templates',
  'template',
  'pages',
  'page',
];

// Patterns that indicate direct data-access in presentation code
const DATA_ACCESS_RX =
  /\b(?:db|conn|cursor|session|repository|repo)\s*\.\s*(?:query|execute|find|findOne|findAll|filter|get|update|delete|insert|save|add|commit|remove|all|fetchone|fetchall|fetch_one|fetch_all|run)\s*\(/i;

// ORM-style: ModelName.objects.filter / Model.findOne / Model.findAll / Model.findBy…
// Bare `.find(` is intentionally excluded — it matches Array.prototype.find()
// which is idiomatic JS and not a DB/ORM call. We require either the Django
// `.objects.` accessor or a qualified findOne/findAll/findBy… variant so that
// code like `items.find(x => x.id === id)` is never counted as data access.
const ORM_STATIC_RX =
  /\b\w+\s*\.\s*(?:objects\s*\.\s*(?:filter|get|all|exclude|create|update|delete)\s*\(|find(?:One|All|By\w+)\s*\()/i;

// Raw SQL strings
const RAW_SQL_RX = /(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP)\s+\w+/i;

function countDataAccessCalls(content: string): number {
  const lines = content.split('\n');
  let count = 0;
  for (const line of lines) {
    // Skip comments
    if (/^\s*(?:#|\/\/|\/\*)/.test(line)) continue;
    if (
      DATA_ACCESS_RX.test(line) ||
      ORM_STATIC_RX.test(line) ||
      RAW_SQL_RX.test(line)
    ) {
      count++;
    }
  }
  return count;
}

export function detectSeparationOfConcerns(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const files = iterFiles(repoPath, SOURCE_GLOBS);
  const presentationFiles = files.filter((f) => {
    const dir = basename(dirname(relative(repoPath, f))).toLowerCase();
    return PRESENTATION_DIRS.some((pd) => dir === pd || dir.startsWith(pd));
  });

  if (presentationFiles.length === 0) {
    return makeResult('PASS', 0, [
      'no route/controller/handler files found — separation of concerns not checkable',
    ]);
  }

  interface FileSample {
    file: string;
    count: number;
  }

  const failFiles: FileSample[] = [];
  const warnFiles: FileSample[] = [];

  for (const filePath of presentationFiles) {
    const relPath = relative(repoPath, filePath);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const count = countDataAccessCalls(content);
    if (count >= 3) {
      failFiles.push({ file: relPath, count });
    } else if (count >= 1) {
      warnFiles.push({ file: relPath, count });
    }
  }

  if (failFiles.length > 0) {
    const evidence = failFiles.map(
      (f) =>
        `${f.file}: ${f.count} inline data-access call(s) in presentation layer`
    );
    return makeResult('FAIL', failFiles.length, [
      `${failFiles.length} presentation-layer file(s) have >= 3 inline data-access calls`,
      ...evidence,
    ]);
  }

  if (warnFiles.length > 0) {
    const evidence = warnFiles.map(
      (f) =>
        `${f.file}: ${f.count} inline data-access call(s) in presentation layer`
    );
    return makeResult('WARN', warnFiles.length, [
      `${warnFiles.length} presentation-layer file(s) have 1-2 inline data-access calls`,
      ...evidence,
    ]);
  }

  return makeResult('PASS', presentationFiles.length, [
    `${presentationFiles.length} presentation-layer file(s) checked — no inline data-access calls found`,
  ]);
}

// ---------------------------------------------------------------------------
// detectNamingConventions — category 2104 (ARCH-05, method: detected)
//
// Check file-naming convention adherence across source files.
// Classifies each source filename (without extension) into one of:
//   - snake_case: all lowercase with underscores
//   - kebab-case: all lowercase with hyphens
//   - camelCase: starts with lowercase, has uppercase letters
//   - PascalCase: starts with uppercase
//   - mixed/other
//
// The "dominant" convention is the most common.
// PASS if >= 90% of files follow the dominant convention.
// WARN if 70–89%.
// FAIL if < 70%.
// ---------------------------------------------------------------------------

type NamingConvention =
  | 'snake_case'
  | 'kebab-case'
  | 'camelCase'
  | 'PascalCase'
  | 'other';

function classifyName(name: string): NamingConvention {
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name)) return 'snake_case';
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) return 'kebab-case';
  if (/^[A-Z][A-Za-z0-9]*$/.test(name)) return 'PascalCase';
  if (/^[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*$/.test(name)) return 'camelCase';
  return 'other';
}

const NAMING_SOURCE_GLOBS = ALL_SOURCE_GLOBS;

export function detectNamingConventions(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const files = iterFiles(repoPath, NAMING_SOURCE_GLOBS);

  // Exclude index files, __init__, and config files as they follow their own conventions
  const relevantFiles = files.filter((f) => {
    const base = basename(f).replace(/\.[^.]+$/, ''); // strip extension
    return !['index', '__init__', 'main', 'app', 'setup', 'config'].includes(
      base
    );
  });

  if (relevantFiles.length === 0) {
    return makeResult('PASS', 0, [
      'no source files found — naming convention check skipped',
    ]);
  }

  const counts: Record<NamingConvention, number> = {
    snake_case: 0,
    'kebab-case': 0,
    camelCase: 0,
    PascalCase: 0,
    other: 0,
  };

  for (const f of relevantFiles) {
    const base = basename(f).replace(/\.[^.]+$/, '');
    counts[classifyName(base)]++;
  }

  const total = relevantFiles.length;
  // Find dominant convention (excluding 'other')
  const conventions: NamingConvention[] = [
    'snake_case',
    'kebab-case',
    'camelCase',
    'PascalCase',
  ];
  const dominant = conventions.reduce(
    (best, c) => (counts[c] > counts[best] ? c : best),
    conventions[0]
  );
  const dominantCount = counts[dominant];
  const ratio = dominantCount / total;

  const evidence = [
    `dominant convention: ${dominant} (${dominantCount}/${total} = ${Math.round(ratio * 100)}%)`,
    ...conventions
      .filter((c) => counts[c] > 0)
      .map((c) => `  ${c}: ${counts[c]} file(s)`),
  ];

  if (ratio >= 0.9) {
    return makeResult('PASS', ratio, evidence);
  }
  if (ratio >= 0.7) {
    return makeResult('WARN', ratio, [
      `inconsistent file naming: dominant convention ${dominant} at ${Math.round(ratio * 100)}% (below 90% threshold)`,
      ...evidence,
    ]);
  }
  return makeResult('FAIL', ratio, [
    `inconsistent file naming: dominant convention ${dominant} at only ${Math.round(ratio * 100)}% (below 70% threshold)`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectFileSizes — category 2105 (ARCH-06, method: computed)
//
// Computes the percentage of source files that exceed a LOC threshold (300 lines).
// PASS if <= 10% of files are over the threshold.
// WARN if 11–30%.
// FAIL if > 30%.
// Value is the exact ratio (0–1 float, rounded to 10 decimal places for stability).
// ---------------------------------------------------------------------------

const FILE_SIZE_GLOBS = ALL_SOURCE_GLOBS;
const LOC_THRESHOLD = 300;

function countLines(filePath: string): number {
  try {
    const content = readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

export function detectFileSizes(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const files = iterFiles(repoPath, FILE_SIZE_GLOBS);

  if (files.length === 0) {
    return makeResult(
      'PASS',
      0,
      ['no source files found — file-size check skipped'],
      'computed'
    );
  }

  const oversized: Array<{ file: string; lines: number }> = [];

  for (const filePath of files) {
    const lines = countLines(filePath);
    if (lines > LOC_THRESHOLD) {
      oversized.push({ file: relative(repoPath, filePath), lines });
    }
  }

  const total = files.length;
  // Round to 10 decimal places to avoid floating-point noise
  const ratio = Math.round((oversized.length / total) * 1e10) / 1e10;

  const evidence = [
    `${oversized.length}/${total} source files exceed ${LOC_THRESHOLD} lines`,
    ...oversized.slice(0, 10).map((f) => `${f.file}: ${f.lines} lines`),
  ];

  if (ratio > 0.3) {
    return makeResult(
      'FAIL',
      ratio,
      [
        `${Math.round(ratio * 100)}% of source files exceed ${LOC_THRESHOLD} lines (threshold: 30%)`,
        ...evidence,
      ],
      'computed'
    );
  }
  if (ratio > 0.1) {
    return makeResult(
      'WARN',
      ratio,
      [
        `${Math.round(ratio * 100)}% of source files exceed ${LOC_THRESHOLD} lines (threshold: 10%)`,
        ...evidence,
      ],
      'computed'
    );
  }
  return makeResult(
    'PASS',
    ratio,
    [
      `${Math.round(ratio * 100)}% of source files exceed ${LOC_THRESHOLD} lines — within threshold`,
      ...evidence,
    ],
    'computed'
  );
}

// ---------------------------------------------------------------------------
// DETECTORS — maps each detected/computed code-architecture code to its function.
// Note: 2102 (ARCH-03) is method=judgment — no detector; stays with auditor's rubric.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  2100: detectArchPattern, // ARCH-01 declared/recognizable pattern
  2101: detectImportGraph, // ARCH-02 import direction / no tangled cross-imports
  // 2102 intentionally omitted — ARCH-03 is method=judgment
  2103: detectSeparationOfConcerns, // ARCH-04 separation of concerns
  2104: detectNamingConventions, // ARCH-05 consistent naming conventions
  2105: detectFileSizes, // ARCH-06 file sizes (computed)
};
