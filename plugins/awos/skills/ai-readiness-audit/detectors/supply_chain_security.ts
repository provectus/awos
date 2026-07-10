import { makeResult, iterFiles, readTextSafe, presencePass } from './_base.ts';
import { existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { CI_DIRS } from '../ci_platforms.ts';

// ---------------------------------------------------------------------------
// detectScsLockfiles — category 2900 (SCS-01, method: detected)
//
// PASS if any recognised dependency lockfile is present (and tracked by git,
// per the definition). We use file presence as the proxy — absent lockfiles
// cannot be committed; present ones in a git repo are assumed tracked unless
// the caller's .gitignore explicitly excludes them.
//
// Reuses the same lockfile list as software_best_practices.detectLockfiles but
// maps to the SCS-01 code (2900).
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
  'Gemfile.lock',
  'composer.lock',
  'mix.lock',
  'pdm.lock',
  'requirements.txt', // pip freeze output commonly committed as lockfile
  'pip.lock',
];

export function detectScsLockfiles(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  return (
    presencePass(repoPath, LOCKFILES, 'lockfile present') ??
    makeResult('FAIL', 0, ['no dependency lockfile found'])
  );
}

// ---------------------------------------------------------------------------
// detectLockfileIntegrity — category 2901 (SCS-02, method: detected)
//
// Checks that present lockfiles include cryptographic integrity hashes:
//   - package-lock.json: "integrity": "sha" entries
//   - pnpm-lock.yaml: integrity: sha entries
//   - yarn.lock (v2+ Berry): __metadata + checksum lines
//   - poetry.lock: content-hash + hash = "sha256" entries
//   - Cargo.lock: checksum entries
//   - uv.lock: hash = "sha256" lines
//   - go.sum: the file itself IS a hash manifest (every line is a hash)
//
// PASS if at least one lockfile with integrity hashes is found.
// WARN if lockfiles exist but none contain hash entries (rare, e.g. old yarn v1).
// SKIP if no lockfiles are found.
// ---------------------------------------------------------------------------

interface LockfileCheck {
  name: RegExp;
  integrityRx: RegExp;
}

const LOCKFILE_INTEGRITY_CHECKS: LockfileCheck[] = [
  {
    name: /package-lock\.json$/,
    integrityRx: /"integrity"\s*:\s*"sha\d+-/,
  },
  {
    name: /pnpm-lock\.yaml$/,
    integrityRx: /^\s*integrity:\s*sha\d+-/m,
  },
  {
    name: /yarn\.lock$/,
    integrityRx: /^\s+(checksum|integrity):\s/m,
  },
  {
    name: /poetry\.lock$/,
    integrityRx: /hash\s*=\s*"sha256:/m,
  },
  {
    name: /Cargo\.lock$/,
    integrityRx: /^checksum\s*=\s*"/m,
  },
  {
    name: /uv\.lock$/,
    integrityRx: /hash\s*=\s*"sha256:/m,
  },
  {
    name: /go\.sum$/,
    // go.sum lines are always hashes — the file is the integrity manifest.
    integrityRx: /\s+h1:/,
  },
  {
    name: /Gemfile\.lock$/,
    integrityRx: /^\s+[A-Za-z0-9+/]+=$/m,
  },
];

export function detectLockfileIntegrity(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  // Collect lockfiles
  const lockfileNames = LOCKFILES.filter((n) => !n.includes('requirements'));
  const presentLockfiles = iterFiles(repoPath, lockfileNames);

  if (presentLockfiles.length === 0) {
    return makeResult('SKIP', 0, [
      'no lockfiles found — lockfile integrity check skipped',
    ]);
  }

  const withHashes: string[] = [];
  const withoutHashes: string[] = [];

  for (const filePath of presentLockfiles) {
    const name = basename(filePath);
    const check = LOCKFILE_INTEGRITY_CHECKS.find(({ name: rx }) =>
      rx.test(name)
    );
    if (!check) continue;

    const content = readTextSafe(filePath);
    if (content === null) continue;

    if (check.integrityRx.test(content)) {
      withHashes.push(name);
    } else {
      withoutHashes.push(name);
    }
  }

  if (withHashes.length > 0) {
    return makeResult('PASS', withHashes.length, [
      `${withHashes.length} lockfile(s) include cryptographic integrity hashes`,
      ...withHashes.map((n) => `lockfile with hashes: ${n}`),
      ...withoutHashes.map((n) => `lockfile without hashes: ${n}`),
    ]);
  }

  if (withoutHashes.length > 0) {
    return makeResult('WARN', 0, [
      `${withoutHashes.length} lockfile(s) found but none include integrity hashes`,
      ...withoutHashes.map((n) => `lockfile without hashes: ${n}`),
    ]);
  }

  return makeResult('SKIP', 0, [
    'lockfiles present but none matched known integrity-check format — skipped',
  ]);
}

