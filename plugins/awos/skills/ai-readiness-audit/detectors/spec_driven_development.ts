import {
  makeResult,
  iterFiles,
  readTextSafe,
  detectTrunk,
  probeRepoPath,
  inheritedNote,
  PathOrigin,
} from './_base.ts';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  isSquashMergeSubject,
  resolveTrunk,
  refArgs,
  FIX_SUBJECT_RX,
  REVERT_SUBJECT_RX,
} from '../collectors/git.ts';
import {
  detectSpecFrameworks,
  specRootsFor,
  SPEC_FRAMEWORKS,
  type SpecFramework,
} from '../spec_frameworks.ts';

// ---------------------------------------------------------------------------
// detectSpecWorkflowAdopted — category 2800 (SDD-01, method: detected)
//
// Whether the project practises spec-driven development at all, by any
// recognized convention. AWOS is one of them, not the definition of the check:
// a project with a disciplined ADR or design-doc practice is doing the thing
// this dimension measures and earns the credit.
//
// PASS when a recognized practice is adopted.
// WARN when a practice's marker exists but carries no records yet.
// FAIL when no design record of any kind is present.
// ---------------------------------------------------------------------------

export function detectSpecWorkflowAdopted(
  repoPath: string,
  params?: unknown
): ReturnType<typeof makeResult> {
  // AWOS keeps its original three-way semantics EXACTLY. Genericizing this
  // dimension is about no longer penalizing projects that never adopted AWOS
  // (issue #160); it must not silently move the score of a project that did.
  // The pinned regression test detectors/spec_driven_development_sdd01.test.ts
  // encodes those semantics — including the self-pollution guard (a bare
  // context/ holding only the audit's own context/audits/ output must FAIL) —
  // and it must stay green WITHOUT being edited.
  const awos = probeRepoPath(repoPath, params, '.awos');
  const product = probeRepoPath(repoPath, params, 'context/product');
  const spec = probeRepoPath(repoPath, params, 'context/spec');
  const workspace = product.path !== null ? product : spec;
  const awosOrigin =
    awos.origin === 'inherited' || workspace.origin === 'inherited'
      ? 'inherited'
      : 'own';

  if (awos.path !== null && workspace.path !== null) {
    return makeResult('PASS', 2, [
      inheritedNote(awosOrigin, '.awos/ directory found'),
      inheritedNote(
        awosOrigin,
        'context/product or context/spec directory found'
      ),
    ]);
  }
  if (awos.path !== null) {
    return makeResult('WARN', 1, [
      inheritedNote(
        awosOrigin,
        '.awos/ directory found; context/product and context/spec directories not found'
      ),
    ]);
  }
  if (workspace.path !== null) {
    return makeResult('WARN', 1, [
      inheritedNote(
        awosOrigin,
        'context/product or context/spec directory found; .awos/ directory not found'
      ),
    ]);
  }

  // No AWOS. This is the half issue #160 is about: credit any other
  // recognized practice instead of hard-failing the project for not being an
  // AWOS project.
  const others = detectSpecFrameworks(repoPath, params).filter(
    (f) => f.framework.id !== 'awos'
  );
  // Evidence must name the roots that actually exist, not every root the
  // framework could possibly use — an ADR-only repo's evidence naming
  // docs/rfcs, doc/adr, etc. as "in use" would send a reader looking for
  // paths that were never there. specRootsFor already tells us which
  // markers matched; thread that through instead of falling back to
  // framework.specRoots (the full declared list).
  const withRecords = others
    .map((f) => ({ ...f, roots: specRootsFor(repoPath, f.framework, params) }))
    .filter((f) => f.roots.length > 0);
  if (withRecords.length > 0) {
    return makeResult(
      'PASS',
      withRecords.length,
      withRecords.map((f) =>
        inheritedNote(
          f.origin,
          `${f.framework.label} in use (${f.roots.map((r) => r.rel).join(', ')})`
        )
      )
    );
  }
  if (others.length > 0) {
    return makeResult(
      'WARN',
      others.length,
      others.map((f) =>
        inheritedNote(
          f.origin,
          `${f.framework.label} is installed but holds no spec records yet`
        )
      )
    );
  }

  return makeResult('FAIL', 0, [
    `no spec-driven practice found — checked for ${SPEC_FRAMEWORKS.map((f) => f.label).join(', ')}`,
  ]);
}

// ---------------------------------------------------------------------------
// detectProductContextDocs — category 2801 (SDD-02, method: detected)
//
// Checks for the three foundational documents — product definition, roadmap,
// and architecture record — under AWOS filenames or conventional equivalents
// (see FOUNDATIONAL_DOC_CANDIDATES for each slot's candidate list).
//
// A document is "substantive" if it has more than 5 lines of non-blank content.
//
// PASS if 3 substantive docs found.
// WARN if 2 substantive docs found.
// FAIL if fewer than 2 found.
// ---------------------------------------------------------------------------

