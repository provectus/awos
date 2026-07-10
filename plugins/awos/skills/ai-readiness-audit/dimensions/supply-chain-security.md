---
name: supply-chain-security
title: Supply Chain Security
description: Detects supply chain attack vulnerabilities in package dependencies — lockfile integrity, version pinning, quarantine periods, vulnerability scanning, and dependency bloat
severity: critical
depends-on: [project-topology]
---

# Supply Chain Security

Audits the project's resilience to supply chain attacks — compromised or malicious packages entering the dependency tree. Each transitive dependency is an implicit trust decision: the project trusts the maintainer, their CI, their npm/PyPI credentials, and every dependency _they_ pull in.

This dimension focuses exclusively on dependency supply chain risks. Related but distinct checks live elsewhere:

- **SBP-05** covers lockfile _presence_ and update automation _existence_ (Renovate/Dependabot configured)
- **AS-12 through AS-14** cover secrets exposure (`.env`, API keys, gitignore)

This dimension goes deeper: lockfiles committed to git with integrity hashes, version pinning discipline, recently published package detection (quarantine), dependency review gates, vulnerability scanning in CI, dependency override auditing, and attack surface from dependency bloat.

Uses the topology artifact to determine which package ecosystems (npm, pip, Go modules, Cargo, Maven/Gradle, etc.) are present and adapts checks accordingly.

## Checks

### SCS-01: Lockfiles are committed to version control

- **What:** Lockfiles exist AND are tracked by git, ensuring all developers and CI use identical resolved dependency trees
- **How:**
  1. Read the topology summary to identify package ecosystems in use
  2. For each ecosystem, identify the expected lockfile:
     - JS/TS: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`
     - Python: `poetry.lock`, `Pipfile.lock`, `uv.lock`, or `requirements.txt` with pinned versions (`==`)
     - Go: `go.sum`
     - Rust: `Cargo.lock`
     - Java/Kotlin (Gradle): `gradle.lockfile`, `*.lockfile` in `gradle/` directory
     - Ruby: `Gemfile.lock`
     - PHP: `composer.lock`
     - .NET: `packages.lock.json`
     - Elixir: `mix.lock`
     - Dart/Flutter: `pubspec.lock`
  3. Glob for these lockfiles at the repo root and in each service directory (for monorepos)
  4. For each detected lockfile, verify it is tracked in git: `git ls-files --error-unmatch <lockfile>` (exit code 0 = tracked)
  5. For monorepos: check each service directory's lockfile independently
- **Pass:** All detected lockfiles exist and are tracked in git
- **Warn:** Lockfiles exist but one or more are not tracked in git (present in `.gitignore` or simply untracked)
- **Fail:** No lockfiles found for a detected package ecosystem, OR lockfiles exist but none are tracked in git
- **Skip-When:** Topology shows no package ecosystem detected (e.g., pure infrastructure-as-code project with no application dependencies)
- **Severity:** critical
- **Category:** 2900

### SCS-02: Lockfiles contain integrity hashes

- **What:** Lockfiles include cryptographic integrity hashes (SHA-512, SHA-256) that verify downloaded packages match what was resolved, preventing tampering between resolution and installation
- **How:**
  1. For each lockfile found in SCS-01:
     - **npm (`package-lock.json`):** Check that `lockfileVersion` is 2 or 3. If `lockfileVersion` is 1, this is a FAIL — v1 does not support integrity hashes. Sample at least 5 registry dependency entries and verify each contains an `"integrity": "sha512-..."` or `"integrity": "sha256-..."` field.
     - **pnpm (`pnpm-lock.yaml`):** Sample at least 5 resolved package entries and check for `integrity:` fields
     - **yarn classic (`yarn.lock`):** Check for `integrity` fields on resolved entries
     - **yarn berry (v2+):** Check for `.yarnrc.yml` with `enableImmutableInstalls: true` or checksums in lockfile entries
     - **pip (`requirements.txt`):** Check for `--hash=sha256:...` annotations on dependency lines
     - **poetry (`poetry.lock`):** Check that the `[metadata]` table contains a `content-hash` key and that package entries contain `files` arrays with `hash` values
     - **Pipfile (`Pipfile.lock`):** JSON format inherently includes hashes — check that `"hashes"` arrays are non-empty on sampled entries
     - **Go (`go.sum`):** Inherently contains hashes (this is its entire purpose) — auto-PASS
     - **Rust (`Cargo.lock`):** Check for `checksum` fields on package entries
     - **Other ecosystems:** Check for ecosystem-specific hash mechanisms; if none exist, note the limitation
  2. Sample at least 5 registry dependency entries across the lockfile (not just the first 5) to verify hashes are consistently present
  3. **Exempt entries** that legitimately lack hashes (these are NOT registry packages and do not need integrity verification):
     - Local file references: `file:`, `link:` protocols in npm/yarn/pnpm
     - Workspace references: `workspace:` protocol in pnpm/yarn monorepos
     - Git references: `git+https://`, `git+ssh://` URLs
     - Path dependencies: `{ path = "../" }` in Cargo.toml
     - Editable installs: `-e` flag in pip requirements
  4. ALL registry-sourced dependency entries (those not matching exempt patterns above) must have integrity hashes. There are no other valid exceptions.
