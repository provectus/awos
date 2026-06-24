import { makeResult, iterFiles } from './_base.ts';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// detectVerticalDelivery — category 2300 (E2E-01, method: computed)
//
// applies_when: topology.is_monorepo
//
// Detects whether feature branches touch multiple top-level source layers in
// a single commit range. Uses git branch + log analysis.
//
// Algorithm:
//   1. Detect recognisable multi-layer directories (api/backend + frontend/ui).
//   2. List feature branches (exclude trunk).
//   3. For each branch, check if commits touch files in ≥ 2 distinct layers.
//   4. ratio = vertical_branches / total_feature_branches
//
// PASS  if ratio >= 0.50
// WARN  if 0.25 <= ratio < 0.50
// FAIL  if ratio < 0.25
// SKIP  if no feature branches, or not a multi-layer repo, or not a git repo
// ---------------------------------------------------------------------------

const TRUNK_NAMES = new Set(['main', 'master', 'develop', 'development']);

// Layer buckets: a file path must contain one of these segment patterns to
// count as belonging to that layer. Using lowercase matching.
const LAYER_PATTERNS: Array<{ name: string; patterns: RegExp }> = [
  {
    name: 'api/backend',
    patterns:
      /\/(api|backend|server|services?|routes?|controllers?|handlers?|endpoints?)\//i,
  },
  {
    name: 'frontend/ui',
    patterns: /\/(frontend|ui|web|client|app|pages?|components?|views?)\//i,
  },
  {
    name: 'database',
    patterns: /\/(db|database|migrations?|schemas?|sql|models?)\//i,
  },
  {
    name: 'infra',
    patterns:
      /\/(infra|infrastructure|terraform|k8s|kubernetes|helm|deploy)\//i,
  },
];

function detectTrunk(repoPath: string): string {
  for (const candidate of ['main', 'master', 'develop', 'development']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', candidate], {
        cwd: repoPath,
        encoding: 'utf8',
      });
      return candidate;
    } catch {
      // try next
    }
  }
  return 'main';
}

function listFeatureBranches(repoPath: string): string[] {
  try {
    const out = execFileSync('git', ['branch', '--format=%(refname:short)'], {
      cwd: repoPath,
      encoding: 'utf8',
    });
    return out
      .split('\n')
      .map((b) => b.trim())
      .filter((b) => b.length > 0 && !TRUNK_NAMES.has(b));
  } catch {
    return [];
  }
}

function branchLayerCount(
  repoPath: string,
  branch: string,
  trunk: string
): number {
  let paths: string[];
  try {
    const out = execFileSync(
      'git',
      [
        'log',
        branch,
        '--not',
        trunk,
        '--name-only',
        '--format=',
        '--diff-filter=ACDMR',
      ],
      { cwd: repoPath, encoding: 'utf8' }
    );
    paths = out.split('\n').filter(Boolean);
  } catch {
    return 0;
  }
  const layers = new Set<string>();
  for (const p of paths) {
    const withSlash = '/' + p;
    for (const { name, patterns } of LAYER_PATTERNS) {
      if (patterns.test(withSlash)) {
        layers.add(name);
        break;
      }
    }
  }
  return layers.size;
}

