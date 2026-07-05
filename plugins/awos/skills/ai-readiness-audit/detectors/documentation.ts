import { makeResult, iterFiles, readTextSafe } from './_base.ts';
import { findApiSpecFiles } from './api_specs.ts';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

// ---------------------------------------------------------------------------
// detectRootReadme — category 2200 (DOC-01, method: detected)
//
// Checks that the repository has a top-level README.md with setup
// instructions a new developer could follow.
//
// Signals:
//   - README.md / README.rst / README.txt exists at repo root.
//   - File is non-trivial (> 200 bytes and contains a heading + at least one
//     of: install, setup, usage, getting started, run, build).
//
// PASS  if README exists with substance.
// WARN  if README exists but appears trivial (no setup content).
// FAIL  if no README found.
// ---------------------------------------------------------------------------

const README_NAMES = [
  'README.md',
  'README.rst',
  'README.txt',
  'Readme.md',
  'readme.md',
];

const SETUP_CONTENT_RX =
  /\b(install|setup|usage|getting[_\s-]started|quick[_\s-]start|run|build|deploy|prerequisite|requirement)\b/i;

// Matches Markdown headings (# Title) and RST-style underline headings (=====)
const HEADING_RX = /^#+ |\n#+ |^[=\-~^"'`]+\s*$/m;

export function detectRootReadme(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  let readmePath: string | null = null;
  for (const name of README_NAMES) {
    const full = join(repoPath, name);
    if (existsSync(full)) {
      readmePath = full;
      break;
    }
  }

  if (!readmePath) {
    return makeResult('FAIL', 0, [
      'no README file found at repository root — a new developer has no entry point',
    ]);
  }

  const content = readTextSafe(readmePath);
  if (content === null) {
    return makeResult('WARN', 0, [
      `README found but could not be read: ${relative(repoPath, readmePath)}`,
    ]);
  }

  const relPath = relative(repoPath, readmePath);

  if (content.length <= 200) {
    return makeResult('WARN', content.length, [
      `${relPath} is too short (${content.length} bytes) — missing setup instructions`,
    ]);
  }

  if (!SETUP_CONTENT_RX.test(content)) {
    return makeResult('WARN', content.length, [
      `${relPath} exists but contains no setup/install/usage instructions`,
    ]);
  }

  if (!HEADING_RX.test(content)) {
    return makeResult('WARN', content.length, [
      `${relPath} lacks a Markdown heading structure — may not be well-organised`,
    ]);
  }

  return makeResult('PASS', content.length, [
    `${relPath} present with headings and setup instructions (${content.length} bytes)`,
  ]);
}

// ---------------------------------------------------------------------------
// detectServiceReadmes — category 2201 (DOC-02, method: detected)
//
// Checks that each major service directory has its own README.md with build
// and run instructions.
//
// "Major service directory" heuristic:
//   Top-level directories that contain source files AND have more than a
//   threshold of files (10+) are treated as service directories.
//
// PASS  if ≥ 80% of discovered service directories have a README.
// WARN  if 50%–79% have a README.
// FAIL  if < 50% have a README.
// SKIP  if no multi-directory project structure detected (single-service).
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.venv',
  '__pycache__',
  '.next',
  'target',
  'vendor',
  '.github',
  '.claude',
  '.awos',
  'docs',
  'doc',
  'assets',
  'static',
  'public',
  'resources',
  // Conventional layout dirs of a SINGLE-service repo — a `src/` or `lib/`
  // full of source files is not a "service" and must not demand its own
  // README.
  'src',
  'tests',
  'test',
  'app',
  'lib',
]);

const SERVICE_SOURCE_GLOBS = [
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.py',
  '*.go',
  '*.java',
  '*.kt',
];

interface ServiceDir {
  path: string;
  name: string;
  hasReadme: boolean;
}