- **Pass:** All registry-sourced dependency entries in lockfiles contain integrity hashes
- **Fail:** Any registry-sourced dependency entry lacks an integrity hash, OR the lockfile format does not support hashes (e.g., npm `lockfileVersion: 1`), OR lockfile entries have empty or missing hash fields
- **Skip-When:** No lockfiles detected (SCS-01 is FAIL or SKIP), or the only detected ecosystem does not support integrity hashes in lockfiles
- **Severity:** high
- **Category:** 2901

### SCS-03: No permissive version ranges in dependency manifests

- **What:** Dependency versions use exact pinning — not wildcards, open-ended ranges, or caret/tilde ranges that allow silent resolution to compromised versions during install operations
- **How:**
  1. **JS/TS:** Read all `package.json` files (root + service directories). Extract `dependencies` and `devDependencies` entries. Classify each entry:
     - `"*"` (any version) — FAIL: completely unbounded
     - `">="` prefix without `"<"` upper bound (e.g., `">=2.0.0"`) — FAIL: open-ended range
     - `">"` prefix without upper bound — FAIL: open-ended range
     - Bare major ranges like `"1"` or `"1.x"` — FAIL: too broad
     - `"^"` prefix (e.g., `"^1.2.3"`) — WARN: allows minor+patch updates. Even with a committed lockfile, `npm install <new-package>` or `npm update` can silently re-resolve existing `^` deps to a newly published (potentially compromised) version, and the developer commits the updated lockfile without reviewing every changed line. Exact pinning (`"1.2.3"`) prevents this.
     - `"~"` prefix (e.g., `"~1.2.3"`) — WARN: allows patch updates. Same risk as `^` but narrower window.
     - Exact version (e.g., `"1.2.3"`) — good
     - URL/git/file references — exempt from this check
  2. **Python:** Read `requirements.txt`, `pyproject.toml` `[project.dependencies]` / `[tool.poetry.dependencies]`, `setup.py`, `setup.cfg`. Classify:
     - No version specifier at all (bare package name, e.g., `requests`) — FAIL: resolves to latest
     - `>=` without `<` or `<=` upper bound (e.g., `requests>=2.0`) — FAIL: open-ended
     - `~=` (compatible release, e.g., `~=2.28.0`) — WARN: allows patch updates, same re-resolution risk
     - `==` (exact pin) — good
  3. **Go:** `go.mod` uses exact versions by design — auto-PASS
  4. **Rust:** `Cargo.toml` — `"*"` is FAIL. Caret `^` (Rust default) — WARN when `Cargo.lock` is committed (same lockfile re-resolution risk as JS). Without committed `Cargo.lock` — FAIL.
  5. **Ruby:** `Gemfile` — `">="` without `"<"` constraint is FAIL. `"~>"` (pessimistic operator) — WARN.
  6. **Java/Kotlin:** `build.gradle.kts` / `build.gradle` / `pom.xml` — `"+"` (latest), `"latest.release"`, `"latest.integration"`, or `"[1.0,)"` (open-ended range) — FAIL. Dynamic version ranges like `"[1.0, 2.0)"` — WARN.
  7. Count total dependencies vs FAIL-classified vs WARN-classified.
