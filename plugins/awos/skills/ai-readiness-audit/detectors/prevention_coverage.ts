import { makeResult, iterFiles, readTextSafe } from './_base.ts';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CI_DIRS, CI_FILES } from '../ci_platforms.ts';
import { ALL_HOOK_PATHS } from '../agent_tools.ts';
import {
  VULN_SCANNER_RX,
  DEPENDABOT_PATHS,
  RENOVATE_PATHS,
} from './supply_chain_security.ts';
import {
  detectLinting,
  detectFormatting,
  PRECOMMIT_FORMATTER_RX,
} from './software_best_practices.ts';
import { detectAgentSafetyHooks } from './security.ts';

// ---------------------------------------------------------------------------
// prevention-coverage enforcement detectors — categories 3100–3107
// (PRV-01…PRV-08). One per cluster; the instruction halves (3110–3117) are
// judgment categories with no detector entry.
//
// Default grading rule: PASS = an actively running mechanism (invocation
// found in a gate surface: pre-commit config, husky/lefthook scripts,
// lint-staged, a CI workflow step, agent hooks, or a server-side bot config);
// WARN = a relevant tool config exists but no gate invokes it; FAIL =
// neither. Two detectors deviate — see their own headers: PRV-02 WARNs on a
// different axis (a bot that runs but only maintains lockfiles), and PRV-06
// grades on a coverage threshold rather than config existence. Detection is
// grep-heuristic over the gate surfaces — same precision tier as SCS-06's
// VULN_SCANNER_RX.
// ---------------------------------------------------------------------------

interface GateSurface {
  /** Path relative to the repo root (for evidence lines). */
  file: string;
  kind: 'pre-commit' | 'ci' | 'agent-hooks';
  content: string;
}

const CI_WORKFLOW_GLOBS = ['*.yml', '*.yaml'];

const PRECOMMIT_SURFACE_FILES = [
  '.pre-commit-config.yaml',
  'lefthook.yml',
  '.lefthook.yml',
  'lefthook.yaml',
];

const HOOK_SCRIPT_GLOBS = ['*.sh', '*.js', '*.ts', '*.py', '*.bash'];

/**
 * Collect the gate surfaces: every text corpus where a tool invocation counts
 * as "mechanically gated". package.json is NOT included wholesale (its
 * devDependencies would false-positive every tool name) — only its hook-
 * related keys (lint-staged / husky / simple-git-hooks / pre-commit scripts)
 * are extracted. Underlying reads go through _base's cached readTextSafe /
 * iterFiles, so recomputing per detector is cheap and cache-clearing stays
 * centralized in clearDetectorCaches().
 */