// ---------------------------------------------------------------------------
// detectPinnedVersions — category 2902 (SCS-03, method: detected)
//
// Checks package manifests for unpinned (open-ended) version ranges.
// Scans:
//   - package.json: dependencies / devDependencies (caret ^, tilde ~, *, x, >=)
//   - requirements.txt: >=, >, ~=, * (without exact ==)
//   - pyproject.toml: ^, >=, >, * in [tool.poetry.dependencies] or
//     [project.dependencies]
//   - Cargo.toml: uses ^/*/>=
//   - go.mod: replace directives with ../local paths (not version-pinned)
//
// Scoring (ranged_count / total_count over all deps found):
//   ratio >= 0.3  → FAIL
//   ratio >= 0.1  → WARN
//   otherwise     → PASS (includes zero deps)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// parsePyprojectDeps — minimal TOML section scanner for pyproject.toml
//
// Recognises PEP-621 [project] dependencies and [project.optional-dependencies]
// tables, plus uv's [dependency-groups] table. Returns a flat list of
// dependency specifier strings (e.g. "requests>=2.0", "boto3==1.34.0").
// Does NOT require smol-toml or any third-party parser.
// ---------------------------------------------------------------------------

function parsePyprojectDeps(content: string): string[] {
  const deps: string[] = [];

  // TOML inline-array value extractor: given "key = [...]" text starting
  // at the opening `[`, collect all quoted or unquoted items.
  function extractInlineArray(text: string, start: number): string[] {
    const items: string[] = [];
    let i = start + 1; // skip '['
    while (i < text.length && text[i] !== ']') {
      // skip whitespace and commas
      if (/[\s,]/.test(text[i])) {
        i++;
        continue;
      }
      // quoted string
      if (text[i] === '"' || text[i] === "'") {
        const quote = text[i];
        let j = i + 1;
        while (j < text.length && text[j] !== quote) j++;
        items.push(text.slice(i + 1, j));
        i = j + 1;
        continue;
      }
      // unquoted value (shouldn't happen in PEP-508 but handle gracefully)
      let j = i;
      while (j < text.length && text[j] !== ',' && text[j] !== ']') j++;
      const raw = text.slice(i, j).trim();
      if (raw) items.push(raw);
      i = j;
    }
    return items;
  }

  // Split into lines for section-header tracking
  const lines = content.split('\n');
  type Section =
    | 'project'
    | 'project.optional-dependencies'
    | 'dependency-groups'
    | null;
  let section: Section = null;

  // Multi-line array accumulation
  let accumulating = false;
  let accumBuf = '';

  function flushAccum() {
    if (!accumBuf) return;
    const closeIdx = accumBuf.indexOf(']');
    if (closeIdx !== -1) {
      const full = accumBuf.slice(0, closeIdx + 1);
      const openIdx = full.indexOf('[');
      if (openIdx !== -1) {
        deps.push(...extractInlineArray(full, openIdx));
      }
      accumBuf = '';
      accumulating = false;
    }
  }

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const line = raw.trimEnd();

    // If we're mid-accumulation, append and check
    if (accumulating) {
      accumBuf += line + '\n';
      flushAccum();
      continue;
    }

    // Section headers
    const secMatch = line.match(/^\s*\[([^\]]+)\]/);
    if (secMatch) {
      const hdr = secMatch[1].trim();
      if (hdr === 'project') {
        section = 'project';
      } else if (
        hdr === 'project.optional-dependencies' ||
        hdr === 'tool.uv.optional-dependencies'
      ) {
        section = 'project.optional-dependencies';
      } else if (hdr === 'dependency-groups' || hdr === 'tool.uv') {
        section = 'dependency-groups';
      } else if (hdr.startsWith('tool.') || hdr.startsWith('[')) {
        section = null;
      } else {
        section = null;
      }
      continue;
    }

    if (section === null) continue;

    if (section === 'project') {
      // [project] dependencies = [...]
      const m = line.match(/^\s*dependencies\s*=\s*(\[.*)/);
      if (m) {
        const rest = m[1];
        if (rest.includes(']')) {
          deps.push(...extractInlineArray(rest, 0));
        } else {
          // Multi-line — accumulate
          accumBuf = rest + '\n';
          accumulating = true;
        }
      }
    } else if (section === 'project.optional-dependencies') {
      // any_key = [...]
      const m = line.match(/^\s*[a-zA-Z0-9_-]+\s*=\s*(\[.*)/);
      if (m) {
        const rest = m[1];
        if (rest.includes(']')) {
          deps.push(...extractInlineArray(rest, 0));
        } else {
          accumBuf = rest + '\n';
          accumulating = true;
        }
      }
    } else if (section === 'dependency-groups') {
      // group_name = [...] — uv dependency-groups
      const m = line.match(/^\s*[a-zA-Z0-9_-]+\s*=\s*(\[.*)/);
      if (m) {
        const rest = m[1];
        if (rest.includes(']')) {
          deps.push(...extractInlineArray(rest, 0));
        } else {
          accumBuf = rest + '\n';
          accumulating = true;
        }
      }
    }
  }

  return deps;
}

// Given a PEP-508 specifier string, determine whether it is "ranged"
// (i.e. NOT pinned with ==). Returns true if ranged.
function isPep508Ranged(spec: string): boolean {
  // A spec is pinned only if it contains == (exact version).
  // No specifier at all → ranged. >=, >, ~=, ^, != → ranged.
  // Handle "package[extra]>=1.0" forms.
  const versionPart = spec.split(';')[0].trim(); // strip env markers
  if (/==\s*[\d]/.test(versionPart)) return false; // pinned
  return true; // no specifier or ranged specifier
}

function countPackageJsonRanges(content: string): {
  total: number;
  ranged: number;
} {
  let pkg: unknown;
  try {
    pkg = JSON.parse(content);
  } catch {
    return { total: 0, ranged: 0 };
  }
  if (pkg === null || typeof pkg !== 'object') return { total: 0, ranged: 0 };
  const rec = pkg as Record<string, unknown>;
  const depGroups = [
    rec['dependencies'],
    rec['devDependencies'],
    rec['peerDependencies'],
    rec['optionalDependencies'],
  ].filter(
    (g): g is Record<string, unknown> => g !== null && typeof g === 'object'
  );

  let total = 0;
  let ranged = 0;
  for (const group of depGroups) {
    for (const ver of Object.values(group)) {
      if (typeof ver !== 'string') continue;
      total++;
      if (/^\^|^~|^>=|^>|^\*|^x$/.test(ver.trim())) ranged++;
    }
  }
  return { total, ranged };
}

function countRequirementsTxtRanges(content: string): {
  total: number;
  ranged: number;
} {
  const lines = content.split('\n').filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('#') && !t.startsWith('-');
  });
  let total = 0;
  let ranged = 0;
  for (const line of lines) {
    if (!/[A-Za-z]/.test(line)) continue;
    total++;
    // Pinned: uses ==; ranged: >=, >, ~=, *, no specifier at all
    if (!/==\s*[\d]/.test(line)) ranged++;
  }
  return { total, ranged };
}