- **Pass:** All dependencies use exact version pinning (0% flagged)
- **Warn:** No FAIL-classified ranges, but some dependencies use `^`/`~`/`~=`/`~>` ranges (lockfile provides partial protection but re-resolution risk remains during install/update operations)
- **Fail:** Any dependency uses `"*"`, `">="` without upper bound, bare name without version, or other unbounded range. Also FAIL if `^`/`~` is used without a committed lockfile (SCS-01 is not PASS).
- **Skip-When:** Topology shows no package manifests detected
- **Severity:** high
- **Category:** 2902

### SCS-04: No recently published dependency versions (quarantine check)

- **What:** All resolved dependency versions have been published for at least 7 days, reducing exposure to supply chain attacks that exploit the window between package compromise and community detection
- **How:**
  1. **JS/TS:** Parse the lockfile to extract the list of resolved direct dependencies and their exact versions (from `package.json` `dependencies` + `devDependencies` keys matched to lockfile resolutions). For up to 30 direct dependencies, run `npm view <package>@<version> time --json` and extract the publish timestamp for that specific version. Compare against the current date. Flag any version published less than 7 days ago.
  2. **Python:** For each pinned dependency in `poetry.lock`, `Pipfile.lock`, or `requirements.txt` (with `==` pins), query the PyPI JSON API: `curl -s https://pypi.org/pypi/<package>/<version>/json` and extract `.urls[0].upload_time_iso_8601`. Flag versions published less than 7 days ago. Sample up to 30 direct dependencies.
  3. **Go:** Check `go.sum` entries against `https://proxy.golang.org/<module>/@v/<version>.info` for timestamp. Sample up to 30 direct dependencies from `go.mod`.
  4. **Rust:** Query `https://crates.io/api/v1/crates/<crate>/<version>` for `created_at` timestamp. Sample up to 30 direct dependencies from `Cargo.toml`.
  5. **Other ecosystems:** Note the limitation if registry API is not easily queryable and SKIP for those ecosystems.
  6. **Performance guard:** If the project has more than 100 direct dependencies, sample the 30 most recently added (by checking `git log --diff-filter=A -p -- <manifest>` for recently added lines) plus any with suspicious characteristics (names within edit distance 1 of popular packages, very short generic names, or packages with zero/near-zero community adoption).
- **Pass:** All sampled dependency versions were published more than 7 days ago
- **Warn:** Unable to verify publish dates for a minority of sampled dependencies due to registry API limitations (e.g., private registry without timestamp API, rate-limited responses)
- **Fail:** Any sampled dependency version was published within the last 7 days, OR unable to verify publish dates for the majority of sampled dependencies
- **Skip-When:** No package ecosystem detected, or lockfiles are absent (SCS-01 FAIL — cannot determine exact resolved versions without lockfiles)
- **Severity:** critical
- **Category:** 2903

### SCS-05: Dependency review process enforces approval

