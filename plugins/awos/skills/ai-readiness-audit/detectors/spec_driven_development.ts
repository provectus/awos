import { makeResult, iterFiles } from './_base.ts';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// detectAwosInstalled — category 2800 (SDD-01, method: detected)
//
// PASS if both .awos/ and context/ directories exist.
// WARN if only one is present.
// FAIL if neither is present.
// ---------------------------------------------------------------------------

export function detectAwosInstalled(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const hasAwos = existsSync(join(repoPath, '.awos'));
  const hasContext = existsSync(join(repoPath, 'context'));

  if (hasAwos && hasContext) {
    return makeResult('PASS', 2, [
      '.awos/ directory present — AWOS framework installed',
      'context/ directory present — spec workspace initialised',
    ]);
  }

  if (hasAwos) {
    return makeResult('WARN', 1, [
      '.awos/ directory present but context/ is missing — AWOS installed but workspace not initialised',
    ]);
  }

  if (hasContext) {
    return makeResult('WARN', 1, [
      'context/ directory present but .awos/ is missing — workspace exists but AWOS framework not installed',
    ]);
  }

  return makeResult('FAIL', 0, [
    'neither .awos/ nor context/ found — AWOS framework is not installed',
  ]);
}

// ---------------------------------------------------------------------------
// detectProductContextDocs — category 2801 (SDD-02, method: detected)
//
// Checks for the three foundational AWOS documents:
//   context/product/product-definition.md
//   context/product/roadmap.md
//   context/architecture/architecture.md  OR  context/product/architecture.md
//
// A document is "substantive" if it has more than 5 lines of non-blank content.
//
// PASS if 3 substantive docs found.
// WARN if 2 substantive docs found.
// FAIL if fewer than 2 found.
// ---------------------------------------------------------------------------

const MIN_SUBSTANTIVE_LINES = 5;

function isSubstantive(filePath: string): boolean {
  try {
    const content = readFileSync(filePath, 'utf8');
    const nonBlankLines = content
      .split('\n')
      .filter((l) => l.trim().length > 0);
    return nonBlankLines.length > MIN_SUBSTANTIVE_LINES;
  } catch {
    return false;
  }
}

const FOUNDATIONAL_DOC_CANDIDATES = [
  ['context/product/product-definition.md'],
  ['context/product/roadmap.md'],
  ['context/architecture/architecture.md', 'context/product/architecture.md'],
];