export function detectServiceReadmes(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  // Find top-level directories that look like services
  let topDirs: string[] = [];
  try {
    const entries = readdirSync(repoPath, { withFileTypes: true });
    topDirs = entries
      .filter(
        (e) =>
          e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')
      )
      .map((e) => e.name)
      .sort();
  } catch {
    topDirs = [];
  }

  if (topDirs.length === 0) {
    return makeResult('SKIP', null, [
      'no top-level service directories found — single-service project, DOC-02 not applicable',
    ]);
  }

  const serviceDirs: ServiceDir[] = [];

  for (const dirName of topDirs) {
    const dirPath = join(repoPath, dirName);
    // Check if directory has source files (is a code service, not docs/config)
    const srcFiles = iterFiles(dirPath, SERVICE_SOURCE_GLOBS, [
      'node_modules',
      '.venv',
      '__pycache__',
      'dist',
      'build',
      'target',
    ]);
    if (srcFiles.length < 5) continue; // Skip tiny dirs

    const hasReadme = existsSync(join(dirPath, 'README.md'));
    serviceDirs.push({ path: dirPath, name: dirName, hasReadme });
  }

  // A single candidate dir is not a multi-service layout — one top-level
  // code dir is just where the (single) service lives, and DOC-02's
  // per-service README expectation does not apply.
  if (serviceDirs.length <= 1) {
    return makeResult('SKIP', null, [
      'no multi-service directory structure detected — DOC-02 not applicable',
    ]);
  }

  const withReadme = serviceDirs.filter((d) => d.hasReadme);
  const ratio = withReadme.length / serviceDirs.length;

  const evidence = [
    `${withReadme.length}/${serviceDirs.length} service directories have README.md`,
    ...serviceDirs.map(
      (d) => `${d.name}/: ${d.hasReadme ? 'README present' : 'README MISSING'}`
    ),
  ];

  if (ratio >= 0.8) {
    return makeResult('PASS', withReadme.length, evidence);
  }

  if (ratio >= 0.5) {
    return makeResult('WARN', withReadme.length, [
      `only ${withReadme.length}/${serviceDirs.length} service directories have README.md`,
      ...evidence.slice(1),
    ]);
  }

  return makeResult('FAIL', withReadme.length, [
    `only ${withReadme.length}/${serviceDirs.length} service directories have README.md — most are missing docs`,
    ...evidence.slice(1),
  ]);
}

// ---------------------------------------------------------------------------
// detectApiDocs — category 2202 (DOC-03, method: detected)
//
// applies_when: topology.has_api
//
// Checks that API endpoints are documented via OpenAPI/Swagger specs or
// equivalent.
//
// Signals:
//   - any YAML/JSON document carrying a top-level OpenAPI/Swagger/AsyncAPI
//     version key (content-sniffed via api_specs.ts — file naming varies by
//     team; the standard's mandatory version field does not)
//   - FastAPI auto-docs indicator: `app = FastAPI(` present
//   - Springdoc / Springfox import in Java/Kotlin source
//
// PASS  if API docs found proportional to detected API surface.
// FAIL  if no API documentation found.
// SKIP  if no API source files detected.
// ---------------------------------------------------------------------------