function gateSurfaces(repoPath: string): GateSurface[] {
  const surfaces: GateSurface[] = [];

  // pre-commit-style single-file configs
  for (const rel of PRECOMMIT_SURFACE_FILES) {
    const content = readTextSafe(join(repoPath, rel));
    if (content !== null) {
      surfaces.push({ file: rel, kind: 'pre-commit', content });
    }
  }

  // husky scripts
  const huskyDir = join(repoPath, '.husky');
  if (existsSync(huskyDir)) {
    for (const f of iterFiles(huskyDir, ['*'])) {
      const content = readTextSafe(f);
      if (content !== null) {
        surfaces.push({
          file: relative(repoPath, f),
          kind: 'pre-commit',
          content,
        });
      }
    }
  }

  // package.json hook-related keys only
  const pkgRaw = readTextSafe(join(repoPath, 'package.json'));
  if (pkgRaw !== null) {
    try {
      const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of ['lint-staged', 'husky', 'simple-git-hooks']) {
        if (pkg[key] !== undefined) parts.push(JSON.stringify(pkg[key]));
      }
      const scripts = (pkg.scripts ?? {}) as Record<string, unknown>;
      for (const [name, cmd] of Object.entries(scripts)) {
        if (/pre-?(commit|push)/i.test(name)) parts.push(String(cmd));
      }
      if (parts.length > 0) {
        surfaces.push({
          file: 'package.json',
          kind: 'pre-commit',
          content: parts.join('\n'),
        });
      }
    } catch {
      // unparseable package.json — no hook surface to extract
    }
  }

  // CI workflow files (directory platforms + single-file platforms)
  for (const ciDir of CI_DIRS) {
    const ciDirPath = join(repoPath, ciDir);
    if (!existsSync(ciDirPath)) continue;
    for (const f of iterFiles(ciDirPath, CI_WORKFLOW_GLOBS)) {
      const content = readTextSafe(f);
      if (content !== null) {
        surfaces.push({ file: relative(repoPath, f), kind: 'ci', content });
      }
    }
  }
  for (const rel of CI_FILES) {
    const content = readTextSafe(join(repoPath, rel));
    if (content !== null) {
      surfaces.push({ file: rel, kind: 'ci', content });
    }
  }

  // agent hooks: settings hooks config + hook scripts
  for (const settingsRel of [
    '.claude/settings.json',
    '.claude/settings.local.json',
  ]) {
    const content = readTextSafe(join(repoPath, settingsRel));
    if (content !== null && /"hooks"\s*:/.test(content)) {
      surfaces.push({ file: settingsRel, kind: 'agent-hooks', content });
    }
  }
  for (const relHooksDir of ALL_HOOK_PATHS) {
    const hooksDir = join(repoPath, relHooksDir);
    if (!existsSync(hooksDir)) continue;
    for (const f of iterFiles(hooksDir, HOOK_SCRIPT_GLOBS)) {
      const content = readTextSafe(f);
      if (content !== null) {
        surfaces.push({
          file: relative(repoPath, f),
          kind: 'agent-hooks',
          content,
        });
      }
    }
  }

  return surfaces;
}

/** First surfaces matching rx, as ready evidence lines ("file (matched-token)"). */
function gateMatches(
  surfaces: GateSurface[],
  rx: RegExp,
  kinds?: GateSurface['kind'][]
): string[] {
  const hits: string[] = [];
  for (const s of surfaces) {
    if (kinds && !kinds.includes(s.kind)) continue;
    const m = s.content.match(rx);
    if (m) hits.push(`${s.file} (${m[1] ?? m[0]})`);
  }
  return hits;
}

/** Root-level config files that exist, as repo-relative paths. */
function presentConfigs(repoPath: string, candidates: string[]): string[] {
  return candidates.filter((rel) => existsSync(join(repoPath, rel)));
}

// ---------------------------------------------------------------------------
// detectSecretScanGate — category 3100 (PRV-01, method: detected)
// ---------------------------------------------------------------------------

const SECRET_SCANNER_RX =
  /\b(gitleaks|trufflehog|detect-secrets|git-secrets|ggshield|secretlint)\b/i;

const SECRET_SCANNER_CONFIGS = [
  '.gitleaks.toml',
  'gitleaks.toml',
  '.secrets.baseline',
  '.ggshield.yaml',
  '.trufflehog.yaml',
  '.secretlintrc.json',
];

export function detectSecretScanGate(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const hits = gateMatches(gateSurfaces(repoPath), SECRET_SCANNER_RX);
  if (hits.length > 0) {
    return makeResult('PASS', hits.length, [
      'secret scanner gated in pre-commit/CI — committed credentials are mechanically blocked',
      ...hits.slice(0, 5).map((h) => `gate: ${h}`),
    ]);
  }
  const configs = presentConfigs(repoPath, SECRET_SCANNER_CONFIGS);
  if (configs.length > 0) {
    return makeResult('WARN', configs.length, [
      'secret-scanner config present but no gate invokes it — scanning depends on someone running it',
      ...configs.map((c) => `config: ${c}`),
    ]);
  }
  return makeResult('FAIL', 0, [
    'no secret-scanning gate found — nothing mechanically blocks committed credentials (add gitleaks/trufflehog to pre-commit or CI)',
  ]);
}