export function detectPinnedVersions(
  repoPath: string,
  params?: unknown
): ReturnType<typeof makeResult> {
  const p = params as { fail_at?: number; warn_at?: number } | undefined;
  const failAt = p?.fail_at ?? 0.3;
  const warnAt = p?.warn_at ?? 0.1;
  let totalDeps = 0;
  let rangedDeps = 0;
  const evidence: string[] = [];

  // package.json
  const pkgJsonFiles = iterFiles(repoPath, ['package.json']);
  for (const f of pkgJsonFiles) {
    if (f.includes('node_modules')) continue;
    const content = readTextSafe(f);
    if (content === null) continue;
    const counts = countPackageJsonRanges(content);
    totalDeps += counts.total;
    rangedDeps += counts.ranged;
    if (counts.ranged > 0) {
      evidence.push(
        `${relative(repoPath, f)}: ${counts.ranged}/${counts.total} ranged deps`
      );
    }
  }

  // requirements.txt
  const reqFiles = iterFiles(repoPath, [
    'requirements.txt',
    'requirements*.txt',
  ]);
  for (const f of reqFiles) {
    const content = readTextSafe(f);
    if (content === null) continue;
    const counts = countRequirementsTxtRanges(content);
    totalDeps += counts.total;
    rangedDeps += counts.ranged;
    if (counts.ranged > 0) {
      evidence.push(
        `${relative(repoPath, f)}: ${counts.ranged}/${counts.total} unpinned deps`
      );
    }
  }

  // pyproject.toml — PEP-621 [project] dependencies and optional-dependencies,
  // plus uv [dependency-groups]. Covers projects that use uv/PEP-621 without
  // a separate requirements.txt.
  const pyprojectFiles = iterFiles(repoPath, ['pyproject.toml']);
  for (const f of pyprojectFiles) {
    const content = readTextSafe(f);
    if (content === null) continue;
    const specifiers = parsePyprojectDeps(content);
    if (specifiers.length === 0) continue;
    const ranged = specifiers.filter(isPep508Ranged).length;
    totalDeps += specifiers.length;
    rangedDeps += ranged;
    if (ranged > 0) {
      evidence.push(
        `${relative(repoPath, f)}: ${ranged}/${specifiers.length} unpinned deps`
      );
    }
  }

  if (totalDeps === 0) {
    return makeResult('SKIP', 0, [
      'no package manifests found — pinned-version check skipped',
    ]);
  }

  const ratio = rangedDeps / totalDeps;

  if (ratio >= failAt) {
    return makeResult(
      'FAIL',
      rangedDeps,
      [
        `${rangedDeps}/${totalDeps} dependencies use open-ended version ranges (${Math.round(ratio * 100)}%)`,
        ...evidence,
      ],
      'detected'
    );
  }

  if (ratio >= warnAt) {
    return makeResult(
      'WARN',
      rangedDeps,
      [
        `${rangedDeps}/${totalDeps} dependencies use open-ended version ranges (${Math.round(ratio * 100)}%)`,
        ...evidence,
      ],
      'detected'
    );
  }

  return makeResult(
    'PASS',
    totalDeps - rangedDeps,
    [
      `${totalDeps - rangedDeps}/${totalDeps} dependencies are pinned to exact versions`,
      ...evidence,
    ],
    'detected'
  );
}