- **What:** Dependency update PRs require human review before merging, preventing automated merging of potentially compromised updates
- **How:**
  1. **Renovate config:** Glob for `renovate.json`, `renovate.json5`, `.renovaterc`, `.renovaterc.json`, or check for a `"renovate"` key in `package.json`. If found, read the config and check:
     - `"automerge": true` at global/default level — flag as concern
     - `"automerge": true` scoped only to safe update types (e.g., `"matchUpdateTypes": ["pin", "digest"]` or `"matchUpdateTypes": ["patch"]` for trusted packages) — acceptable
     - `"automerge": false` or absence of `"automerge"` — good (Renovate defaults to no automerge)
  2. **Dependabot config:** Check `.github/dependabot.yml`. Dependabot does not auto-merge by default, but check for a companion GitHub Actions workflow in `.github/workflows/*.yml` that auto-approves and merges Dependabot PRs. Grep for patterns combining `dependabot` with `gh pr merge --auto`, `--auto-merge`, `approve`, or `auto-approve`. Flag if found.
  3. **CODEOWNERS:** Check for `CODEOWNERS` or `.github/CODEOWNERS`. Grep for entries covering lockfiles or manifests: patterns like `*lock*`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `go.sum`, `Cargo.lock`, `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`. Lockfile/manifest ownership adds a required reviewer gate for dependency changes.
  4. **Limitation note:** Branch protection rules (required reviewers, status checks) cannot be verified from repository files alone — they are configured in the GitHub/GitLab UI. Note this limitation in the evidence.
- **Pass:** Dependency update tool configured with automerge disabled (or restricted to safe types only), AND lockfiles/manifests have CODEOWNERS entries
- **Warn:** Dependency update tool configured with automerge disabled but no CODEOWNERS on lockfiles/manifests (or vice versa)
- **Fail:** Automerge enabled globally for dependency updates, OR auto-approve workflow detected for Dependabot PRs
- **Skip-When:** No dependency update automation detected (no Renovate or Dependabot config found). The absence of a dependency update strategy is already covered by SBP-05 — this check only evaluates the safety of automation that exists.
- **Severity:** high
- **Category:** 2904

### SCS-06: Vulnerability scanning in CI

- **What:** The CI/CD pipeline includes automated vulnerability scanning of dependencies, catching known CVEs before they reach production
- **How:**
  1. Read CI configuration files: `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `bitbucket-pipelines.yml`, `.circleci/config.yml`
  2. Grep for vulnerability scanning commands or tool references:
     - JS/Node.js: `npm audit`, `yarn audit`, `pnpm audit`
     - Python: `pip-audit`, `safety check`, `safety scan`
     - Go: `govulncheck`, `nancy`
     - Rust: `cargo audit`
     - Ruby: `bundle audit`, `bundler-audit`
     - Java/Kotlin: `dependency-check` (OWASP), `dependencyCheckAnalyze`
     - General/multi-ecosystem: `snyk test`, `snyk monitor`, `socket`, `trivy fs`, `trivy repo`, `grype`
  3. Also check for GitHub-native security:
     - `.github/workflows/` containing `actions/dependency-review-action`
     - Presence of `.github/SECURITY.md` mentioning automated scanning (weak signal — only supplementary)
  4. Determine if the scanning step is **blocking** (fails the pipeline) vs **advisory** (runs but does not block):
     - Look for severity threshold flags: `--audit-level=critical`, `--audit-level=high`, `--severity-threshold`
     - Check if the step uses `continue-on-error: true` or `|| true` (advisory only)
     - Check if it runs on PRs (blocking) vs only on schedule (advisory)
- **Pass:** Vulnerability scanning runs in CI on PRs and is blocking (fails the pipeline on high/critical vulnerabilities)
- **Warn:** Vulnerability scanning exists in CI but is advisory only (does not fail the pipeline), OR scanning runs only in a scheduled workflow (not on every PR)
- **Fail:** No vulnerability scanning detected in any CI configuration
- **Skip-When:** No CI configuration files found (CI absence is already flagged by SBP-04)
- **Severity:** critical
- **Category:** 2905

### SCS-07: Dependency overrides are reviewed and justified

- **What:** Dependency version overrides (mechanisms that force specific versions of transitive dependencies) are tracked, minimal, and justified — present overrides are surfaced for human review (freshness/CVE status is not verified offline)
- **How:**
  1. Check for override mechanisms in each ecosystem:
     - **npm:** `"overrides"` field in `package.json`
     - **yarn:** `"resolutions"` field in `package.json`
     - **pnpm:** `"pnpm": { "overrides": {} }` in `package.json`
     - **pip:** `--constraint` files referenced in requirements, or `constraint` configuration in `pip.conf`
     - **Maven:** `<dependencyManagement>` section in `pom.xml` that overrides transitive dependency versions
     - **Gradle:** `configurations.all { resolutionStrategy { force(...) } }` or `constraints` blocks in `build.gradle.kts` / `build.gradle`
     - **Rust:** `[patch]` section in `Cargo.toml`
     - **Ruby:** `Bundler.setup` overrides or explicit version forcing in `Gemfile`
  2. If overrides exist:
     - Count the total number of overridden packages
     - Check whether each override pins to a specific version or uses a range
     - Check whether overrides have documented justification for why they exist. Where justification lives depends on the manifest format:
       - **Comment-capable formats** (TOML, Ruby, YAML, Gradle Kotlin/Groovy): inline comments alongside the override (e.g., `# CVE-2024-1234 fix`)
       - **JSON formats** (`package.json`): JSON does not support comments per RFC 8259 — justification should live in adjacent documentation (ADR, security notes, PR description, or a dedicated `overrides.md` / `DEPENDENCY_DECISIONS.md` file)
  3. If no overrides exist, this is a neutral signal — auto-PASS (overrides are not required, just need to be safe when present)