export function detectProductContextDocs(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const found: string[] = [];
  const missing: string[] = [];

  for (const candidates of FOUNDATIONAL_DOC_CANDIDATES) {
    let matched = false;
    for (const candidate of candidates) {
      const fullPath = join(repoPath, candidate);
      if (existsSync(fullPath) && isSubstantive(fullPath)) {
        found.push(candidate);
        matched = true;
        break;
      }
    }
    if (!matched) {
      missing.push(candidates[0]);
    }
  }

  const count = found.length;
  const evidence = [
    ...found.map((f) => `present and substantive: ${f}`),
    ...missing.map((m) => `missing or trivial: ${m}`),
  ];

  if (count === 3) {
    return makeResult('PASS', count, [
      'all 3 foundational AWOS documents present with substantive content',
      ...evidence,
    ]);
  }

  if (count === 2) {
    return makeResult('WARN', count, [
      '2 of 3 foundational AWOS documents present',
      ...evidence,
    ]);
  }

  return makeResult('FAIL', count, [
    `only ${count} of 3 foundational AWOS documents present`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectArchTechMatch — category 2802 (SDD-03, method: detected)
//
// Reads the architecture document and extracts technology mentions, then
// checks whether each mentioned technology is evidenced in the codebase.
//
// Tech → evidence mapping (file extensions / config files):
//   TypeScript → *.ts, *.tsx, tsconfig.json
//   Python     → *.py
//   Django     → *.py in a django-looking project (settings.py, urls.py, manage.py)
//   React      → *.tsx, *.jsx, package.json containing "react"
//   PostgreSQL  → *.sql, any file mentioning "psycopg2" or "pg"
//   Node       → package.json, *.js
//   Go         → *.go
//   Java       → *.java
//   Docker     → Dockerfile, docker-compose.yml
//   Terraform  → *.tf
//   Kubernetes → *.yaml in k8s/ or kube/, *.yml containing "apiVersion:"
//
// PASS if ≤ 0 unverified mentions OR no architecture document.
// WARN if 1-2 unverified mentions.
// FAIL if 3+ unverified mentions.
// ---------------------------------------------------------------------------

interface TechSignal {
  name: string;
  // Returns true if the technology is evidenced in repoPath
  detect: (repoPath: string) => boolean;
}

const TECH_SIGNALS: TechSignal[] = [
  {
    name: 'typescript',
    detect: (r) => iterFiles(r, ['*.ts', '*.tsx', 'tsconfig.json']).length > 0,
  },
  {
    name: 'python',
    detect: (r) => iterFiles(r, ['*.py']).length > 0,
  },
  {
    name: 'django',
    detect: (r) =>
      iterFiles(r, ['manage.py', 'settings.py', 'urls.py']).length > 0,
  },
  {
    name: 'react',
    detect: (r) =>
      iterFiles(r, ['*.tsx', '*.jsx']).length > 0 ||
      (() => {
        const pkg = join(r, 'package.json');
        if (!existsSync(pkg)) return false;
        try {
          return readFileSync(pkg, 'utf8').includes('"react"');
        } catch {
          return false;
        }
      })(),
  },
  {
    name: 'node',
    detect: (r) =>
      existsSync(join(r, 'package.json')) || iterFiles(r, ['*.js']).length > 0,
  },
  {
    name: 'javascript',
    detect: (r) => iterFiles(r, ['*.js', '*.jsx']).length > 0,
  },
  {
    name: 'postgresql',
    detect: (r) =>
      iterFiles(r, ['*.sql']).length > 0 ||
      (() => {
        try {
          const out = execFileSync(
            'grep',
            [
              '-rl',
              '--include=*.py',
              '--include=*.ts',
              '--include=*.js',
              'psycopg2',
              r,
            ],
            { encoding: 'utf8' }
          );
          return out.trim().length > 0;
        } catch {
          return false;
        }
      })(),
  },
  {
    name: 'postgres',
    detect: (r) =>
      iterFiles(r, ['*.sql']).length > 0 ||
      (() => {
        try {
          const out = execFileSync(
            'grep',
            [
              '-rl',
              '--include=*.py',
              '--include=*.ts',
              '--include=*.js',
              'psycopg',
              r,
            ],
            { encoding: 'utf8' }
          );
          return out.trim().length > 0;
        } catch {
          return false;
        }
      })(),
  },
  {
    name: 'go',
    detect: (r) => iterFiles(r, ['*.go', 'go.mod']).length > 0,
  },
  {
    name: 'java',
    detect: (r) => iterFiles(r, ['*.java']).length > 0,
  },
  {
    name: 'docker',
    detect: (r) =>
      iterFiles(r, ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'])
        .length > 0,
  },
  {
    name: 'terraform',
    detect: (r) => iterFiles(r, ['*.tf']).length > 0,
  },
  {
    name: 'kubernetes',
    detect: (r) => {
      try {
        const out = execFileSync(
          'grep',
          ['-rl', '--include=*.yaml', '--include=*.yml', 'apiVersion:', r],
          { encoding: 'utf8' }
        );
        return out.trim().length > 0;
      } catch {
        return false;
      }
    },
  },
];

function findArchDoc(repoPath: string): string | null {
  for (const candidate of [
    join(repoPath, 'context', 'architecture', 'architecture.md'),
    join(repoPath, 'context', 'product', 'architecture.md'),
    join(repoPath, 'ARCHITECTURE.md'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function detectArchTechMatch(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const archDoc = findArchDoc(repoPath);
  if (!archDoc) {
    return makeResult('PASS', 0, [
      'no architecture document found — tech-match check skipped',
    ]);
  }

  let content: string;
  try {
    content = readFileSync(archDoc, 'utf8').toLowerCase();
  } catch {
    return makeResult('PASS', 0, ['could not read architecture document']);
  }

  const unverified: string[] = [];
  const verified: string[] = [];

  for (const signal of TECH_SIGNALS) {
    if (!content.includes(signal.name.toLowerCase())) continue;
    if (signal.detect(repoPath)) {
      verified.push(signal.name);
    } else {
      unverified.push(signal.name);
    }
  }

  const evidence = [
    `architecture document: ${relative(repoPath, archDoc)}`,
    ...verified.map((t) => `verified in codebase: ${t}`),
    ...unverified.map((t) => `mentioned but not evidenced in codebase: ${t}`),
  ];

  if (unverified.length >= 3) {
    return makeResult('FAIL', unverified.length, [
      `${unverified.length} technology mention(s) in architecture doc not evidenced in codebase`,
      ...evidence,
    ]);
  }

  if (unverified.length >= 1) {
    return makeResult('WARN', unverified.length, [
      `${unverified.length} technology mention(s) in architecture doc not evidenced in codebase`,
      ...evidence,
    ]);
  }

  return makeResult('PASS', 0, [
    'all technology mentions in architecture doc are evidenced in the codebase',
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectBranchSpecRatio — category 2803 (SDD-04, method: computed)
//
// THE DETERMINISM FIX: computes branch→spec ratio via git log.
//
// Algorithm:
//   1. List all local branches except main/master/develop.
//   2. Detect the actual trunk (main → master → develop → development).
//   3. For each branch, run: git log <branch> --not <trunk> --name-only --format=""
//      and check if any changed path starts with "context/spec/".
//   4. ratio = branches_touching_spec / total_feature_branches
//
// PASS  if ratio >= 0.70
// WARN  if 0.40 <= ratio < 0.70
// FAIL  if ratio < 0.40
// SKIP  if no feature branches found
// ---------------------------------------------------------------------------

const TRUNK_BRANCHES = new Set(['main', 'master', 'develop', 'development']);

/** Detect the actual trunk branch by probing common names in order. */
function detectTrunk(repoPath: string): string {
  for (const candidate of ['main', 'master', 'develop', 'development']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', candidate], {
        cwd: repoPath,
        encoding: 'utf8',
      });
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return 'main'; // fallback — no exclusion will apply if branch absent
}

function listLocalBranches(repoPath: string): string[] {
  try {
    const out = execFileSync('git', ['branch', '--format=%(refname:short)'], {
      cwd: repoPath,
      encoding: 'utf8',
    });
    return out
      .split('\n')
      .map((b) => b.trim())
      .filter((b) => b.length > 0 && !TRUNK_BRANCHES.has(b));
  } catch {
    return [];
  }
}

function branchTouchedSpec(
  repoPath: string,
  branch: string,
  trunk: string
): boolean {
  try {
    // Get all file paths changed in commits on this branch (not on trunk)
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
    return out.split('\n').some((line) => line.startsWith('context/spec/'));
  } catch {
    return false;
  }
}

export function detectBranchSpecRatio(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const branches = listLocalBranches(repoPath);

  if (branches.length === 0) {
    return makeResult(
      'SKIP',
      null,
      ['no feature branches found — branch→spec ratio not computable'],
      'computed'
    );
  }

  const trunk = detectTrunk(repoPath);
  const specBranches: string[] = [];
  const plainBranches: string[] = [];

  for (const branch of branches) {
    if (branchTouchedSpec(repoPath, branch, trunk)) {
      specBranches.push(branch);
    } else {
      plainBranches.push(branch);
    }
  }

  const total = branches.length;
  // Rounded to 10 decimal places for floating-point stability
  const ratio = Math.round((specBranches.length / total) * 1e10) / 1e10;

  const evidence = [
    `${specBranches.length}/${total} feature branches touched context/spec/ (ratio: ${Math.round(ratio * 100)}%)`,
    ...specBranches.slice(0, 10).map((b) => `spec branch: ${b}`),
    ...plainBranches.slice(0, 10).map((b) => `plain branch: ${b}`),
  ];

  if (ratio >= 0.7) {
    return makeResult(
      'PASS',
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches used spec workflow (threshold: 70%)`,
        ...evidence,
      ],
      'computed'
    );
  }

  if (ratio >= 0.4) {
    return makeResult(
      'WARN',
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches used spec workflow (below 70% threshold)`,
        ...evidence,
      ],
      'computed'
    );
  }

  return makeResult(
    'FAIL',
    ratio,
    [
      `only ${Math.round(ratio * 100)}% of feature branches used spec workflow (threshold: 70%)`,
      ...evidence,
    ],
    'computed'
  );
}

// ---------------------------------------------------------------------------
// detectSpecTriadComplete — category 2804 (SDD-05, method: detected)
//
// Checks every context/spec/NNN-* directory for the spec triad:
//   functional-spec.md, technical-considerations.md, tasks.md
//
// PASS if all spec dirs have all 3 files (or no spec dirs found).
// WARN if some dirs have 1-2 of 3 (incomplete but not empty).
// FAIL if any dir has 0 of the 3 files.
// ---------------------------------------------------------------------------

const SPEC_TRIAD = [
  'functional-spec.md',
  'technical-considerations.md',
  'tasks.md',
];

function listSpecDirs(repoPath: string): string[] {
  const specBase = join(repoPath, 'context', 'spec');
  if (!existsSync(specBase)) return [];
  try {
    return readdirSync(specBase)
      .filter((name) => /^\d{3}-/.test(name))
      .sort()
      .map((name) => join(specBase, name))
      .filter((p) => {
        try {
          return statSync(p).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

interface SpecDirStatus {
  dir: string;
  present: string[];
  missing: string[];
}

export function detectSpecTriadComplete(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const specDirs = listSpecDirs(repoPath);

  if (specDirs.length === 0) {
    return makeResult('PASS', 0, [
      'no spec directories found — triad check skipped',
    ]);
  }

  const statuses: SpecDirStatus[] = [];

  for (const dir of specDirs) {
    const present = SPEC_TRIAD.filter((f) => existsSync(join(dir, f)));
    const missing = SPEC_TRIAD.filter((f) => !existsSync(join(dir, f)));
    statuses.push({ dir: relative(repoPath, dir), present, missing });
  }

  const empty = statuses.filter((s) => s.present.length === 0);
  const incomplete = statuses.filter(
    (s) => s.present.length > 0 && s.missing.length > 0
  );
  const complete = statuses.filter((s) => s.missing.length === 0);

  const evidence = [
    `${complete.length}/${specDirs.length} spec dirs have all 3 files`,
    ...incomplete.map(
      (s) => `incomplete: ${s.dir} — missing: ${s.missing.join(', ')}`
    ),
    ...empty.map((s) => `empty: ${s.dir} — has none of the 3 required files`),
  ];

  if (empty.length > 0) {
    return makeResult('FAIL', empty.length, [
      `${empty.length} spec dir(s) have none of the 3 required files`,
      ...evidence,
    ]);
  }

  if (incomplete.length > 0) {
    return makeResult('WARN', incomplete.length, [
      `${incomplete.length} spec dir(s) are incomplete (have some but not all 3 files)`,
      ...evidence,
    ]);
  }

  return makeResult('PASS', specDirs.length, [
    `all ${specDirs.length} spec dir(s) have the complete triad`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectStaleSpecs — category 2805 (SDD-06, method: detected)
//
// A spec is "stale" if its tasks.md exists but contains no task lines
// (empty stub that was never filled in).
//
// A spec is "active" if tasks.md has unchecked tasks ([ ]).
// A spec is "done" if all tasks in tasks.md are checked ([x]/[X]).
// Both active and done are PASS states.
//
// PASS if no stale specs.
// WARN if 1 stale spec.
// FAIL if 2+ stale specs.
// ---------------------------------------------------------------------------

const TASK_LINE_RX = /^\s*-\s*\[[ xX]\]/m;
const UNCHECKED_RX = /^\s*-\s*\[ \]/m;

export function detectStaleSpecs(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const specDirs = listSpecDirs(repoPath);

  if (specDirs.length === 0) {
    return makeResult('PASS', 0, [
      'no spec directories found — stale-spec check skipped',
    ]);
  }

  const stale: string[] = [];
  const active: string[] = [];
  const done: string[] = [];

  for (const dir of specDirs) {
    const tasksPath = join(dir, 'tasks.md');
    if (!existsSync(tasksPath)) continue;

    let content: string;
    try {
      content = readFileSync(tasksPath, 'utf8');
    } catch {
      continue;
    }

    const hasTasks = TASK_LINE_RX.test(content);
    if (!hasTasks) {
      // tasks.md exists but has no task items → stale
      stale.push(relative(repoPath, dir));
    } else if (UNCHECKED_RX.test(content)) {
      active.push(relative(repoPath, dir));
    } else {
      done.push(relative(repoPath, dir));
    }
  }

  const evidence = [
    ...active.map((d) => `active (has open tasks): ${d}`),
    ...done.map((d) => `done (all tasks complete): ${d}`),
    ...stale.map((d) => `stale (tasks.md has no task items): ${d}`),
  ];

  if (stale.length === 0) {
    return makeResult('PASS', 0, ['no stale specs found', ...evidence]);
  }

  if (stale.length === 1) {
    return makeResult('WARN', stale.length, [
      `1 stale spec detected (tasks.md is an empty stub)`,
      ...evidence,
    ]);
  }

  return makeResult('FAIL', stale.length, [
    `${stale.length} stale specs detected (tasks.md empty stubs)`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectAgentAnnotations — category 2806 (SDD-07, method: detected)
//
// Scans all tasks.md files under context/spec/. Counts task checkbox lines
// (- [ ] / - [x]) and checks each for an **[Agent: name]** annotation.
//
// PASS  if >= 70% of task lines are annotated.
// WARN  if 40-69% annotated.
// FAIL  if < 40% annotated.
// SKIP  if no task lines found.
// ---------------------------------------------------------------------------

const TASK_CHECKBOX_RX = /^\s*-\s*\[[ xX]\]/;
const AGENT_ANNOTATION_RX = /\*\*\[Agent:\s*[^\]]+\]\*\*/;

export function detectAgentAnnotations(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const specDirs = listSpecDirs(repoPath);

  let totalTasks = 0;
  let annotatedTasks = 0;

  for (const dir of specDirs) {
    const tasksPath = join(dir, 'tasks.md');
    if (!existsSync(tasksPath)) continue;

    let content: string;
    try {
      content = readFileSync(tasksPath, 'utf8');
    } catch {
      continue;
    }

    for (const line of content.split('\n')) {
      if (TASK_CHECKBOX_RX.test(line)) {
        totalTasks++;
        if (AGENT_ANNOTATION_RX.test(line)) {
          annotatedTasks++;
        }
      }
    }
  }

  if (totalTasks === 0) {
    return makeResult('SKIP', null, [
      'no task checkbox lines found in any tasks.md — agent-annotation check skipped',
    ]);
  }

  const ratio = Math.round((annotatedTasks / totalTasks) * 1e10) / 1e10;
  const evidence = [
    `${annotatedTasks}/${totalTasks} task lines have **[Agent: ...]** annotations (${Math.round(ratio * 100)}%)`,
  ];

  if (ratio >= 0.7) {
    return makeResult('PASS', ratio, [
      `${Math.round(ratio * 100)}% of tasks annotated with agent assignments (threshold: 70%)`,
      ...evidence,
    ]);
  }

  if (ratio >= 0.4) {
    return makeResult('WARN', ratio, [
      `only ${Math.round(ratio * 100)}% of tasks annotated with agent assignments (below 70%)`,
      ...evidence,
    ]);
  }

  return makeResult('FAIL', ratio, [
    `only ${Math.round(ratio * 100)}% of tasks annotated with agent assignments (threshold: 70%)`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// DETECTORS — maps each spec-driven-development code to its function.
// All 7 SDD checks are detected/computed — none are judgment.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  2800: detectAwosInstalled, // SDD-01 AWOS installed
  2801: detectProductContextDocs, // SDD-02 foundational product docs
  2802: detectArchTechMatch, // SDD-03 tech choices match codebase
  2803: detectBranchSpecRatio, // SDD-04 branch→spec ratio (computed)
  2804: detectSpecTriadComplete, // SDD-05 spec triad completeness
  2805: detectStaleSpecs, // SDD-06 no stale specs
  2806: detectAgentAnnotations, // SDD-07 agent annotations in tasks.md
};