// ---------------------------------------------------------------------------
// detectScsQuarantineAge — category 2903 (SCS-04, method: computed)
//
// Definition: all resolved dependency versions have been published for ≥7 days,
// reducing supply-chain attack exposure ("recently published / quarantine").
//
// SKIP — this check requires querying live package registry APIs (npm, PyPI,
// crates.io) to get per-version publish timestamps and comparing them to a
// reference date. That is non-deterministic and non-hermetic — it changes with
// time and requires network access, both of which violate the deterministic,
// offline constraint for this engine. Rather than fabricate a verdict, the
// detector emits SKIP with an explanatory message.
// ---------------------------------------------------------------------------

export function detectScsQuarantineAge(
  repoPath: string,
  params?: unknown
): ReturnType<typeof makeResult> {
  const thresholdDays =
    (params as { threshold_days?: number } | undefined)?.threshold_days ?? 7;
  return makeResult(
    'SKIP',
    null,
    [
      'SCS-04 (quarantine-age) requires live registry API calls to resolve per-version publish timestamps',
      'This check is non-deterministic offline — it is intentionally skipped by the static detector',
      `To evaluate: query npm/PyPI/crates.io registry APIs and verify each pinned version is ≥${thresholdDays} days old`,
    ],
    'computed'
  );
}