// ---------------------------------------------------------------------------
// detectDependencyRiskAutomation — category 3101 (PRV-02, method: detected)
//
// A server-side update bot (Dependabot/Renovate) counts as enforcement — it
// runs without anyone invoking it. Exception: a Renovate config whose only
// update semantics is lockFileMaintenance refreshes lockfiles without
// touching dependency declarations and does no scanning, so on its own it
// grades WARN, not PASS (https://docs.renovatebot.com/configuration-options/#lockfilemaintenance).
// ---------------------------------------------------------------------------

/**
 * True when a Renovate config drives nothing but lockfile maintenance: it
 * declares `lockFileMaintenance` and no other update-driving keys. Presets
 * (`extends`), `packageRules`, or manager blocks all mean real dependency
 * updates happen. Unparseable configs fall back to a conservative regex:
 * mentions lockFileMaintenance and neither extends nor packageRules.
 */
function isLockfileMaintenanceOnly(content: string): boolean {
  try {
    const cfg = JSON.parse(content) as Record<string, unknown>;
    if (cfg.lockFileMaintenance === undefined) return false;
    const drivers = Object.keys(cfg).filter(
      (k) => k !== 'lockFileMaintenance' && k !== '$schema'
    );
    return drivers.length === 0;
  } catch {
    return (
      /lockFileMaintenance/.test(content) &&
      !/extends|packageRules/.test(content)
    );
  }
}

export function detectDependencyRiskAutomation(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const ciHits = gateMatches(gateSurfaces(repoPath), VULN_SCANNER_RX, ['ci']);
  const dependabotConfigs = presentConfigs(repoPath, DEPENDABOT_PATHS);
  const renovateConfigs = presentConfigs(repoPath, RENOVATE_PATHS);
  const updateBots = [
    ...dependabotConfigs,
    ...renovateConfigs.filter((rel) => {
      const content = readTextSafe(join(repoPath, rel));
      return content === null || !isLockfileMaintenanceOnly(content);
    }),
  ];
  const lockfileOnlyBots = renovateConfigs.filter(
    (rel) => !updateBots.includes(rel)
  );

  if (ciHits.length > 0 || updateBots.length > 0) {
    return makeResult('PASS', ciHits.length + updateBots.length, [
      'dependency risk mechanically managed (CI vulnerability scan and/or update bot)',
      ...ciHits.slice(0, 5).map((h) => `ci scanner: ${h}`),
      ...updateBots.map((c) => `update bot: ${c}`),
    ]);
  }
  if (lockfileOnlyBots.length > 0) {
    return makeResult('WARN', lockfileOnlyBots.length, [
      'Renovate only maintains lockfiles — no dependency updates and no vulnerability scanning',
      ...lockfileOnlyBots.map((c) => `lockfile-maintenance-only config: ${c}`),
    ]);
  }
  return makeResult('FAIL', 0, [
    'no dependency-risk automation — no CI vulnerability scan and no Dependabot/Renovate config',
  ]);
}

// ---------------------------------------------------------------------------
// detectSastGate — category 3102 (PRV-03, method: detected)
// ---------------------------------------------------------------------------

const SAST_RX =
  /\b(semgrep|codeql|bandit|brakeman|gosec|eslint-plugin-security|sonarcloud|sonarqube|sonar-scanner|checkmarx|fortify)\b/i;

const SAST_CONFIGS = [
  '.semgrep.yml',
  '.semgrep.yaml',
  '.semgrep',
  'sonar-project.properties',
  '.bandit',
  'bandit.yaml',
];