const MIN_SUBSTANTIVE_LINES = 5;

function isSubstantive(filePath: string): boolean {
  const content = readTextSafe(filePath);
  if (content === null) return false;
  const nonBlankLines = content.split('\n').filter((l) => l.trim().length > 0);
  return nonBlankLines.length > MIN_SUBSTANTIVE_LINES;
}

// Each inner array is one required slot; the first path present and
// substantive satisfies it. AWOS filenames come first because they are the
// most specific, but a project that documents the same three things under
// conventional names has the same capability. GSD's .planning/PROJECT.md and
// .planning/REQUIREMENTS.md land in the product-definition slot — both
// describe what the product is and needs, which is the closer fit; GSD has
// no equivalent of an architecture record, so nothing is added to that slot.
const FOUNDATIONAL_DOC_CANDIDATES = [
  [
    'context/product/product-definition.md',
    'context/product/product.md',
    'docs/product.md',
    'docs/product-definition.md',
    'PRODUCT.md',
    'docs/vision.md',
    '.planning/PROJECT.md',
    '.planning/REQUIREMENTS.md',
  ],
  [
    'context/product/roadmap.md',
    'docs/roadmap.md',
    'ROADMAP.md',
    'docs/milestones.md',
    '.planning/ROADMAP.md',
  ],
  [
    'context/architecture/architecture.md',
    'context/product/architecture.md',
    'docs/architecture.md',
    'ARCHITECTURE.md',
    'docs/adr/README.md',
    'docs/adr/index.md',
    'docs/decisions/README.md',
  ],
];

// One label per slot in FOUNDATIONAL_DOC_CANDIDATES, in the same order.
const FOUNDATIONAL_DOC_SLOT_LABELS = [
  'product definition',
  'roadmap',
  'architecture record',
];