export function detectVerticalDelivery(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const branches = listFeatureBranches(repoPath);

  if (branches.length === 0) {
    return makeResult(
      'SKIP',
      null,
      ['no feature branches found — vertical delivery ratio not computable'],
      'computed'
    );
  }

  const trunk = detectTrunk(repoPath);
  const verticalBranches: string[] = [];
  const singleLayerBranches: string[] = [];

  for (const branch of branches) {
    const layerCount = branchLayerCount(repoPath, branch, trunk);
    if (layerCount >= 2) {
      verticalBranches.push(branch);
    } else {
      singleLayerBranches.push(branch);
    }
  }

  const total = branches.length;
  const ratio = Math.round((verticalBranches.length / total) * 1e10) / 1e10;

  const evidence = [
    `${verticalBranches.length}/${total} feature branches touch ≥ 2 layers (ratio: ${Math.round(ratio * 100)}%)`,
    ...verticalBranches.slice(0, 10).map((b) => `vertical branch: ${b}`),
    ...singleLayerBranches.slice(0, 5).map((b) => `single-layer branch: ${b}`),
  ];

  if (ratio >= 0.5) {
    return makeResult(
      'PASS',
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches touch multiple layers (threshold: 50%)`,
        ...evidence,
      ],
      'computed'
    );
  }

  if (ratio >= 0.25) {
    return makeResult(
      'WARN',
      ratio,
      [
        `only ${Math.round(ratio * 100)}% of feature branches touch multiple layers (below 50%)`,
        ...evidence,
      ],
      'computed'
    );
  }

  return makeResult(
    'FAIL',
    ratio,
    [
      `only ${Math.round(ratio * 100)}% of feature branches touch multiple layers (threshold: 50%)`,
      ...evidence,
    ],
    'computed'
  );
}

// ---------------------------------------------------------------------------
// detectNoLayerSplit — category 2301 (E2E-02, method: detected)
//
// applies_when: topology.is_monorepo
//
// Detects whether git branches are split by layer — e.g. paired
// `feat/auth-backend` + `feat/auth-frontend` patterns. This anti-pattern
// indicates work is not being delivered end-to-end in a single branch.
//
// PASS  if no paired layer-split branch patterns detected.
// WARN  if 1-2 paired patterns detected.
// FAIL  if 3+ paired patterns detected.
// SKIP  if no git branches available.
// ---------------------------------------------------------------------------

const BACKEND_RX = /-backend$|[-_]api$|[-_]server$/i;
const FRONTEND_RX = /-frontend$|[-_]ui$|[-_]client$|[-_]web$/i;

function stripLayerSuffix(name: string): string {
  return name
    .replace(
      /-backend$|-frontend$|[-_]api$|[-_]server$|[-_]ui$|[-_]client$|[-_]web$/i,
      ''
    )
    .toLowerCase();
}

export function detectNoLayerSplit(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  let branches: string[];
  try {
    const out = execFileSync('git', ['branch', '--format=%(refname:short)'], {
      cwd: repoPath,
      encoding: 'utf8',
    });
    branches = out
      .split('\n')
      .map((b) => b.trim())
      .filter((b) => b.length > 0 && !TRUNK_NAMES.has(b));
  } catch {
    return makeResult('SKIP', null, [
      'no git branches available — layer-split detection skipped',
    ]);
  }

  if (branches.length === 0) {
    return makeResult('SKIP', null, [
      'no feature branches found — layer-split detection skipped',
    ]);
  }

  const backendBranches = branches.filter((b) => BACKEND_RX.test(b));
  const frontendBranches = branches.filter((b) => FRONTEND_RX.test(b));

  const pairedRoots: string[] = [];
  for (const b of backendBranches) {
    const root = stripLayerSuffix(b);
    const hasFrontendPair = frontendBranches.some(
      (f) => stripLayerSuffix(f) === root
    );
    if (hasFrontendPair) {
      pairedRoots.push(root);
    }
  }

  if (pairedRoots.length === 0) {
    return makeResult('PASS', 0, [
      'no paired backend/frontend branch split patterns detected',
      `${branches.length} feature branch(es) inspected`,
    ]);
  }

  const evidence = [
    `${pairedRoots.length} paired layer-split branch pattern(s) detected`,
    ...pairedRoots.slice(0, 10).map((r) => `split pattern root: ${r}`),
  ];

  if (pairedRoots.length >= 3) {
    return makeResult('FAIL', pairedRoots.length, [
      `${pairedRoots.length} feature(s) split into separate backend/frontend branches — vertical delivery anti-pattern`,
      ...evidence,
    ]);
  }

  return makeResult('WARN', pairedRoots.length, [
    `${pairedRoots.length} feature(s) split into separate backend/frontend branches`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectBidirectionalLinks — category 2302 (E2E-03, method: detected)
//
// Checks that spec files reference implementation paths and that implementation
// files reference spec directories. Both sides must be satisfied for PASS.
//
// Algorithm:
//   1. Scan context/spec/**/*.md for mentions of source paths (src/, app/, lib/).
//   2. Scan source files (*.ts, *.py, *.js, *.go, *.java) for mentions of
//      "context/spec/" or "spec/" followed by a NNN-pattern directory.
//
// PASS  if both spec→impl and impl→spec links are found.
// WARN  if only one direction is found.
// FAIL  if neither direction is found, or no spec dir exists.
// ---------------------------------------------------------------------------

const IMPL_PATH_RX = /\b(src|app|lib|packages?)\//i;
const SPEC_REF_RX = /context\/spec\/\d{3}-|(?<!\/)spec\/\d{3}-/;

export function detectBidirectionalLinks(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const specBase = join(repoPath, 'context', 'spec');
  if (!existsSync(specBase)) {
    return makeResult('FAIL', 0, [
      'no context/spec/ directory found — spec↔impl bidirectional links not possible',
    ]);
  }

  // Collect spec markdown files
  let specFiles: string[] = [];
  try {
    specFiles = iterFiles(specBase, ['*.md']);
  } catch {
    specFiles = [];
  }

  if (specFiles.length === 0) {
    return makeResult('FAIL', 0, [
      'no spec markdown files found — bidirectional links not detectable',
    ]);
  }

  // Check spec→impl: any spec file references an impl path
  let specRefsImpl = false;
  const specImplEvidence: string[] = [];
  for (const f of specFiles) {
    let content: string;
    try {
      content = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (IMPL_PATH_RX.test(content)) {
      specRefsImpl = true;
      specImplEvidence.push(`spec→impl reference in: ${relative(repoPath, f)}`);
      if (specImplEvidence.length >= 3) break;
    }
  }

  // Check impl→spec: any source file references context/spec/
  const SOURCE_GLOBS = [
    '*.ts',
    '*.tsx',
    '*.js',
    '*.jsx',
    '*.py',
    '*.go',
    '*.java',
    '*.kt',
  ];
  let implRefsSpec = false;
  const implSpecEvidence: string[] = [];

  let sourceFiles: string[] = [];
  try {
    sourceFiles = iterFiles(repoPath, SOURCE_GLOBS);
  } catch {
    sourceFiles = [];
  }

  for (const f of sourceFiles) {
    let content: string;
    try {
      content = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (SPEC_REF_RX.test(content)) {
      implRefsSpec = true;
      implSpecEvidence.push(`impl→spec reference in: ${relative(repoPath, f)}`);
      if (implSpecEvidence.length >= 3) break;
    }
  }

  const evidence = [...specImplEvidence, ...implSpecEvidence];

  if (specRefsImpl && implRefsSpec) {
    return makeResult('PASS', 2, [
      'bidirectional spec↔impl cross-references detected',
      ...evidence,
    ]);
  }

  if (specRefsImpl || implRefsSpec) {
    return makeResult('WARN', 1, [
      'only one direction of spec↔impl cross-references found',
      specRefsImpl
        ? 'spec files reference implementation paths'
        : 'no spec files reference implementation paths',
      implRefsSpec
        ? 'implementation files reference spec directories'
        : 'no implementation files reference spec directories',
      ...evidence,
    ]);
  }

  return makeResult('FAIL', 0, [
    'no bidirectional spec↔impl cross-references found',
    `${specFiles.length} spec file(s) found but none reference implementation paths`,
    `${sourceFiles.length} source file(s) found but none reference context/spec/`,
  ]);
}

// ---------------------------------------------------------------------------
// detectLayerCoverage — category 2303 (E2E-04, method: detected)
//
// applies_when: topology.has_multiple_layers
//
// Checks that: API definitions have corresponding UI consumers, and DB schemas
// have corresponding API layers. Uses directory presence as the signal.
//
// Layer presence signals:
//   API    — api/, routes/, server/, backend/, controllers/, handlers/ dirs
//   UI     — frontend/, ui/, web/, client/ dirs OR *.tsx/*.jsx files
//   DB     — *.sql files, migrations/ dir, schema.prisma, models/ dir
//
// PASS  if all 3 layers present.
// WARN  if 2 of 3 layers present.
// SKIP  if fewer than 2 layers detected (single-layer project).
// FAIL  should not normally occur — but is reserved for API present without UI.
// ---------------------------------------------------------------------------

const API_DIRS = [
  'api',
  'routes',
  'server',
  'backend',
  'controllers',
  'handlers',
  'endpoints',
];
const UI_DIRS = ['frontend', 'ui', 'web', 'client'];
const DB_FILES_GLOBS = ['*.sql', 'schema.prisma', '*.prisma'];
const DB_DIRS = ['migrations', 'db', 'database', 'models'];

function hasAnyDir(repoPath: string, dirs: string[]): string | null {
  for (const d of dirs) {
    if (
      existsSync(join(repoPath, d)) &&
      statSync(join(repoPath, d)).isDirectory()
    ) {
      return d;
    }
  }
  return null;
}

export function detectLayerCoverage(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  // API layer
  const apiDir = hasAnyDir(repoPath, API_DIRS);
  const hasApi = apiDir !== null;

  // UI layer — check dirs first, then file extensions
  const uiDir = hasAnyDir(repoPath, UI_DIRS);
  let hasUi = uiDir !== null;
  let uiSignal = uiDir ? `directory: ${uiDir}/` : null;
  if (!hasUi) {
    let uiFiles: string[] = [];
    try {
      uiFiles = iterFiles(repoPath, ['*.tsx', '*.jsx']);
    } catch {
      uiFiles = [];
    }
    if (uiFiles.length > 0) {
      hasUi = true;
      uiSignal = `${uiFiles.length} .tsx/.jsx file(s)`;
    }
  }

  // DB layer — check dirs then files
  const dbDir = hasAnyDir(repoPath, DB_DIRS);
  let hasDb = dbDir !== null;
  let dbSignal = dbDir ? `directory: ${dbDir}/` : null;
  if (!hasDb) {
    let dbFiles: string[] = [];
    try {
      dbFiles = iterFiles(repoPath, DB_FILES_GLOBS);
    } catch {
      dbFiles = [];
    }
    if (dbFiles.length > 0) {
      hasDb = true;
      dbSignal = `${dbFiles.length} schema/SQL file(s)`;
    }
  }

  const layerCount = [hasApi, hasUi, hasDb].filter(Boolean).length;

  if (layerCount < 2) {
    return makeResult('SKIP', layerCount, [
      'fewer than 2 distinct layers detected — single-layer project, E2E-04 not applicable',
      hasApi ? `API layer: ${apiDir}/` : 'API layer: not detected',
      hasUi ? `UI layer: ${uiSignal}` : 'UI layer: not detected',
      hasDb ? `DB layer: ${dbSignal}` : 'DB layer: not detected',
    ]);
  }

  const evidence = [
    hasApi ? `API layer: ${apiDir}/` : 'API layer: not detected',
    hasUi ? `UI layer: ${uiSignal}` : 'UI layer: not detected',
    hasDb ? `DB layer: ${dbSignal}` : 'DB layer: not detected',
  ];

  if (layerCount === 3) {
    return makeResult('PASS', layerCount, [
      'API, UI, and DB layers all detected — full vertical coverage',
      ...evidence,
    ]);
  }

  // 2 of 3 layers
  return makeResult('WARN', layerCount, [
    `only ${layerCount} of 3 layers detected — partial vertical coverage`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectCrossLayerTooling — category 2304 (E2E-05, method: detected)
//
// applies_when: topology.is_monorepo
//
// Checks for cross-layer unified tooling that enables full-stack development:
//   - Makefile at repo root
//   - docker-compose.yml or docker-compose.yaml at repo root
//   - CI workflow files (.github/workflows/, .gitlab-ci.yml, .circleci/, etc.)
//   - Taskfile.yml/yaml, justfile
//
// PASS  if any cross-layer tooling found.
// FAIL  if none found.
// ---------------------------------------------------------------------------

const ROOT_TOOLING_FILES = [
  'Makefile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Taskfile.yml',
  'Taskfile.yaml',
  'justfile',
  'Justfile',
  '.gitlab-ci.yml',
  '.gitlab-ci.yaml',
];

const CI_DIRS = ['.github/workflows', '.circleci', '.buildkite', '.drone'];

export function detectCrossLayerTooling(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const found: string[] = [];

  // Check root-level tooling files
  for (const f of ROOT_TOOLING_FILES) {
    if (existsSync(join(repoPath, f))) {
      found.push(f);
    }
  }

  // Check CI directories for any YAML files
  for (const ciDir of CI_DIRS) {
    const ciDirPath = join(repoPath, ciDir);
    if (!existsSync(ciDirPath)) continue;
    let ciFiles: string[] = [];
    try {
      ciFiles = iterFiles(ciDirPath, ['*.yml', '*.yaml']);
    } catch {
      ciFiles = [];
    }
    if (ciFiles.length > 0) {
      found.push(`${ciDir}/ (${ciFiles.length} workflow file(s))`);
    }
  }

  if (found.length > 0) {
    return makeResult('PASS', found.length, [
      `cross-layer tooling found: ${found.join(', ')}`,
      ...found.map((f) => `tooling: ${f}`),
    ]);
  }

  return makeResult('FAIL', 0, [
    'no cross-layer tooling found — no Makefile, docker-compose, or shared CI config at repo root',
  ]);
}

// ---------------------------------------------------------------------------
// DETECTORS — maps each end-to-end-delivery code to its function.
// All 5 E2E checks are detected/computed — none are judgment.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  2300: detectVerticalDelivery, // E2E-01 vertical delivery (computed)
  2301: detectNoLayerSplit, // E2E-02 no paired layer-split branches
  2302: detectBidirectionalLinks, // E2E-03 spec↔impl bidirectional links
  2303: detectLayerCoverage, // E2E-04 API + UI + DB layer coverage
  2304: detectCrossLayerTooling, // E2E-05 cross-layer unified tooling
};