export function detectSastGate(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const hits = gateMatches(gateSurfaces(repoPath), SAST_RX);
  if (hits.length > 0) {
    return makeResult('PASS', hits.length, [
      'static application-security testing gated in pre-commit/CI',
      ...hits.slice(0, 5).map((h) => `gate: ${h}`),
    ]);
  }
  const configs = presentConfigs(repoPath, SAST_CONFIGS);
  if (configs.length > 0) {
    return makeResult('WARN', configs.length, [
      'SAST config present but no gate invokes it',
      ...configs.map((c) => `config: ${c}`),
    ]);
  }
  return makeResult('FAIL', 0, [
    'no SAST gate found — insecure patterns are not mechanically caught before merge (add Semgrep/CodeQL/Bandit to CI)',
  ]);
}

// ---------------------------------------------------------------------------
// detectCodeStyleGated — category 3103 (PRV-04, method: detected)
//
// Stricter than SBP-01/SBP-02 ("configured"): the linter/formatter must be
// INVOKED from a gate. Configured-but-not-gated is exactly the WARN case.
// ---------------------------------------------------------------------------

const LINT_GATE_RX =
  /\b(eslint|prettier|ruff|flake8|pylint|black|golangci-lint|rubocop|clippy|biome|npm run lint|pnpm lint|pnpm run lint|yarn lint|pre-commit run)\b/i;

export function detectCodeStyleGated(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const surfaces = gateSurfaces(repoPath);
  const hits = [
    ...gateMatches(surfaces, LINT_GATE_RX, ['pre-commit', 'ci']),
    ...gateMatches(surfaces, PRECOMMIT_FORMATTER_RX, ['pre-commit']),
  ];
  if (hits.length > 0) {
    return makeResult('PASS', hits.length, [
      'linter/formatter gated in pre-commit/CI — style drift is mechanically blocked',
      ...[...new Set(hits)].slice(0, 5).map((h) => `gate: ${h}`),
    ]);
  }
  const configured =
    detectLinting(repoPath).status === 'PASS' ||
    detectFormatting(repoPath).status === 'PASS';
  if (configured) {
    return makeResult('WARN', 0, [
      'linter/formatter configured but not gated — nothing runs it in pre-commit or CI',
    ]);
  }
  return makeResult('FAIL', 0, [
    'no linting or formatting mechanism found — neither configured nor gated',
  ]);
}

// ---------------------------------------------------------------------------
// detectArchBoundariesGate — category 3104 (PRV-05, method: detected)
//
// ArchUnit config counts as gated when present — ArchUnit rules are JUnit
// tests, so they run wherever the test suite runs.
// ---------------------------------------------------------------------------

const ARCH_TOOL_RX =
  /\b(depcruise|dependency-cruiser|lint-imports|import-linter|importlinter)\b/i;

const ARCH_CONFIG_FILES = [
  '.dependency-cruiser.js',
  '.dependency-cruiser.cjs',
  '.dependency-cruiser.mjs',
  '.dependency-cruiser.json',
];

const IMPORTLINTER_RX = /^\[(tool\.)?importlinter\]/m;
const ESLINT_BOUNDARIES_RX =
  /(eslint-plugin-boundaries|import\/no-restricted-paths|enforce-module-boundaries)/;
// An eslint invocation in a gate surface, including lint-script runs through
// every package manager LINT_GATE_RX recognizes (pnpm aliases any script as
// a subcommand, so `pnpm lint` ≡ `pnpm run lint` — the usual Nx gate).
const ESLINT_GATE_RX =
  /\beslint\b|\bnpm run lint\b|\bpnpm (run )?lint\b|\byarn lint\b/i;
const ARCHUNIT_RX = /\barchunit\b/i;

