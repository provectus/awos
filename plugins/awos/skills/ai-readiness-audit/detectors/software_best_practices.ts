import {
  makeResult,
  grep,
  iterFiles,
  readTextSafe,
  presencePass,
} from './_base.ts';
import { basename, relative } from 'node:path';
import { CI_FILES, isCiWorkflowPath } from '../ci_platforms.ts';

// ---------------------------------------------------------------------------
// detectLinting — category 2700 (method: detected, SBP-01)
//
// PASS if any recognised linter config file is present.
// Evidence = which config file(s) were found.
// ---------------------------------------------------------------------------

const LINTER_CONFIGS = [
  // JavaScript / TypeScript
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  '.eslintrc.json',
  'tslint.json',
  // Python
  '.flake8',
  '.pylintrc',
  'pylintrc',
  // Ruby
  '.rubocop.yml',
  // Go
  '.golangci.yml',
  '.golangci.yaml',
  '.golangci.toml',
];

// pyproject.toml needs special handling: grep for [tool.ruff] or [tool.pylint]
const PYPROJECT_LINTER_RX = /^\[tool\.(ruff|pylint|flake8)\]/m;

export function detectLinting(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const hit = presencePass(repoPath, LINTER_CONFIGS, 'linter config found');
  if (hit) return hit;
  // Check pyproject.toml for [tool.ruff] / [tool.pylint] / [tool.flake8]
  const pyprojects = iterFiles(repoPath, ['pyproject.toml']);
  for (const p of pyprojects) {
    const content = readTextSafe(p);
    if (content !== null && PYPROJECT_LINTER_RX.test(content)) {
      return makeResult('PASS', 1, [
        `linter config found in ${relative(repoPath, p)} ([tool.ruff] or [tool.pylint])`,
      ]);
    }
  }
  return makeResult('FAIL', 0, ['no linter configuration found']);
}

// ---------------------------------------------------------------------------
// detectFormatting — category 2701 (method: detected, SBP-02)
//
// PASS if a formatter config or pre-commit formatting hook is present.
// ---------------------------------------------------------------------------

const FORMATTER_CONFIGS = [
  // Prettier
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  '.prettierrc.json',
  '.prettierrc.json5',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.toml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'prettier.config.ts',
  // Rust
  'rustfmt.toml',
  '.rustfmt.toml',
];

// pyproject.toml: [tool.black], [tool.ruff.format]
const PYPROJECT_FORMATTER_RX = /^\[tool\.(black|ruff\.format)\]/m;

// pre-commit hooks: formatters invoked as hooks
export const PRECOMMIT_FORMATTER_RX =
  /\b(prettier|black|ruff|gofmt|rustfmt|clang-format|autopep8|isort)\b/;

export function detectFormatting(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const hit = presencePass(
    repoPath,
    FORMATTER_CONFIGS,
    'formatter config found'
  );
  if (hit) return hit;
  // Check pyproject.toml for [tool.black] / [tool.ruff.format]
  const pyprojects = iterFiles(repoPath, ['pyproject.toml']);
  for (const p of pyprojects) {
    const content = readTextSafe(p);
    if (content !== null && PYPROJECT_FORMATTER_RX.test(content)) {
      return makeResult('PASS', 1, [
        `formatter config found in ${relative(repoPath, p)} ([tool.black] or [tool.ruff.format])`,
      ]);
    }
  }
  // Check pre-commit config for a formatting hook
  const precommit = iterFiles(repoPath, ['.pre-commit-config.yaml']);
  for (const p of precommit) {
    const content = readTextSafe(p);
    if (content !== null && PRECOMMIT_FORMATTER_RX.test(content)) {
      return makeResult('PASS', 1, [
        `formatting hook found in ${relative(repoPath, p)}`,
      ]);
    }
  }
  return makeResult('FAIL', 0, ['no formatter configuration found']);
}

// ---------------------------------------------------------------------------
// detectTypeSafety — category 2702 (method: detected, SBP-03)
//
// For TypeScript projects: PASS if tsconfig.json has strict or noImplicitAny;
// WARN if tsconfig exists without those flags; FAIL if no typed-language config.
// Also checks mypy, pyright (Python) and sorbet (Ruby).
//
// For Python projects without a mypy/pyright config: samples up to 20 .py files
// and measures what fraction of `def` signatures carry return-type annotations
// (`-> T:`). Thresholds:
//   ≥ 60% annotated → PASS  (well-typed without a formal config)
//   ≥ 25% annotated → WARN  (some typing, but not enforced)
//   <  25%          → FAIL  (essentially untyped)
// py.typed marker (PEP 561) also counts as PASS.
// ---------------------------------------------------------------------------