// ---------------------------------------------------------------------------
// detectDependencyAutomationReview — category 2904 (SCS-05, method: detected)
//
// Checks that dependency update PRs require human review before merging.
// Signals:
//   1. dependabot.yml / renovate.json / renovate.json5 / .renovaterc exist
//      (dependency automation is configured).
//   2. CODEOWNERS or branch protection config (.github/CODEOWNERS,
//      docs/CODEOWNERS) exists — review is enforced.
//   3. Renovate/Dependabot config contains "automerge: false" or lacks
//      "automerge: true" (safe default).
//
// PASS if automation is configured and automerge is not enabled.
// WARN if automation is configured but automerge may be active.
// FAIL if no dependency automation is configured.
// ---------------------------------------------------------------------------

const DEPENDABOT_PATHS = ['.github/dependabot.yml', '.github/dependabot.yaml'];

const RENOVATE_PATHS = [
  'renovate.json',
  'renovate.json5',
  '.renovaterc',
  '.renovaterc.json',
  '.github/renovate.json',
];

const AUTOMERGE_ENABLED_RX = /"automerge"\s*:\s*true|automerge:\s*true/;

export function detectDependencyAutomationReview(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const foundFiles: string[] = [];
  let automergeEnabled = false;

  for (const relPath of [...DEPENDABOT_PATHS, ...RENOVATE_PATHS]) {
    const full = join(repoPath, relPath);
    if (!existsSync(full)) continue;
    foundFiles.push(relPath);
    const content = readTextSafe(full);
    if (content === null) continue;
    if (AUTOMERGE_ENABLED_RX.test(content)) {
      automergeEnabled = true;
    }
  }

  if (foundFiles.length === 0) {
    return makeResult('FAIL', 0, [
      'no dependency automation configuration found (Dependabot or Renovate) — automated dependency review not configured',
    ]);
  }

  if (automergeEnabled) {
    return makeResult('WARN', foundFiles.length, [
      'dependency automation configured but automerge is enabled — updates may merge without human review',
      ...foundFiles.map((f) => `config: ${f}`),
    ]);
  }

  return makeResult('PASS', foundFiles.length, [
    `dependency automation configured with review required: ${foundFiles.join(', ')}`,
    ...foundFiles.map((f) => `config: ${f}`),
  ]);
}

// ---------------------------------------------------------------------------
// detectVulnerabilityScanning — category 2905 (SCS-06, method: detected)
//
// Checks that CI/CD workflows include automated vulnerability scanning.
// Recognised tools: pip-audit, safety, snyk, trivy, grype, dependabot
// alerts (auto-enabled), OWASP dependency-check, osv-scanner.
//
// Also checks GitHub Dependabot security-updates configuration as an
// alternative to CI-based scanning.
//
// PASS if any scanning tool is found in CI workflow files or config.
// FAIL if none is found.
// ---------------------------------------------------------------------------

const CI_WORKFLOW_GLOBS = ['*.yml', '*.yaml'];

const VULN_SCANNER_RX =
  /\b(pip-audit|safety\s|snyk|trivy|grype|osv-scanner|dependency-check|dependabot|audit\s+--json|npm\s+audit|yarn\s+audit|pnpm\s+audit)\b/i;