export function detectArchBoundariesGate(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const surfaces = gateSurfaces(repoPath);
  const invoked = gateMatches(surfaces, ARCH_TOOL_RX);
  if (invoked.length > 0) {
    return makeResult('PASS', invoked.length, [
      'module-boundary tool gated in pre-commit/CI',
      ...invoked.slice(0, 5).map((h) => `gate: ${h}`),
    ]);
  }

  // ArchUnit: a build-file dependency or an Arch test class means the rules
  // run with the test suite.
  for (const buildGlob of ['build.gradle', 'build.gradle.kts', 'pom.xml']) {
    for (const f of iterFiles(repoPath, [buildGlob])) {
      const content = readTextSafe(f);
      if (content !== null && ARCHUNIT_RX.test(content)) {
        return makeResult('PASS', 1, [
          `ArchUnit dependency found in ${relative(repoPath, f)} — boundary rules run with the test suite`,
        ]);
      }
    }
  }

  // eslint-based boundary rules: gated iff eslint itself is gated.
  const eslintConfigs = iterFiles(repoPath, [
    'eslint.config.*',
    '.eslintrc*',
    'nx.json',
  ]);
  const boundaryConfig = eslintConfigs.find((f) => {
    const content = readTextSafe(f);
    return content !== null && ESLINT_BOUNDARIES_RX.test(content);
  });
  if (boundaryConfig) {
    const eslintGated = gateMatches(surfaces, ESLINT_GATE_RX).length > 0;
    const rel = relative(repoPath, boundaryConfig);
    if (eslintGated) {
      return makeResult('PASS', 1, [
        `eslint boundary rules in ${rel} and eslint is gated in pre-commit/CI`,
      ]);
    }
    return makeResult('WARN', 1, [
      `eslint boundary rules in ${rel} but eslint is not gated`,
    ]);
  }

  const configs = presentConfigs(repoPath, ARCH_CONFIG_FILES);
  const pyprojectHit = ['setup.cfg', 'pyproject.toml'].find((rel) => {
    const content = readTextSafe(join(repoPath, rel));
    return content !== null && IMPORTLINTER_RX.test(content);
  });
  if (configs.length > 0 || pyprojectHit) {
    return makeResult('WARN', configs.length, [
      'module-boundary config present but no gate invokes it',
      ...configs.map((c) => `config: ${c}`),
      ...(pyprojectHit ? [`config: ${pyprojectHit} ([importlinter])`] : []),
    ]);
  }
  return makeResult('FAIL', 0, [
    'no module-boundary checking mechanism found — layering violations are not mechanically caught',
  ]);
}

// ---------------------------------------------------------------------------
// detectTestCoverageGate — category 3105 (PRV-06, method: detected)
// ---------------------------------------------------------------------------

const TEST_GATE_RX =
  /\b(pytest|npm test|npm run test|pnpm test|pnpm run test|yarn test|go test|cargo test|mvn (test|verify)|gradlew? (test|check|build)|vitest|jest|tox|nox|rspec|phpunit)\b/i;

const COVERAGE_GATE_RX =
  /(--cov-fail-under|coverageThreshold|fail_under|fail-under|jacocoTestCoverageVerification|koverVerify|--coverage\.thresholds|min_coverage|minimum-coverage|check_coverage)/i;

const COVERAGE_CONFIG_FILES = [
  '.coveragerc',
  'pyproject.toml',
  'jest.config.js',
  'jest.config.ts',
  'jest.config.cjs',
  'jest.config.mjs',
  'jest.config.json',
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mts',
  'build.gradle',
  'build.gradle.kts',
];

export function detectTestCoverageGate(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const surfaces = gateSurfaces(repoPath);
  const testHits = gateMatches(surfaces, TEST_GATE_RX, ['ci']);
  if (testHits.length === 0) {
    return makeResult('FAIL', 0, [
      'no CI test gate found — untested changes can merge silently (this includes having no CI at all)',
    ]);
  }

  const coverageHits = gateMatches(surfaces, COVERAGE_GATE_RX, ['ci']);
  if (coverageHits.length === 0) {
    for (const rel of COVERAGE_CONFIG_FILES) {
      for (const f of iterFiles(repoPath, [rel])) {
        const content = readTextSafe(f);
        if (content !== null && COVERAGE_GATE_RX.test(content)) {
          coverageHits.push(`${relative(repoPath, f)}`);
          break;
        }
      }
      if (coverageHits.length > 0) break;
    }
  }

  if (coverageHits.length > 0) {
    return makeResult('PASS', testHits.length + coverageHits.length, [
      'CI runs the test suite and a coverage threshold is enforced',
      ...testHits.slice(0, 3).map((h) => `test gate: ${h}`),
      ...coverageHits.slice(0, 3).map((h) => `coverage gate: ${h}`),
    ]);
  }
  return makeResult('WARN', testHits.length, [
    'CI runs the test suite but no coverage threshold is enforced',
    ...testHits.slice(0, 5).map((h) => `test gate: ${h}`),
  ]);
}