- **Pass:** No dependency overrides exist, OR overrides exist and all have documented justification (inline comments for comment-capable formats, or adjacent documentation for JSON manifests)
- **Warn:** Overrides exist but lack documented justification, or the number of overrides is high (10+ packages), suggesting possible maintenance debt
- **Fail:** Overrides use permissive ranges (`*`, `>=`), OR overrides reference git URLs or arbitrary tarballs without explanation
- **Skip-When:** Topology shows no package manifests detected
- **Severity:** high
- **Category:** 2906

### SCS-08: Dependency count and attack surface

- **What:** The project's dependency tree is not excessively bloated — each transitive dependency is an additional attack surface node that must be trusted, maintained, and monitored
- **How:**
  1. **JS/TS:** Count direct dependencies from `package.json` (`dependencies` + `devDependencies` key counts). Count total resolved packages from the lockfile (unique package entries in `package-lock.json` under `packages`, or entries in `pnpm-lock.yaml` / `yarn.lock`). Compute the ratio: `total / direct`. A healthy JS project typically has a ratio under 15:1. Flag if total transitive count exceeds 1000.
  2. **Python:** Count direct dependencies from `requirements.txt` or `pyproject.toml` `[project.dependencies]`. If a fully resolved lockfile exists (`poetry.lock`, `Pipfile.lock`), count total packages. Typical healthy ratio is under 5:1. Flag if total exceeds 200.
  3. **Go:** Count `require` directives in `go.mod` (direct) vs total entries in `go.sum` (includes transitive + checksum pairs, so divide by 2 for approximate package count). Typical healthy ratio under 5:1. Flag if total exceeds 100.
  4. **Rust:** Count `[dependencies]` in `Cargo.toml` (direct) vs `[[package]]` entries in `Cargo.lock` (total). Typical healthy ratio under 10:1. Flag if total exceeds 500.
  5. For monorepos: assess each service independently, but note shared dependencies across services as a positive signal (shared deps reduce total unique attack surface across the organization).
- **Pass:** Dependency ratio is within healthy range for the ecosystem, and total dependency count is reasonable for the project's complexity
- **Warn:** Dependency ratio is 1.5x–2x the healthy range for the ecosystem, or total transitive count approaches ecosystem-specific thresholds
- **Fail:** Dependency ratio exceeds 2x the healthy range, or total transitive dependency count exceeds ecosystem thresholds (1000 JS / 200 Python / 100 Go / 500 Rust)
- **Skip-When:** Topology shows no package ecosystem detected, or lockfile is absent (cannot count transitive dependencies without a resolved lockfile)
- **Severity:** medium
- **Category:** 2907