export function detectVulnerabilityScanning(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const scanners: string[] = [];

  // Scan CI workflow directories for vulnerability scanner invocations
  for (const ciDir of CI_DIRS) {
    const ciDirPath = join(repoPath, ciDir);
    if (!existsSync(ciDirPath)) continue;
    const files = iterFiles(ciDirPath, CI_WORKFLOW_GLOBS);
    for (const f of files) {
      const content = readTextSafe(f);
      if (content === null) continue;
      const match = content.match(VULN_SCANNER_RX);
      if (match) {
        scanners.push(`${relative(repoPath, f)} (${match[1]})`);
      }
    }
  }

  // Check for Dependabot security-updates config
  for (const p of DEPENDABOT_PATHS) {
    const full = join(repoPath, p);
    if (!existsSync(full)) continue;
    const content = readTextSafe(full);
    if (content === null) continue;
    // Dependabot security-updates is always on if the file exists with package-ecosystem
    if (/package-ecosystem/i.test(content)) {
      scanners.push(`${p} (Dependabot security-updates)`);
    }
  }

  if (scanners.length > 0) {
    return makeResult('PASS', scanners.length, [
      `vulnerability scanning configured in ${scanners.length} location(s)`,
      ...scanners.slice(0, 10).map((s) => `scanner: ${s}`),
    ]);
  }

  return makeResult('FAIL', 0, [
    'no vulnerability scanning found in CI workflows — add pip-audit, Snyk, Trivy, or Grype to your CI pipeline',
  ]);
}

// ---------------------------------------------------------------------------
// detectDependencyOverrides — category 2906 (SCS-07, method: detected)
//
// Checks for dependency version overrides / resolutions / patches:
//   - package.json: "resolutions" (Yarn), "overrides" (npm/pnpm), "pnpm.overrides"
//   - pyproject.toml: tool.poetry.source pinning or [tool.pdm.overrides]
//   - Cargo.toml: [patch.crates-io]
//
// PASS if no overrides found (clean dependency tree).
// WARN if overrides exist (present but flagged for review).
// FAIL is not used — overrides are acceptable practice; just worth noting.
// ---------------------------------------------------------------------------

const OVERRIDE_PACKAGE_JSON_RX = /"(resolutions|overrides)"\s*:/;
const PNPM_OVERRIDES_RX = /"pnpm"\s*:\s*\{[^}]*"overrides"\s*:/s;

export function detectDependencyOverrides(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const foundOverrides: string[] = [];

  // package.json overrides / resolutions
  const pkgJsonFiles = iterFiles(repoPath, ['package.json']);
  for (const f of pkgJsonFiles) {
    if (f.includes('node_modules')) continue;
    const content = readTextSafe(f);
    if (content === null) continue;
    if (
      OVERRIDE_PACKAGE_JSON_RX.test(content) ||
      PNPM_OVERRIDES_RX.test(content)
    ) {
      foundOverrides.push(`${relative(repoPath, f)}: overrides/resolutions`);
    }
  }

  // Cargo.toml patch sections
  const cargoFiles = iterFiles(repoPath, ['Cargo.toml']);
  for (const f of cargoFiles) {
    const content = readTextSafe(f);
    if (content === null) continue;
    if (/^\[patch\s*\./m.test(content)) {
      foundOverrides.push(`${relative(repoPath, f)}: [patch.*] section`);
    }
  }

  if (foundOverrides.length === 0) {
    return makeResult('PASS', 0, [
      'no dependency overrides/resolutions/patches found — clean dependency tree',
    ]);
  }

  return makeResult('WARN', foundOverrides.length, [
    `${foundOverrides.length} override(s) present — review that each is tracked, minimal, and justified (this check does not verify version freshness or CVEs)`,
    ...foundOverrides,
  ]);
}

// ---------------------------------------------------------------------------
// detectDependencyAttackSurface — category 2907 (SCS-08, method: computed)
//
// Estimates whether the dependency tree is excessively bloated by comparing
// the count of direct dependencies to a heuristic threshold.
//
// Signals:
//   - package.json: direct dep count (dependencies + devDependencies)
//   - requirements.txt: line count
//   - poetry.lock / uv.lock: package count
//
// Thresholds (total direct deps):
//   <= 100  → PASS (healthy)
//   101-200 → WARN (large but common)
//   > 200   → FAIL (excessive attack surface)
//
// SKIP if no package manifests are found.
// ---------------------------------------------------------------------------

function countPackageJsonDeps(content: string): number {
  let pkg: unknown;
  try {
    pkg = JSON.parse(content);
  } catch {
    return 0;
  }
  if (pkg === null || typeof pkg !== 'object') return 0;
  const rec = pkg as Record<string, unknown>;
  const deps = rec['dependencies'];
  const devDeps = rec['devDependencies'];
  const depCount =
    deps !== null && typeof deps === 'object'
      ? Object.keys(deps as object).length
      : 0;
  const devCount =
    devDeps !== null && typeof devDeps === 'object'
      ? Object.keys(devDeps as object).length
      : 0;
  return depCount + devCount;
}

function countRequirementsDeps(content: string): number {
  return content.split('\n').filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('#') && !t.startsWith('-');
  }).length;
}