// ---------------------------------------------------------------------------
// detectAgentSurfaceGuard — category 3106 (PRV-07, method: detected)
//
// Delegates to the AIS-07 detector (hooks guarding sensitive files); a CI
// step that checks agent instruction files is the alternate PASS route.
// ---------------------------------------------------------------------------

const AGENT_FILE_CI_RX =
  /\b(CLAUDE\.md|AGENTS\.md|\.claude\/|prompt[-_]?lint)\b/;

export function detectAgentSurfaceGuard(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const delegated = detectAgentSafetyHooks(repoPath);
  if (delegated.status === 'PASS') return delegated;

  const ciHits = gateMatches(gateSurfaces(repoPath), AGENT_FILE_CI_RX, ['ci']);
  if (ciHits.length > 0) {
    return makeResult('PASS', ciHits.length, [
      'CI checks agent configuration files',
      ...ciHits.slice(0, 5).map((h) => `ci check: ${h}`),
    ]);
  }
  // WARN (hooks exist but guard nothing) or FAIL from the delegate stands.
  return delegated;
}

// ---------------------------------------------------------------------------
// detectDocsFreshnessGate — category 3107 (PRV-08, method: detected)
// ---------------------------------------------------------------------------

const DOCS_GATE_RX =
  /\b(lychee|markdown-link-check|linkinator|linkcheck|mkdocs build --strict|markdownlint(-cli2?)?|remark-lint|vale)\b/i;

const DOCS_CHECKER_CONFIGS = [
  '.markdownlint.json',
  '.markdownlint.yaml',
  '.markdownlint.yml',
  '.markdownlint-cli2.jsonc',
  '.markdownlint-cli2.yaml',
  '.vale.ini',
  'lychee.toml',
  '.mlc_config.json',
];

export function detectDocsFreshnessGate(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const hits = gateMatches(gateSurfaces(repoPath), DOCS_GATE_RX, [
    'pre-commit',
    'ci',
  ]);
  if (hits.length > 0) {
    return makeResult('PASS', hits.length, [
      'documentation checker gated in pre-commit/CI',
      ...hits.slice(0, 5).map((h) => `gate: ${h}`),
    ]);
  }
  const configs = presentConfigs(repoPath, DOCS_CHECKER_CONFIGS);
  if (configs.length > 0) {
    return makeResult('WARN', configs.length, [
      'docs-checker config present but no gate invokes it',
      ...configs.map((c) => `config: ${c}`),
    ]);
  }
  return makeResult('FAIL', 0, [
    'no documentation-checking mechanism found — stale docs are not mechanically caught',
  ]);
}

// ---------------------------------------------------------------------------
// DETECTORS — category code → detector. Judgment codes 3110–3117 (PRV-11…
// PRV-18) are excluded: they are evaluated by the orchestrator's judgment
// patch, not by static detection.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  3100: detectSecretScanGate, // PRV-01 secret-scanning gate
  3101: detectDependencyRiskAutomation, // PRV-02 dependency risk automation
  3102: detectSastGate, // PRV-03 SAST gate
  3103: detectCodeStyleGated, // PRV-04 code style gated
  3104: detectArchBoundariesGate, // PRV-05 architecture boundaries gate
  3105: detectTestCoverageGate, // PRV-06 test + coverage gate
  3106: detectAgentSurfaceGuard, // PRV-07 agent configuration guarded
  3107: detectDocsFreshnessGate, // PRV-08 docs freshness gate
};