const TYPE_SAFETY_CONFIGS = [
  'mypy.ini',
  '.mypy.ini',
  'pyrightconfig.json',
  'sorbet',
];

const TSCONFIG_STRICT_RX = /"strict"\s*:\s*true|"noImplicitAny"\s*:\s*true/;

// Matches any `def name(...):` line (with or without return annotation).
const PY_DEF_RX = /^\s*(?:async\s+)?def\s+\w+\s*\(/;
// Matches `def name(...) -> Something:` (has a return annotation).
const PY_DEF_ANNOTATED_RX = /^\s*(?:async\s+)?def\s+\w+\s*\(.*\)\s*->/;

function samplePythonAnnotationRatio(repoPath: string): number | null {
  const pyFiles = iterFiles(repoPath, ['*.py']).slice(0, 20);
  if (pyFiles.length === 0) return null;

  let totalDefs = 0;
  let annotatedDefs = 0;
  for (const f of pyFiles) {
    const raw = readTextSafe(f);
    if (raw === null) continue;
    for (const line of raw.split('\n')) {
      if (PY_DEF_RX.test(line)) {
        totalDefs++;
        if (PY_DEF_ANNOTATED_RX.test(line)) annotatedDefs++;
      }
    }
  }
  if (totalDefs === 0) return null;
  return annotatedDefs / totalDefs;
}

export function detectTypeSafety(
  repoPath: string,
  params?: unknown
): ReturnType<typeof makeResult> {
  const p = params as { pass_at?: number; warn_at?: number } | undefined;
  const passAt = p?.pass_at ?? 0.6;
  const warnAt = p?.warn_at ?? 0.25;
  // Check for mypy.ini / pyrightconfig.json / sorbet
  const pyTyping = iterFiles(repoPath, TYPE_SAFETY_CONFIGS);
  if (pyTyping.length) {
    const names = pyTyping.map((p) => basename(p)).sort();
    return makeResult(
      'PASS',
      names.length,
      names.map((n) => `type-safety config found: ${n}`)
    );
  }
  // Check pyproject.toml for [tool.mypy]
  const pyprojects = iterFiles(repoPath, ['pyproject.toml']);
  for (const p of pyprojects) {
    const content = readTextSafe(p);
    if (content !== null && /^\[tool\.mypy\]/m.test(content)) {
      return makeResult('PASS', 1, [
        `type-safety config found in ${relative(repoPath, p)} ([tool.mypy])`,
      ]);
    }
  }
  // Check for PEP 561 py.typed marker (typed package declaration)
  const pyTypedFiles = iterFiles(repoPath, ['py.typed']);
  if (pyTypedFiles.length) {
    return makeResult('PASS', pyTypedFiles.length, [
      `py.typed marker found (PEP 561 typed package): ${pyTypedFiles.map((p) => relative(repoPath, p)).join(', ')}`,
    ]);
  }
  // Check tsconfig.json for strict / noImplicitAny
  const tsconfigs = iterFiles(repoPath, ['tsconfig.json', 'tsconfig.*.json']);
  if (tsconfigs.length) {
    const strictConfigs: string[] = [];
    for (const p of tsconfigs) {
      const content = readTextSafe(p);
      if (content !== null && TSCONFIG_STRICT_RX.test(content)) {
        strictConfigs.push(relative(repoPath, p));
      }
    }
    if (strictConfigs.length) {
      return makeResult(
        'PASS',
        strictConfigs.length,
        strictConfigs.map((n) => `strict TypeScript config: ${n}`)
      );
    }
    // tsconfig exists but no strict flags
    return makeResult('WARN', 0, [
      `tsconfig.json found but strict / noImplicitAny not enabled (${tsconfigs.map((p) => relative(repoPath, p)).join(', ')})`,
    ]);
  }
  // No formal type-safety config found — sample Python annotation coverage
  const ratio = samplePythonAnnotationRatio(repoPath);
  if (ratio !== null) {
    const pct = Math.round(ratio * 100);
    if (ratio >= passAt) {
      return makeResult('PASS', pct, [
        `${pct}% of Python function signatures carry return-type annotations (no mypy/pyright config, but well-typed)`,
      ]);
    }
    if (ratio >= warnAt) {
      return makeResult('WARN', pct, [
        `${pct}% of Python function signatures carry return-type annotations — some typing present but not enforced by a type checker`,
      ]);
    }
    return makeResult('FAIL', pct, [
      `${pct}% of Python function signatures carry return-type annotations — project appears essentially untyped`,
    ]);
  }
  return makeResult('FAIL', 0, ['no type-safety configuration found']);
}

// ---------------------------------------------------------------------------
// detectCiCd — category 2703 (method: detected, SBP-04)
//
// PASS if any recognised CI/CD pipeline config file or directory is present.
// Uses iterFiles with bare filename patterns (stripped of path components)
// since _base.ts's iterFiles uses `find -name` (filename only, not path).
// For files in known subdirectories (.github/workflows, .circleci) we match
// the filename and then verify the parent directory in the result path.
// ---------------------------------------------------------------------------

// Root-level named CI config files come from the canonical platform list.
// Filename patterns that live inside known CI subdirectories — we find all
// .yml/.yaml and filter by path below.
const CICD_SUBDIR_FILENAMES = ['*.yml', '*.yaml'];

export function detectCiCd(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  // Check root-level named CI files (Jenkinsfile, .gitlab-ci.yml, etc.)
  const found = iterFiles(repoPath, CI_FILES);
  if (found.length) {
    const names = [...new Set(found.map((p) => relative(repoPath, p)))].sort();
    return makeResult(
      'PASS',
      names.length,
      names.map((n) => `CI/CD config found: ${n}`)
    );
  }
  // Check workflow files inside known CI directories (.github/workflows,
  // .circleci, .azure-pipelines, .buildkite, .drone, .teamcity) plus the
  // Azure DevOps `pipelines/` convention.
  const yamlFiles = iterFiles(repoPath, CICD_SUBDIR_FILENAMES);
  const ciFiles = yamlFiles.filter((p) => {
    const rel = relative(repoPath, p);
    return (
      isCiWorkflowPath(rel) ||
      rel.startsWith('pipelines/') ||
      rel.startsWith('pipelines\\')
    );
  });
  if (ciFiles.length) {
    const names = ciFiles.map((p) => relative(repoPath, p)).sort();
    return makeResult(
      'PASS',
      names.length,
      names.map((n) => `CI/CD workflow found: ${n}`)
    );
  }
  return makeResult('FAIL', 0, ['no CI/CD pipeline configuration found']);
}

// ---------------------------------------------------------------------------
// detectExceptClauseDefect — category 2706 (method: detected)
//
// Python-2 multi-exception clause: `except A, B:` is a SyntaxError on Py3.
// Excludes the valid `except E as name:` and `except (A, B):` forms.
// ---------------------------------------------------------------------------

// Matches `except A, B:` and `except A, B, C:` (two or more comma-separated names).
// The two-name case is a subset, so no regression against the original pattern.
// Known limitation: matches inside string literals can still false-positive (no parser; acceptable for a detected heuristic).
const PY2_EXCEPT = /except\s+[A-Za-z_][\w.]*(\s*,\s*[A-Za-z_][\w.]*)+\s*:/;

export function detectExceptClauseDefect(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  // Belt-and-braces with the applies_when topology.has_python gate: a repo
  // with no Python files must SKIP, not PASS on vacuous absence.
  if (iterFiles(repoPath, ['*.py']).length === 0) {
    return makeResult(
      'SKIP',
      null,
      ['no Python source files — except-clause check not applicable'],
      'detected'
    );
  }
  const hits = grep(repoPath, PY2_EXCEPT, ['**/*.py']);
  // Drop lines whose first non-whitespace character is `#` (Python comments).
  const realHits = hits.filter((h) => !/^\s*#/.test(h.text));
  if (realHits.length) {
    const ev = realHits.map((h) => `${h.file}:${h.line} ${h.text}`);
    return makeResult('FAIL', realHits.length, ev);
  }
  return makeResult('PASS', 0, ['no Python-2 except-clause syntax found']);
}

// ---------------------------------------------------------------------------
// detectLockfiles — category 2705 (method: detected)
//
// PASS if any recognised dependency lockfile is present.
// ---------------------------------------------------------------------------

const LOCKFILES = [
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'gradle.lockfile',
  'poetry.lock',
  'uv.lock',
  'Cargo.lock',
  'go.sum',
];

export function detectLockfiles(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  return (
    presencePass(repoPath, LOCKFILES, 'lock file present') ??
    makeResult('FAIL', 0, ['no dependency lock file found'])
  );
}

// ---------------------------------------------------------------------------
// detectErrorHandling — category 2704 (method: detected)
//
// Deterministic heuristic over catch/except blocks in source files.
//
// Algorithm:
//   For each Python / JS / TS / Java / Kotlin source file:
//     - Scan lines for catch/except block openers.
//     - A block is classified as "bad" (empty or unhandled) when the first
//       non-blank body line is ONLY `pass`, `{}`, a bare closing brace, or
//       when no log/raise/throw/return keyword appears within the next 4
//       lines of the opener.
//
// Note: Go is intentionally excluded — its `if err != nil` idiom does not
// use try/catch/except syntax, so Go files would contribute no signal.
//
// Scoring (over all catch blocks found across the repo):
//   bad_ratio = bad_count / total_count
//   bad_ratio >= 0.5  → FAIL
//   bad_ratio >= 0.1  → WARN
//   otherwise         → PASS (includes zero blocks found)
// ---------------------------------------------------------------------------

/** Lines that suggest the block does something useful. */
const HANDLED_RX =
  /\b(log|logger|logging|print|console\.(log|warn|error|debug)|raise|throw|re-?raise|return|traceback|sys\.exit|abort|panic)\b/i;

/** A bare except/catch opener in common languages. The optional leading `}`
 * covers K&R / Prettier style where `catch` shares a line with the closing
 * brace of the `try` block: `} catch (err) {`. */
const EXCEPT_OPENER_RX = /^\s*\}?\s*(except\b|catch\s*\(|catch\s*$)/;

/** Python `pass` or JS/TS/Java/Kotlin bare empty block signals. */
const EMPTY_BODY_RX = /^\s*(pass|}\s*$|{\s*}\s*)$/;

interface BlockSample {
  file: string;
  line: number;
  bad: boolean;
}

function analyseFile(repoPath: string, filePath: string): BlockSample[] {
  const src = readTextSafe(filePath);
  if (src === null) return [];
  const lines = src.split('\n');
  const samples: BlockSample[] = [];
  const rel = relative(repoPath, filePath);

  for (let i = 0; i < lines.length; i++) {
    if (!EXCEPT_OPENER_RX.test(lines[i])) continue;

    // Look at the next 4 body lines to determine if it is handled.
    const body = lines.slice(i + 1, i + 5).join('\n');
    const isEmptyFirst =
      lines[i + 1] !== undefined && EMPTY_BODY_RX.test(lines[i + 1]);
    const hasHandled = HANDLED_RX.test(body);

    const bad = isEmptyFirst || !hasHandled;
    samples.push({ file: rel, line: i + 1, bad });
  }

  return samples;
}

const SOURCE_GLOBS = [
  '*.py',
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.java',
  '*.kt',
];

export function detectErrorHandling(
  repoPath: string,
  params?: unknown
): ReturnType<typeof makeResult> {
  const p = params as { fail_at?: number; warn_at?: number } | undefined;
  const failAt = p?.fail_at ?? 0.5;
  const warnAt = p?.warn_at ?? 0.1;
  const files = iterFiles(repoPath, SOURCE_GLOBS);
  const allSamples: BlockSample[] = files.flatMap((f) =>
    analyseFile(repoPath, f)
  );

  if (allSamples.length === 0) {
    return makeResult('PASS', 0, [
      'no catch/except blocks found — nothing to assess',
    ]);
  }

  const badSamples = allSamples.filter((s) => s.bad);
  const badRatio = badSamples.length / allSamples.length;

  const evidence = badSamples
    .slice(0, 10)
    .map((s) => `${s.file}:${s.line} empty or unhandled catch/except block`);

  if (badRatio >= failAt) {
    return makeResult('FAIL', badSamples.length, [
      `${badSamples.length}/${allSamples.length} catch/except blocks are empty or unhandled (${Math.round(badRatio * 100)}%)`,
      ...evidence,
    ]);
  }
  if (badRatio >= warnAt) {
    return makeResult('WARN', badSamples.length, [
      `${badSamples.length}/${allSamples.length} catch/except blocks are empty or unhandled (${Math.round(badRatio * 100)}%) — mixed patterns`,
      ...evidence,
    ]);
  }
  return makeResult('PASS', allSamples.length - badSamples.length, [
    `${allSamples.length - badSamples.length}/${allSamples.length} catch/except blocks are properly handled`,
  ]);
}

// ---------------------------------------------------------------------------
// DETECTORS — maps each detected SBP category code to its function.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  2700: detectLinting, // SBP-01 linting configured
  2701: detectFormatting, // SBP-02 formatting automated
  2702: detectTypeSafety, // SBP-03 type safety enforced
  2703: detectCiCd, // SBP-04 CI/CD pipeline exists
  2704: detectErrorHandling, // SBP-06 error-handling consistency
  2705: detectLockfiles, // SBP-05 dependency lockfiles
  2706: detectExceptClauseDefect, // SBP-06 sibling: Python-2 except-clause syntax
};
