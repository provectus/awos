import { makeResult, iterFiles, readTextSafe } from './_base.ts';
import { existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { CI_CONFIG_CANDIDATES } from '../ci_platforms.ts';
import { ALL_SOURCE_GLOBS } from '../languages.ts';

// ---------------------------------------------------------------------------
// detectVerticalDelivery — category 2300 (SBP-09, method: computed)
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

const TRUNK_NAMES = new Set([
  'main',
  'master',
  'develop',
  'development',
  'dev',
  'prod',
  'trunk',
]);

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

// ---------------------------------------------------------------------------
// Shared layer-presence helper — used by detectVerticalDelivery and
// detectLayerCoverage to avoid duplicating the detection logic.
// ---------------------------------------------------------------------------

const API_LAYER_DIRS = [
  'api',
  'routes',
  'server',
  'backend',
  'controllers',
  'handlers',
  'endpoints',
];
const UI_LAYER_DIRS = ['frontend', 'ui', 'web', 'client'];
const DB_LAYER_DIRS = ['migrations', 'db', 'database', 'models'];
const DB_LAYER_FILE_GLOBS = ['*.sql', 'schema.prisma', '*.prisma'];

function detectedLayers(repoPath: string): {
  hasApi: boolean;
  hasUi: boolean;
  hasDb: boolean;
} {
  const hasApi = API_LAYER_DIRS.some((d) => {
    const p = join(repoPath, d);
    return existsSync(p) && statSync(p).isDirectory();
  });

  const uiDir = UI_LAYER_DIRS.some((d) => {
    const p = join(repoPath, d);
    return existsSync(p) && statSync(p).isDirectory();
  });
  let hasUi = uiDir;
  if (!hasUi) {
    hasUi = iterFiles(repoPath, ['*.tsx', '*.jsx']).length > 0;
  }

  const dbDir = DB_LAYER_DIRS.some((d) => {
    const p = join(repoPath, d);
    return existsSync(p) && statSync(p).isDirectory();
  });
  let hasDb = dbDir;
  if (!hasDb) {
    hasDb = iterFiles(repoPath, DB_LAYER_FILE_GLOBS).length > 0;
  }

  return { hasApi, hasUi, hasDb };
}

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
    return (
      out
        .split('\n')
        .map((b) => b.trim())
        // On a detached HEAD `git branch` emits a pseudo-entry like
        // "(HEAD detached at abc1234)" — not a branch, filter it out.
        .filter(
          (b) => b.length > 0 && !b.startsWith('(') && !TRUNK_NAMES.has(b)
        )
    );
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

  // Gate: require at least 2 architectural layers before evaluating
  // vertical delivery (a single-layer repo cannot deliver vertically).
  const layers = detectedLayers(repoPath);
  const layerCount = [layers.hasApi, layers.hasUi, layers.hasDb].filter(
    Boolean
  ).length;
  if (layerCount < 2) {
    return makeResult(
      'SKIP',
      null,
      [
        'fewer than 2 architectural layers present — vertical delivery not applicable',
      ],
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
// detectBidirectionalLinks — category 2302 (DOC-07, method: detected)
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

const IMPL_PATH_RX = /(?:^|[^\w])(src|app|lib|packages?|cmd|internal|pkg)\//i;
const SPEC_REF_RX =
  /context\/spec\/\d{3}-|(?<!\/)spec\/\d{3}-|\.specify\/|openspec\/|specs?\/[\w-]+\/(spec|design|tasks)\.md/i;

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
  const specFiles = iterFiles(specBase, ['*.md']);

  if (specFiles.length === 0) {
    return makeResult('FAIL', 0, [
      'no spec markdown files found — bidirectional links not detectable',
    ]);
  }

  // Check spec→impl: any spec file references an impl path
  let specRefsImpl = false;
  const specImplEvidence: string[] = [];
  for (const f of specFiles) {
    const content = readTextSafe(f);
    if (content === null) continue;
    if (IMPL_PATH_RX.test(content)) {
      specRefsImpl = true;
      specImplEvidence.push(`spec→impl reference in: ${relative(repoPath, f)}`);
      if (specImplEvidence.length >= 3) break;
    }
  }

  // Check impl→spec: any source file references context/spec/
  const SOURCE_GLOBS = ALL_SOURCE_GLOBS;
  let implRefsSpec = false;
  const implSpecEvidence: string[] = [];

  const sourceFiles = iterFiles(repoPath, SOURCE_GLOBS);

  for (const f of sourceFiles) {
    const content = readTextSafe(f);
    if (content === null) continue;
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
// detectLayerCoverage — category 2303 (SBP-10, method: detected)
//
// applies_when: topology.has_multiple_layers
//
// Checks that: API definitions have corresponding UI consumers, and DB schemas
// have corresponding API layers. Uses the shared detectedLayers() helper.
//
// PASS  if all 3 layers present.
// WARN  if 2 of 3 layers present.
// SKIP  if fewer than 2 layers detected (single-layer project).
// ---------------------------------------------------------------------------

export function detectLayerCoverage(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const { hasApi, hasUi, hasDb } = detectedLayers(repoPath);

  // Determine a human-readable signal for each layer
  const apiSignal = hasApi
    ? API_LAYER_DIRS.find((d) => {
        const p = join(repoPath, d);
        return existsSync(p) && statSync(p).isDirectory();
      }) + '/'
    : null;

  const uiDirName = UI_LAYER_DIRS.find((d) => {
    const p = join(repoPath, d);
    return existsSync(p) && statSync(p).isDirectory();
  });
  let uiSignal: string | null = uiDirName ? `directory: ${uiDirName}/` : null;
  if (!uiSignal && hasUi) {
    const uiFiles = iterFiles(repoPath, ['*.tsx', '*.jsx']);
    uiSignal = `${uiFiles.length} .tsx/.jsx file(s)`;
  }

  const dbDirName = DB_LAYER_DIRS.find((d) => {
    const p = join(repoPath, d);
    return existsSync(p) && statSync(p).isDirectory();
  });
  let dbSignal: string | null = dbDirName ? `directory: ${dbDirName}/` : null;
  if (!dbSignal && hasDb) {
    const dbFiles = iterFiles(repoPath, DB_LAYER_FILE_GLOBS);
    dbSignal = `${dbFiles.length} schema/SQL file(s)`;
  }

  const layerCount = [hasApi, hasUi, hasDb].filter(Boolean).length;

  if (layerCount < 2) {
    return makeResult('SKIP', layerCount, [
      'fewer than 2 distinct layers detected — single-layer project, SBP-10 not applicable',
      hasApi ? `API layer: ${apiSignal}` : 'API layer: not detected',
      hasUi ? `UI layer: ${uiSignal}` : 'UI layer: not detected',
      hasDb ? `DB layer: ${dbSignal}` : 'DB layer: not detected',
    ]);
  }

  const evidence = [
    hasApi ? `API layer: ${apiSignal}` : 'API layer: not detected',
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
// detectCrossLayerTooling — category 2304 (ARCH-07, method: detected)
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
  'WORKSPACE',
  'WORKSPACE.bazel',
  'MODULE.bazel',
  'BUILD.bazel',
  'nx.json',
  'pants.toml',
  'turbo.json',
  'lerna.json',
  'pnpm-workspace.yaml',
];

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

  // Check CI candidates (dirs + single-file configs)
  for (const candidate of CI_CONFIG_CANDIDATES) {
    if (found.some((f) => f.startsWith(candidate))) continue; // already counted via ROOT_TOOLING_FILES
    const candidatePath = join(repoPath, candidate);
    if (!existsSync(candidatePath)) continue;
    const s = statSync(candidatePath);
    if (s.isDirectory()) {
      const ciFiles = iterFiles(candidatePath, [
        '*.yml',
        '*.yaml',
        'Jenkinsfile',
      ]);
      if (ciFiles.length > 0) {
        found.push(`${candidate}/ (${ciFiles.length} workflow file(s))`);
      }
    } else {
      found.push(`${candidate}`);
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
// E2E-02 (2301) was removed — name-based layer-split detection dropped.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  2300: detectVerticalDelivery, // SBP-09 vertical delivery (computed)
  // 2301 intentionally omitted — E2E-02 (name-based layer-split) removed
  2302: detectBidirectionalLinks, // DOC-07 spec↔impl bidirectional links
  2303: detectLayerCoverage, // SBP-10 API + UI + DB layer coverage
  2304: detectCrossLayerTooling, // ARCH-07 cross-layer unified tooling
};