// No outer \b(...)\b wrapper: `\b` before `@` can never match (both sides
// non-word), and a trailing `\b` after `(` / `)` kills `express()` /
// `FastAPI(` / `gin.Default(`. Word boundaries are applied per-alternative
// where they are meaningful.
const API_SOURCE_RX =
  /(?:@RestController\b|@app\.route|@router\.|\brouter\.(?:get|post)|\bapp\.(?:get|post)|\bFastAPI\(|\bexpress\(\)|\bflask\.Flask\(|\bgin\.Default\(|\bchi\.NewRouter\b|\bhttp\.HandleFunc\b)/i;

const AUTO_DOCS_RX = /FastAPI\(|app\s*=\s*FastAPI\(|springdoc|springfox/i;

export function detectApiDocs(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  // Check for API source files to determine if this is an API project
  const apiSourceFiles = iterFiles(
    repoPath,
    ['*.py', '*.ts', '*.js', '*.java', '*.kt', '*.go'],
    [
      'node_modules',
      '.venv',
      '__pycache__',
      'dist',
      'build',
      'target',
      'tests',
      'test',
    ]
  );

  let hasApiSource = false;
  for (const f of apiSourceFiles.slice(0, 100)) {
    const content = readTextSafe(f);
    if (content === null) continue;
    if (API_SOURCE_RX.test(content)) {
      hasApiSource = true;
      break;
    }
  }

  if (!hasApiSource) {
    return makeResult('SKIP', null, [
      'no API source patterns detected — DOC-03 not applicable',
    ]);
  }

  const signals: string[] = [];

  // Check for static API doc files by CONTENT (top-level spec version key),
  // not by basename — see api_specs.ts.
  const apiDocFiles = findApiSpecFiles(repoPath);
  if (apiDocFiles.length > 0) {
    signals.push(
      ...apiDocFiles
        .slice(0, 5)
        .map((f) => `API spec: ${relative(repoPath, f)}`)
    );
  }

  // Check for auto-docs (FastAPI, Springdoc)
  for (const f of apiSourceFiles.slice(0, 50)) {
    const content = readTextSafe(f);
    if (content === null) continue;
    if (AUTO_DOCS_RX.test(content)) {
      signals.push(`auto-docs framework in: ${relative(repoPath, f)}`);
      break;
    }
  }

  if (signals.length > 0) {
    return makeResult('PASS', signals.length, [
      `API documentation present (${signals.length} signal(s))`,
      ...signals,
    ]);
  }

  return makeResult('FAIL', 0, [
    'API source detected but no API documentation found — add OpenAPI/Swagger spec or use FastAPI auto-docs',
  ]);
}

// ---------------------------------------------------------------------------
// detectDocsAccuracy — category 2203 (DOC-04, method: detected)
//
// Verifies that documentation references match current code reality.
//
// Algorithm:
//   1. Read README.md (root-level).
//   2. Extract `make <target>` references — look up in Makefile.
//   3. Extract referenced file/directory paths that look absolute or relative.
//   4. Count how many referenced items are missing.
//
// Thresholds:
//   0 missing   → PASS
//   1–2 missing → WARN
//   3+ missing  → FAIL
// SKIP  if no README.md found.
//
// Scope: intentionally narrow (make targets + referenced paths). Deeper
// semantic "does the doc describe the real architecture" is judgment-only.
// ---------------------------------------------------------------------------

// Matches `make <target>` only inside inline code. The bare `make <word>` form
// is intentionally excluded — it matches ordinary prose ("make sure", "make
// changes") and would treat those words as Makefile targets.
const MAKE_TARGET_RX = /`make\s+([a-zA-Z0-9_-]+)`/g;

// Matches Makefile target lines: `<target>:` at column 0.
const MAKEFILE_TARGET_RX = /^([a-zA-Z0-9_-][a-zA-Z0-9_.-]*):/gm;

// Matches markdown links to local paths: [text](./path) or [text](path/to/file)
// Excludes http:// and anchors (#).
const LOCAL_LINK_RX = /\[(?:[^\]]+)\]\((?!https?:\/\/)(?!#)([^)]+)\)/g;

// Matches backtick code that looks like a file or directory path.
const BACKTICK_PATH_RX = /`((?:\.\/|\.\.\/|\/)[^`\s]+)`/g;

function extractMakeTargets(readmeContent: string): string[] {
  const targets = new Set<string>();
  let m: RegExpExecArray | null;
  MAKE_TARGET_RX.lastIndex = 0;
  while ((m = MAKE_TARGET_RX.exec(readmeContent)) !== null) {
    const target = m[1];
    if (target && target !== 'install' && target.length > 0) {
      targets.add(target);
    }
  }
  return [...targets].sort();
}

function loadMakefileTargets(repoPath: string): Set<string> {
  const makefileNames = ['Makefile', 'makefile', 'GNUmakefile'];
  for (const name of makefileNames) {
    const full = join(repoPath, name);
    if (!existsSync(full)) continue;
    const content = readTextSafe(full);
    if (content === null) continue;
    const targets = new Set<string>();
    let m: RegExpExecArray | null;
    MAKEFILE_TARGET_RX.lastIndex = 0;
    while ((m = MAKEFILE_TARGET_RX.exec(content)) !== null) {
      targets.add(m[1]);
    }
    return targets;
  }
  return new Set<string>();
}

/** A reference is checkable as a filesystem path only if it looks like a file. */
function looksLikeFilePath(ref: string): boolean {
  const r = ref.trim();
  if (r.length === 0) return false;
  if (r.includes(':')) return false; // command/skill names like awos:architecture, URLs
  if (!/\.[A-Za-z0-9]{1,8}$/.test(r)) return false; // must end in a file extension
  return true;
}

function extractLocalLinks(readmeContent: string): string[] {
  const links: string[] = [];
  let m: RegExpExecArray | null;
  LOCAL_LINK_RX.lastIndex = 0;
  while ((m = LOCAL_LINK_RX.exec(readmeContent)) !== null) {
    const target = m[1].split('#')[0].trim(); // strip anchors
    if (target.length > 0) links.push(target);
  }
  BACKTICK_PATH_RX.lastIndex = 0;
  while ((m = BACKTICK_PATH_RX.exec(readmeContent)) !== null) {
    const p = m[1].trim();
    if (p.length > 0) links.push(p);
  }
  return [...new Set(links)].sort();
}

interface RefMissing {
  kind: 'make-target' | 'path';
  ref: string;
}

export function detectDocsAccuracy(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const readmePath = join(repoPath, 'README.md');

  if (!existsSync(readmePath)) {
    return makeResult('SKIP', null, [
      'no README.md found — docs accuracy check (DOC-04) skipped',
    ]);
  }

  const readmeContent = readTextSafe(readmePath);
  if (readmeContent === null) {
    return makeResult('SKIP', null, [
      'README.md could not be read — DOC-04 skipped',
    ]);
  }

  const missing: RefMissing[] = [];
  const present: RefMissing[] = [];

  // --- make target verification ---
  const makeTargetsInReadme = extractMakeTargets(readmeContent);
  if (makeTargetsInReadme.length > 0) {
    const makefileTargets = loadMakefileTargets(repoPath);
    const hasMakefile =
      existsSync(join(repoPath, 'Makefile')) ||
      existsSync(join(repoPath, 'makefile')) ||
      existsSync(join(repoPath, 'GNUmakefile'));

    for (const target of makeTargetsInReadme) {
      if (!hasMakefile) {
        // README references `make X` but there is no Makefile
        missing.push({ kind: 'make-target', ref: `make ${target}` });
      } else if (!makefileTargets.has(target)) {
        missing.push({ kind: 'make-target', ref: `make ${target}` });
      } else {
        present.push({ kind: 'make-target', ref: `make ${target}` });
      }
    }
  }

  // --- local file/directory link verification ---
  const localLinks = extractLocalLinks(readmeContent);
  for (const link of localLinks) {
    // Skip tokens that don't look like filesystem paths (e.g. /api routes, /skill:names).
    if (!looksLikeFilePath(link)) continue;
    // Resolve relative to README directory (which is repoPath for root README)
    const readmeDir = dirname(readmePath);
    const resolved = join(readmeDir, link);
    if (existsSync(resolved)) {
      present.push({ kind: 'path', ref: link });
    } else {
      missing.push({ kind: 'path', ref: link });
    }
  }

  if (missing.length === 0) {
    return makeResult('PASS', present.length, [
      `${present.length} README reference(s) verified — all referenced items exist`,
      ...present.slice(0, 10).map((r) => `verified: ${r.ref}`),
    ]);
  }

  const evidence = missing.map((r) => `missing: ${r.ref} (${r.kind})`);

  if (missing.length <= 2) {
    return makeResult('WARN', missing.length, [
      `${missing.length} README reference(s) point to non-existent items — docs may be stale`,
      ...evidence,
    ]);
  }

  return makeResult('FAIL', missing.length, [
    `${missing.length} README reference(s) point to non-existent items — documentation is out of date`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// DETECTORS — maps each documentation code to its function.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  2200: detectRootReadme, // DOC-01 root README with substance (detected)
  2201: detectServiceReadmes, // DOC-02 service-level READMEs (detected)
  2202: detectApiDocs, // DOC-03 API documentation (detected)
  2203: detectDocsAccuracy, // DOC-04 docs accuracy via referenced path existence
};