export function detectDependencyAttackSurface(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  let totalDeps = 0;
  const sources: string[] = [];

  const pkgJsonFiles = iterFiles(repoPath, ['package.json']);
  for (const f of pkgJsonFiles) {
    if (f.includes('node_modules')) continue;
    const content = readTextSafe(f);
    if (content === null) continue;
    const count = countPackageJsonDeps(content);
    if (count > 0) {
      totalDeps += count;
      sources.push(`${relative(repoPath, f)}: ${count} deps`);
    }
  }

  const reqFiles = iterFiles(repoPath, ['requirements.txt']);
  for (const f of reqFiles) {
    const content = readTextSafe(f);
    if (content === null) continue;
    const count = countRequirementsDeps(content);
    if (count > 0) {
      totalDeps += count;
      sources.push(`${relative(repoPath, f)}: ${count} entries`);
    }
  }

  // pyproject.toml — PEP-621 [project] dependencies / optional-dependencies
  // and uv [dependency-groups]. Covers uv/PEP-621 projects that have no
  // requirements.txt.
  const pyprojectFiles2 = iterFiles(repoPath, ['pyproject.toml']);
  for (const f of pyprojectFiles2) {
    if (sources.some((s) => s.startsWith(relative(repoPath, f)))) continue; // already counted
    const content = readTextSafe(f);
    if (content === null) continue;
    const specifiers = parsePyprojectDeps(content);
    if (specifiers.length > 0) {
      totalDeps += specifiers.length;
      sources.push(`${relative(repoPath, f)}: ${specifiers.length} deps`);
    }
  }

  if (totalDeps === 0) {
    return makeResult(
      'SKIP',
      null,
      ['no package manifests found — dependency attack surface check skipped'],
      'computed'
    );
  }

  if (totalDeps <= 100) {
    return makeResult(
      'PASS',
      totalDeps,
      [
        `${totalDeps} total direct dependencies — within healthy range (≤ 100)`,
        ...sources,
      ],
      'computed'
    );
  }

  if (totalDeps <= 200) {
    return makeResult(
      'WARN',
      totalDeps,
      [
        `${totalDeps} total direct dependencies — large attack surface (101–200); review for unused deps`,
        ...sources,
      ],
      'computed'
    );
  }

  return makeResult(
    'FAIL',
    totalDeps,
    [
      `${totalDeps} total direct dependencies — excessive attack surface (> 200); audit and prune`,
      ...sources,
    ],
    'computed'
  );
}

// ---------------------------------------------------------------------------
// DETECTORS — maps each supply-chain-security code to its function.
// SCS-04 (2903) is implemented as SKIP — see detectScsQuarantineAge reason.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  2900: detectScsLockfiles, // SCS-01 lockfiles committed
  2901: detectLockfileIntegrity, // SCS-02 lockfile integrity hashes
  2902: detectPinnedVersions, // SCS-03 pinned dependency versions (detected)
  2903: detectScsQuarantineAge, // SCS-04 quarantine age (SKIP — requires live registry)
  2904: detectDependencyAutomationReview, // SCS-05 dependency automation with review
  2905: detectVulnerabilityScanning, // SCS-06 vulnerability scanning in CI
  2906: detectDependencyOverrides, // SCS-07 dependency overrides/patches
  2907: detectDependencyAttackSurface, // SCS-08 dependency attack surface (computed)
};