export function detectProductContextDocs(
  repoPath: string,
  params?: unknown
): ReturnType<typeof makeResult> {
  const found: string[] = [];
  const missing: string[] = [];

  for (const [slot, candidates] of FOUNDATIONAL_DOC_CANDIDATES.entries()) {
    let matched = false;
    for (const candidate of candidates) {
      const probe = probeRepoPath(repoPath, params, candidate);
      if (probe.path !== null && isSubstantive(probe.path)) {
        found.push(
          probe.origin === 'inherited'
            ? `${candidate} (inherited from orchestration root)`
            : candidate
        );
        matched = true;
        break;
      }
    }
    if (!matched) {
      missing.push(
        `${FOUNDATIONAL_DOC_SLOT_LABELS[slot]} (looked for ${candidates.join(', ')})`
      );
    }
  }

  const count = found.length;
  const evidence = [
    ...found.map((f) => `present and substantive: ${f}`),
    ...missing.map((m) => `missing or trivial: ${m}`),
  ];

  if (count === 3) {
    return makeResult('PASS', count, [
      'all 3 foundational documents present with substantive content',
      ...evidence,
    ]);
  }

  if (count === 2) {
    return makeResult('WARN', count, [
      '2 of 3 foundational documents present',
      ...evidence,
    ]);
  }

  return makeResult('FAIL', count, [
    `only ${count} of 3 foundational documents present`,
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
//   IaC        → Terraform (*.tf), CloudFormation (*.template.* / AWSTemplateFormatVersion),
//                Bicep (*.bicep), ARM (azuredeploy.json), Pulumi (Pulumi.yaml), CDK (cdk.json),
//                Ansible (ansible.cfg / playbook.yml), Kustomize (kustomization.yaml),
//                Serverless (serverless.yml), Helm (Chart.yaml)
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
        const raw = readTextSafe(join(r, 'package.json'));
        return raw !== null && raw.includes('"react"');
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
    name: 'cloudformation',
    detect: (r) => {
      if (
        iterFiles(r, ['*.template.yaml', '*.template.yml', '*.template.json'])
          .length > 0
      )
        return true;
      try {
        return (
          execFileSync(
            'grep',
            [
              '-rl',
              '--include=*.yaml',
              '--include=*.yml',
              '--include=*.json',
              'AWSTemplateFormatVersion',
              r,
            ],
            { encoding: 'utf8' }
          ).trim().length > 0
        );
      } catch {
        return false;
      }
    },
  },
  { name: 'bicep', detect: (r) => iterFiles(r, ['*.bicep']).length > 0 },
  {
    name: 'arm',
    detect: (r) =>
      iterFiles(r, ['azuredeploy.json', 'azuredeploy.parameters.json']).length >
      0,
  },
  {
    name: 'pulumi',
    detect: (r) => iterFiles(r, ['Pulumi.yaml', 'Pulumi.yml']).length > 0,
  },
  { name: 'cdk', detect: (r) => iterFiles(r, ['cdk.json']).length > 0 },
  {
    name: 'ansible',
    detect: (r) =>
      iterFiles(r, ['ansible.cfg', 'playbook.yml', 'playbook.yaml', 'site.yml'])
        .length > 0,
  },
  {
    name: 'kustomize',
    detect: (r) =>
      iterFiles(r, ['kustomization.yaml', 'kustomization.yml']).length > 0,
  },
  {
    name: 'serverless',
    detect: (r) =>
      iterFiles(r, ['serverless.yml', 'serverless.yaml']).length > 0,
  },
  { name: 'helm', detect: (r) => iterFiles(r, ['Chart.yaml']).length > 0 },
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

// Short tech names that double as ordinary English words — "before we go
// live", "each node in the cluster", "arm the alarm", "a serverless design".
// A lowercase prose occurrence of these is NOT a technology mention; they
// only count with canonical capitalization (Go, Node, ARM, Serverless) or in
// inline-code (backtick) context.
const AMBIGUOUS_TECH_NAMES = new Set(['go', 'node', 'arm', 'serverless']);

function mentionsTech(content: string, name: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!AMBIGUOUS_TECH_NAMES.has(name)) {
    return new RegExp(`\\b${esc}\\b`, 'i').test(content);
  }
  const capitalized = name[0].toUpperCase() + name.slice(1);
  const allCaps = name.toUpperCase();
  // Case-sensitive canonical capitalization ("Go", "Node", "ARM", …)
  if (new RegExp(`\\b(?:${capitalized}|${allCaps})\\b`).test(content)) {
    return true;
  }
  // Backtick/inline-code context (any case): `go build`, `node --version`
  return new RegExp('`[^`\\n]*\\b' + esc + '\\b[^`\\n]*`', 'i').test(content);
}

function findArchDoc(repoPath: string): string | null {
  // The narrative architecture documents SDD-02's architecture slot accepts.
  // Deliberately NOT its ADR-index candidates (docs/adr/README.md and
  // friends): an index is a list of links, and tech-matching one finds no
  // technology mentions and so PASSes trivially — free credit is worse than
  // the honest SKIP a repo with no narrative architecture document gets.
  for (const candidate of [
    join(repoPath, 'context', 'architecture', 'architecture.md'),
    join(repoPath, 'context', 'product', 'architecture.md'),
    join(repoPath, 'docs', 'architecture.md'),
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
    // Absence of the doc is not compliance — there is nothing to match against.
    return makeResult(
      'SKIP',
      null,
      ['no architecture document found — tech-match check not applicable'],
      'detected'
    );
  }

  // Keep the original casing — ambiguous tech names (Go, Node, …) are only
  // recognised via their canonical capitalization (see mentionsTech).
  const content = readTextSafe(archDoc);
  if (content === null) {
    return makeResult(
      'SKIP',
      null,
      [
        'could not read architecture document — tech-match check not applicable',
      ],
      'detected'
    );
  }

  const unverified: string[] = [];
  const verified: string[] = [];

  for (const signal of TECH_SIGNALS) {
    if (!mentionsTech(content, signal.name)) continue;
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

function listLocalBranches(repoPath: string): string[] {
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
          (b) => b.length > 0 && !b.startsWith('(') && !TRUNK_BRANCHES.has(b)
        )
    );
  } catch {
    return [];
  }
}

// Spec directories recognised across common spec-driven frameworks (not just
// AWOS) — derived from the SPEC_FRAMEWORKS registry (spec_frameworks.ts),
// the same single source of truth SDD-01/05/06 and DOC-07 read, rather than
// a hand-maintained duplicate. A changed path counts as a spec-touch when it
// falls under any of these roots.
const SPEC_DIRS: readonly string[] = [
  ...new Set([
    ...SPEC_FRAMEWORKS.filter((fw) => fw.id !== 'adr') // decision records aren't feature specs
      .flatMap((fw) => fw.specRoots)
      .map((root) => (root.endsWith('/') ? root : `${root}/`)),
    // Generic conventions not tied to one framework's marker.
    'specs/',
    'spec/',
    'docs/specs/',
  ]),
];

// `spec/` and `specs/` are also where RSpec/Jasmine/Jest keep their TEST
// suites — those files are tests, not spec-driven-development artifacts.
// Under these generic roots only documentation-like files earn spec credit;
// code files (user_spec.rb, foo.spec.ts, spec_helper.rb, …) do not. The
// framework-specific roots (context/spec/, .kiro/specs/, …) are unambiguous.
const GENERIC_SPEC_DIRS = new Set<string>(['specs/', 'spec/']);
const SPEC_DOC_FILE_RX = /\.(?:md|mdx|markdown|rst|txt|adoc)$/i;

/** True if a changed path falls under any recognised spec directory. Robust to a leading "./". */
function isSpecPath(path: string): boolean {
  const p = path.replace(/^\.\//, '');
  return SPEC_DIRS.some((dir) => {
    // Prefix match ("specs/foo.md") or an interior segment equal to the dir
    // ("packages/a/specs/foo.md").
    if (!p.startsWith(dir) && !p.includes('/' + dir)) return false;
    if (GENERIC_SPEC_DIRS.has(dir) && !SPEC_DOC_FILE_RX.test(p)) return false;
    return true;
  });
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
    return out
      .split('\n')
      .map((line) => line.trim())
      .some((line) => line.length > 0 && isSpecPath(line));
  } catch {
    return false;
  }
}

// Lookback for merged-event scanning; matches the collectors' default window.
const MERGED_EVENT_LOOKBACK_DAYS = 90;

// Maintenance work needs no spec — a bug fix, revert, or dependency bump is
// not expected to flow through a spec workflow. SDD-04 measures whether
// FEATURE work is spec-driven, so maintenance subjects are excluded from both
// numerator and denominator. Fix/revert classification reuses the collector's
// regexes so this partition matches the DORA rework/change-failure proxies;
// the prefix regex adds the conventional-commit chore family and bot bumps.
const MAINTENANCE_PREFIX_RX =
  /^(?:chore|docs|ci|build|test|style|deps|release)\b[(:!]?|\bbump\b|\bdependabot\b|\brenovate\b/i;

/** True when a merged-event subject is feature work (not fix/revert/chore). */
function isFeatureSubject(subject: string): boolean {
  return (
    !FIX_SUBJECT_RX.test(subject) &&
    !REVERT_SUBJECT_RX.test(subject) &&
    !MAINTENANCE_PREFIX_RX.test(subject)
  );
}

interface MergedEvent {
  subject: string;
  touchedSpec: boolean;
}

/**
 * Merged feature work landed on the trunk in the lookback window: 2-parent
 * merge commits AND squash/rebase-merged PRs (forge PR ref on the subject).
 * Live branches under-count badly on repos where CI deletes branches after
 * merge — there, the surviving refs are only "currently open" work. Each
 * event's file list is its first-parent diff (exactly what the PR landed).
 */
function listMergedEvents(repoPath: string): MergedEvent[] {
  let out: string;
  try {
    // Walk the SHARED trunk ref, not the local checkout — a diverged local
    // main's first-parent chain is the developer's own pull merges, which
    // would both miss every real PR and count the pull merges as feature work.
    const trunkRef = resolveTrunk(repoPath).ref;
    // Anchor the window to the trunk's newest commit (no wall-clock dependency).
    const latest = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', ...refArgs(trunkRef)],
      { cwd: repoPath, encoding: 'utf8' }
    ).trim();
    if (!latest) return [];
    const since = new Date(
      new Date(latest).getTime() - MERGED_EVENT_LOOKBACK_DAYS * 86_400_000
    ).toISOString();
    out = execFileSync(
      'git',
      [
        'log',
        '--first-parent',
        `--since=${since}`,
        '--diff-merges=first-parent',
        '--name-only',
        '--format=%x1e%P%x1f%s',
        ...refArgs(trunkRef),
      ],
      { cwd: repoPath, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
  } catch {
    return [];
  }
  const events: MergedEvent[] = [];
  for (const record of out.split('\x1e')) {
    if (!record.trim()) continue;
    const nl = record.indexOf('\n');
    const header = nl === -1 ? record : record.slice(0, nl);
    const files = nl === -1 ? '' : record.slice(nl + 1);
    const [parents = '', subject = ''] = header.split('\x1f');
    const isMergeCommit = parents.trim().split(' ').filter(Boolean).length > 1;
    if (!isMergeCommit && !isSquashMergeSubject(subject)) continue;
    const touchedSpec = files
      .split('\n')
      .some((line) => line.trim().length > 0 && isSpecPath(line.trim()));
    events.push({ subject: subject.trim(), touchedSpec });
  }
  return events;
}

export function detectBranchSpecRatio(
  repoPath: string,
  params?: unknown
): ReturnType<typeof makeResult> {
  const p = params as { threshold?: number; warn_at?: number } | undefined;
  const threshold = p?.threshold ?? 0.7;
  const warnAt = p?.warn_at ?? 0.4;
  const thresholdPct = Math.round(threshold * 100);

  // Preferred denominator: FEATURE work actually MERGED in the window (merge
  // commits + squash-merged PRs, minus fixes/reverts/chores — maintenance
  // needs no spec). Fallback: live local branches — only for repos with no
  // PR/merge workflow at all.
  const allEvents = listMergedEvents(repoPath);
  const events = allEvents.filter((e) => isFeatureSubject(e.subject));
  const excluded = allEvents.length - events.length;
  if (allEvents.length > 0 && events.length === 0) {
    return makeResult(
      'SKIP',
      null,
      [
        `all ${allEvents.length} merged PRs in the window are fixes/maintenance — no feature work to measure spec coverage against`,
      ],
      'computed'
    );
  }
  if (events.length > 0) {
    const specEvents = events.filter((e) => e.touchedSpec);
    const total = events.length;
    const ratio = Math.round((specEvents.length / total) * 1e10) / 1e10;
    const evidence = [
      `${specEvents.length}/${total} merged feature PRs (90d) touched spec files (ratio: ${Math.round(ratio * 100)}%; ${excluded} fix/maintenance PRs excluded — no spec expected)`,
      ...specEvents.slice(0, 10).map((e) => `spec PR: ${e.subject}`),
    ];
    if (ratio >= threshold) {
      return makeResult(
        'PASS',
        ratio,
        [
          `${Math.round(ratio * 100)}% of merged feature work used a spec workflow (threshold: ${thresholdPct}%)`,
          ...evidence,
        ],
        'computed'
      );
    }
    if (ratio >= threshold / 2) {
      return makeResult(
        'WARN',
        ratio,
        [
          `only ${Math.round(ratio * 100)}% of merged feature work used a spec workflow (threshold: ${thresholdPct}%)`,
          ...evidence,
        ],
        'computed',
        ratio,
        1.0
      );
    }
    return makeResult(
      'FAIL',
      ratio,
      [
        `only ${Math.round(ratio * 100)}% of merged feature work used a spec workflow (threshold: ${thresholdPct}%)`,
        ...evidence,
      ],
      'computed',
      ratio,
      1.0
    );
  }

  const branches = listLocalBranches(repoPath);

  if (branches.length === 0) {
    return makeResult(
      'SKIP',
      null,
      [
        'no merged PRs or feature branches found — branch→spec ratio not computable',
      ],
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
    `${specBranches.length}/${total} feature branches touched spec files (ratio: ${Math.round(ratio * 100)}%)`,
    ...specBranches.slice(0, 10).map((b) => `spec branch: ${b}`),
    ...plainBranches.slice(0, 10).map((b) => `plain branch: ${b}`),
  ];

  if (ratio >= threshold) {
    return makeResult(
      'PASS',
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches used spec workflow (threshold: ${thresholdPct}%)`,
        ...evidence,
      ],
      'computed'
    );
  }

  if (ratio >= warnAt) {
    return makeResult(
      'WARN',
      ratio,
      [
        `${Math.round(ratio * 100)}% of feature branches used spec workflow (below ${thresholdPct}% threshold)`,
        ...evidence,
      ],
      'computed'
    );
  }

  return makeResult(
    'FAIL',
    ratio,
    [
      `only ${Math.round(ratio * 100)}% of feature branches used spec workflow (threshold: ${thresholdPct}%)`,
      ...evidence,
    ],
    'computed'
  );
}

// ---------------------------------------------------------------------------
// detectSpecTriadComplete — category 2804 (SDD-05, method: detected)
//
// Judges every spec/decision record against whichever convention produced
// it — the full file set for multi-file frameworks (AWOS, Kiro, Agent-OS,
// Spec Kit), or the standard template sections for a single-file decision
// record (ADR). Demanding the AWOS triad of a Kiro spec or an ADR was the
// mechanism by which this check penalized every project that never adopted
// AWOS (issue #160).
//
// Each record earns fractional credit (elements present / elements
// required), averaged across all records — not a binary complete/incomplete
// verdict per record. A single spec missing only one file must not swing an
// otherwise-healthy repo to a hard FAIL.
//
// PASS if the average credit is >=90% (or no records exist — SKIP).
// WARN if 50-89%.
// FAIL if <50%.
// ---------------------------------------------------------------------------

/** One spec-record directory, with the provenance of the workspace it came from. */
export interface SpecDirRef {
  /** Absolute path to the spec directory. */
  path: string;
  /** Display name for evidence — the directory's own name, never a ../.. path. */
  name: string;
  origin: PathOrigin;
}

/**
 * AWOS spec directories only — kept for detectAgentAnnotations (SDD-07),
 * which stays AWOS-specific by design. SDD-05 and SDD-06 use listSpecRecords
 * below instead, so they judge whichever spec-driven convention a project
 * actually uses.
 */
function listSpecDirs(repoPath: string, params?: unknown): SpecDirRef[] {
  const probe = probeRepoPath(repoPath, params, 'context/spec');
  if (probe.path === null) return [];
  let entries: string[];
  try {
    entries = readdirSync(probe.path);
  } catch {
    return [];
  }
  const out: SpecDirRef[] = [];
  for (const e of entries) {
    // AWOS spec directories are numbered (001-feature-name) — the numeric
    // prefix is what enforces ordering. This filter is load-bearing: without
    // it every stray subdirectory under context/spec counts as a spec and
    // SDD-07 silently changes verdicts. It is preserved verbatim from the
    // original implementation.
    if (!/^\d{3}-/.test(e)) continue;
    const full = join(probe.path, e);
    try {
      if (!statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    out.push({ path: full, name: e, origin: probe.origin });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** One spec/decision record, resolved under whichever framework owns it. */
interface SpecRecord {
  /** Absolute path: a directory for multi-file frameworks, a file for ADRs. */
  path: string;
  /** Display name for evidence — never a ../.. path. */
  name: string;
  framework: SpecFramework;
  origin: PathOrigin;
}

/** Every spec/decision record across every recognized framework in use. */
function listSpecRecords(repoPath: string, params?: unknown): SpecRecord[] {
  const out: SpecRecord[] = [];
  for (const { framework } of detectSpecFrameworks(repoPath, params)) {
    // A pattern-named convention (GSD) still keeps one directory per record,
    // like a fixed-triad one — only a convention with neither (ADR) is
    // single-file.
    const singleFile =
      framework.recordTriad.length === 0 && !framework.recordFilePattern;
    for (const root of specRootsFor(repoPath, framework, params)) {
      let entries: string[];
      try {
        entries = readdirSync(root.path);
      } catch {
        continue;
      }
      for (const e of entries) {
        const full = join(root.path, e);
        let isDir: boolean;
        try {
          isDir = statSync(full).isDirectory();
        } catch {
          continue;
        }
        if (isDir && framework.recordSkipDirs?.includes(e)) continue;
        // Multi-file frameworks keep one directory per record; single-file
        // practices keep one markdown file per record. A README is an index,
        // not a decision, and must not be graded as one.
        if (singleFile) {
          if (isDir || !e.endsWith('.md') || e.toLowerCase() === 'readme.md') {
            continue;
          }
        } else if (!isDir) {
          continue;
        }
        // AWOS numbers its spec directories (001-feature-name) and
        // listSpecDirs above filters on that prefix. SDD-07 still uses
        // listSpecDirs, so without the same filter here SDD-05/06 would
        // count directories SDD-07 ignores — two checks disagreeing about
        // what a spec is, in the same repo. The filter is AWOS-specific by
        // design: Kiro and Agent-OS specs are not numbered, so applying it
        // to every framework would silently zero them out.
        if (framework.id === 'awos' && !/^\d{3}-/.test(e)) continue;
        out.push({ path: full, name: e, framework, origin: root.origin });
      }
    }
  }
  return out;
}

/**
 * A record's declared status, or null when it declares none.
 * Accepts the AWOS inline form (`- **Status:** Approved`, with or without a
 * leading list marker or bold) and the ADR section form (`## Status`
 * followed by the value on a later line).
 */
function recordStatus(filePath: string): string | null {
  const text = readTextSafe(filePath);
  if (text === null) return null;
  const inline = text.match(
    /^\s*[-*]?\s*(?:\*\*)?Status(?:\*\*)?\s*:\s*(.+?)\s*$/im
  );
  if (inline) return inline[1].replace(/\*+/g, '').trim();
  // JS has no \Z end-of-string anchor; $(?![\s\S]) is the equivalent — plain
  // $ under the /m flag would stop at the first blank line inside the
  // section instead of at the next heading or true end of file.
  const section = text.match(
    /^#{1,6}\s*Status\s*$([\s\S]*?)(?=^#{1,6}\s|$(?![\s\S]))/im
  );
  if (section) {
    const first = section[1]
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean);
    if (first)
      return first
        .replace(/^[-*]\s*/, '')
        .replace(/\*+/g, '')
        .trim();
  }
  return null;
}

/** How complete one record is: the elements its convention requires, and how many are present. */
interface RecordCompleteness {
  record: SpecRecord;
  present: number;
  required: number;
  missing: string[];
}

function recordCompleteness(r: SpecRecord): RecordCompleteness {
  if (r.framework.recordFilePattern) {
    // Pattern-named records (GSD's NN-PP-PLAN.md) are complete once at
    // least one matching file exists in the record directory — there is no
    // fixed file set to check off.
    let hasMatch = false;
    try {
      hasMatch = readdirSync(r.path).some((f) =>
        r.framework.recordFilePattern!.test(f)
      );
    } catch {
      hasMatch = false;
    }
    return {
      record: r,
      present: hasMatch ? 1 : 0,
      required: 1,
      missing: hasMatch
        ? []
        : [`a file matching ${r.framework.recordFilePattern}`],
    };
  }
  if (r.framework.recordTriad.length > 0) {
    const present = r.framework.recordTriad.filter((f) =>
      existsSync(join(r.path, f))
    );
    return {
      record: r,
      present: present.length,
      required: r.framework.recordTriad.length,
      missing: r.framework.recordTriad.filter((f) => !present.includes(f)),
    };
  }
  const text = readTextSafe(r.path) ?? '';
  const present = r.framework.recordSections.filter((sec) =>
    new RegExp(`^#{1,6}\\s*${sec}\\s*$`, 'im').test(text)
  );
  return {
    record: r,
    present: present.length,
    required: r.framework.recordSections.length,
    missing: r.framework.recordSections.filter((s) => !present.includes(s)),
  };
}

export function detectSpecTriadComplete(
  repoPath: string,
  params?: unknown
): ReturnType<typeof makeResult> {
  const records = listSpecRecords(repoPath, params);
  if (records.length === 0) {
    // A repo with zero spec/decision records must not score on completeness.
    return makeResult('SKIP', 0, [
      'no spec or decision records found under any recognized convention',
    ]);
  }

  const scored = records.map(recordCompleteness);
  // Credit is fractional per record (present/required elements), not a
  // binary complete/incomplete verdict: a spec missing only tasks.md is
  // meaningfully more complete than an empty directory, and a single
  // mostly-complete record must not swing the whole repo to a hard FAIL.
  const totalCredit = scored.reduce(
    (sum, s) => sum + (s.required > 0 ? s.present / s.required : 1),
    0
  );
  const ratio = totalCredit / records.length;
  const complete = scored.filter((s) => s.missing.length === 0);
  const incomplete = scored.filter((s) => s.missing.length > 0);

  const origin: PathOrigin = records.every((r) => r.origin === 'inherited')
    ? 'inherited'
    : 'own';
  const headline = inheritedNote(
    origin,
    `${complete.length}/${records.length} record(s) structurally complete`
  );
  const detail = incomplete
    .slice(0, 10)
    .map(
      (s) =>
        `${s.record.framework.label}: ${s.record.name} — ${s.present}/${s.required} required elements present (missing: ${s.missing.join(', ')})`
    );

  if (ratio >= 0.9) return makeResult('PASS', complete.length, [headline]);
  if (ratio >= 0.5) {
    return makeResult('WARN', complete.length, [headline, ...detail]);
  }
  return makeResult('FAIL', complete.length, [headline, ...detail]);
}

// ---------------------------------------------------------------------------
// detectStaleSpecs — category 2805 (SDD-06, method: detected)
//
// Classifies every spec/decision record by its own convention's status
// vocabulary (e.g. AWOS: Draft/In Review/Approved are active, Completed is
// terminal; ADR: Proposed/Draft are active, Accepted/Superseded/Deprecated/
// Rejected are terminal). A record whose status is terminal is settled, not
// stale. A convention that tracks status once for the whole project rather
// than per record (GSD's .planning/STATE.md) judges every one of its
// records against that single status instead of reading each record's own
// file — see SpecFramework.projectStatusFile.
//
// Status alone decides staleness: a record is stale when its status is in
// its convention's active vocabulary, full stop. There is no task-progress
// signal here — a just-started project is not the audience this check
// scores (it runs against projects already shown to the audit plugin), so
// the "freshly opened spec looks abandoned" false positive that an earlier
// task-progress condition guarded against does not arise in practice.
//
// PASS if none of the judged records are active.
// WARN if fewer than half of the judged records are active.
// FAIL if half or more of the judged records are active.
// SKIP if no record declares a status this check recognizes.
// ---------------------------------------------------------------------------

/** The status-bearing file for one record — its own file, or the framework's single project-level file. */
function statusFileFor(
  r: SpecRecord,
  repoPath: string,
  params?: unknown
): string | null {
  if (r.framework.projectStatusFile) {
    return probeRepoPath(repoPath, params, r.framework.projectStatusFile).path;
  }
  return r.framework.recordTriad.length > 0
    ? join(r.path, r.framework.recordTriad[0])
    : r.path;
}

export function detectStaleSpecs(
  repoPath: string,
  params?: unknown
): ReturnType<typeof makeResult> {
  const records = listSpecRecords(repoPath, params);
  if (records.length === 0) {
    return makeResult('SKIP', 0, [
      'no spec or decision records found under any recognized convention',
    ]);
  }

  const origin: PathOrigin = records.every((r) => r.origin === 'inherited')
    ? 'inherited'
    : 'own';

  const active: string[] = [];
  const unknown: string[] = [];
  let judged = 0;
  for (const r of records) {
    const statusFile = statusFileFor(r, repoPath, params);
    const status = statusFile === null ? null : recordStatus(statusFile);
    const isActive = r.framework.statusActive.some(
      (v) => v.toLowerCase() === (status ?? '').toLowerCase()
    );
    const isTerminal = r.framework.statusTerminal.some(
      (v) => v.toLowerCase() === (status ?? '').toLowerCase()
    );
    if (!isActive && !isTerminal) {
      // Neither vocabulary matched: the record declares no status this
      // convention recognizes. Counting it active would punish a project for
      // a wording choice, so it leaves the ratio entirely.
      unknown.push(`${r.name} (status: ${status ?? 'none declared'})`);
      continue;
    }
    judged += 1;
    if (isActive) active.push(`${r.framework.label}: ${r.name} (${status})`);
  }

  const evidence = [
    inheritedNote(
      origin,
      `${active.length} of ${judged} record(s) with a recognized status are active`
    ),
    ...active.slice(0, 10).map((s) => inheritedNote(origin, `active: ${s}`)),
  ];
  if (unknown.length > 0) {
    evidence.push(
      inheritedNote(
        origin,
        `${unknown.length} record(s) declare no status this convention recognizes and are excluded from the ratio: ${unknown.slice(0, 5).join('; ')}`
      )
    );
  }

  if (judged === 0) return makeResult('SKIP', 0, evidence);
  if (active.length === 0) return makeResult('PASS', 0, evidence);
  const ratio = active.length / judged;
  if (ratio < 0.5) return makeResult('WARN', active.length, evidence);
  return makeResult('FAIL', active.length, evidence);
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
  params?: unknown
): ReturnType<typeof makeResult> {
  const p = params as { pass_at?: number; warn_at?: number } | undefined;
  const passAt = p?.pass_at ?? 0.7;
  const warnAt = p?.warn_at ?? 0.4;
  const passAtPct = Math.round(passAt * 100);
  const specDirs = listSpecDirs(repoPath, params);

  let totalTasks = 0;
  let annotatedTasks = 0;

  for (const ref of specDirs) {
    const tasksPath = join(ref.path, 'tasks.md');
    if (!existsSync(tasksPath)) continue;

    const content = readTextSafe(tasksPath);
    if (content === null) continue;

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

  // A single listSpecDirs() call resolves entirely from one location (own or
  // inherited), so every ref shares the same origin; specDirs is non-empty
  // here (totalTasks > 0 requires at least one).
  const origin: PathOrigin = specDirs[0].origin;

  const ratio = Math.round((annotatedTasks / totalTasks) * 1e10) / 1e10;
  const evidence = [
    inheritedNote(
      origin,
      `${annotatedTasks}/${totalTasks} task lines have **[Agent: ...]** annotations (${Math.round(ratio * 100)}%)`
    ),
  ];

  if (ratio >= passAt) {
    return makeResult('PASS', ratio, [
      inheritedNote(
        origin,
        `${Math.round(ratio * 100)}% of tasks annotated with agent assignments (threshold: ${passAtPct}%)`
      ),
      ...evidence,
    ]);
  }

  if (ratio >= warnAt) {
    return makeResult('WARN', ratio, [
      inheritedNote(
        origin,
        `only ${Math.round(ratio * 100)}% of tasks annotated with agent assignments (below ${passAtPct}%)`
      ),
      ...evidence,
    ]);
  }

  return makeResult('FAIL', ratio, [
    inheritedNote(
      origin,
      `only ${Math.round(ratio * 100)}% of tasks annotated with agent assignments (threshold: ${passAtPct}%)`
    ),
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
  2800: detectSpecWorkflowAdopted, // SDD-01 spec-driven practice adopted
  2801: detectProductContextDocs, // SDD-02 foundational product docs
  2802: detectArchTechMatch, // SDD-03 tech choices match codebase
  2803: detectBranchSpecRatio, // SDD-04 branch→spec ratio (computed)
  2804: detectSpecTriadComplete, // SDD-05 spec triad completeness
  2805: detectStaleSpecs, // SDD-06 no stale specs
  2806: detectAgentAnnotations, // SDD-07 agent annotations in tasks.md
};
