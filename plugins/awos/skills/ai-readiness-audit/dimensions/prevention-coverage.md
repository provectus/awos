---
name: prevention-coverage
title: Prevention Coverage
description: Whether the good state the other dimensions measure is protected against regression — per failure-mode cluster, is there a mechanical enforcement gate (pre-commit/CI/hook/scanner) or at least an agent-visible written rule?
severity: high
depends-on:
  [
    project-topology,
    application-security,
    supply-chain-security,
    software-best-practices,
    code-architecture,
    quality-assurance,
    ai-security,
    documentation,
  ]
---

# Prevention Coverage

Every other dimension measures **state**: is the repo in a good shape right now? This dimension measures **stability**: will it stay that way under continued AI code generation? In AI-driven development code is regenerated constantly, so any property not encoded in a mechanical gate or in agent-visible context is one regeneration away from regressing.

The dimension is organized into eight **clusters**. Each cluster groups source-dimension checks that share a failure mode (the `covers_checks` list on its enforcement category in `standards.toml`) and is scored by two checks:

- an **enforcement** check (`detected`, weight 3): a mechanism that runs mechanically blocks recurrence — a pre-commit/husky/lefthook gate, a CI check step, a server-side bot (Dependabot/Renovate), or an agent hook. Config that nothing runs is not enforcement (WARN).
- an **instruction** check (`judgment`, weight 2): the rule is written where AI agents will see it — root or nested CLAUDE.md, AGENTS.md, `.cursorrules`, `.github/copilot-instructions.md`, `.claude/rules/`, skill files. Verdicts must quote the passage; "the topic is mentioned somewhere" is a WARN, not a PASS.

From these two checks the engine derives the cluster's **tier** — `enforced` > `instructed` > `absent` (`pending` while judgment verdicts are outstanding) — and annotates every covered check in the other dimensions with it. Covered checks that PASS inside an `absent` cluster are reported as **unguarded passes**: they hold by convention only. This derived view (the prevention matrix in the report) is computed by the engine's linkage pass; the checks below are the only scored units.

The uniform grading rule for enforcement checks: **Pass** = an actively running mechanism (gate invocation found in pre-commit config, husky/lefthook scripts, lint-staged, a CI workflow step, agent hooks, or a server-side bot config); **Warn** = a relevant tool config exists in the repo but no gate invokes it; **Fail** = neither. Detection is grep-heuristic over gate surfaces — a tool named in a CI comment can false-positive; this matches the precision tier of the other detected checks (e.g. SCS-06).

## Checks

### PRV-01: Secret-scanning gate

- **What:** A secret scanner runs in pre-commit or CI, mechanically blocking committed credentials
- **How:**
  1. Build the gate surfaces: `.pre-commit-config.yaml`, `.husky/**`, `lefthook.yml`, `package.json` (`lint-staged`/`husky`/`simple-git-hooks` keys), CI workflow files, `.claude/settings.json` hooks.
  2. Search them for a secret-scanner invocation: `gitleaks`, `trufflehog`, `detect-secrets`, `git-secrets`, `ggshield`, `secretlint`.
  3. If none found, look for scanner config files (`.gitleaks.toml`, `.secrets.baseline`, `.ggshield.yaml`) — config without a gate is Warn.
- **Pass:** Scanner invoked from a gate surface
- **Warn:** Scanner config present but nothing invokes it
- **Fail:** No secret-scanning mechanism found
- **Severity:** medium
- **Category:** 3100

### PRV-02: Dependency risk automation

- **What:** Dependency risk is mechanically managed — vulnerability scanning in CI or an automated update bot
- **How:**
  1. Search CI workflow files for a vulnerability scanner (`npm|yarn|pnpm audit`, `pip-audit`, `safety`, `snyk`, `trivy`, `grype`, `osv-scanner`, `dependency-check`).
  2. Check for update-bot config: `.github/dependabot.yml`, `renovate.json` and variants. A bot counts as enforcement — it runs server-side without anyone invoking it.
- **Pass:** CI scanner step or update-bot config present
- **Warn:** Only a lockfile-maintenance config with no scanner and no CI audit
- **Fail:** Neither
- **Skip-When:** No package manifests detected (`topology.has_package_ecosystem` false)
- **Severity:** medium
- **Category:** 3101

### PRV-03: Static application-security testing gate

- **What:** SAST or security linting runs in CI or pre-commit, catching insecure patterns before merge
- **How:**
  1. Search gate surfaces for `semgrep`, `codeql` (incl. `github/codeql-action`), `bandit`, `brakeman`, `gosec`, `eslint-plugin-security`, `sonar` (cloud/qube/scanner), `checkmarx`, `fortify`.
  2. If none invoked, look for SAST config files (`.semgrep.yml`, `.semgrep/`, sonar project properties) — config without a gate is Warn.
- **Pass:** SAST tool invoked from a gate surface
- **Warn:** SAST config present but nothing invokes it
- **Fail:** No SAST mechanism found
- **Severity:** medium
- **Category:** 3102

### PRV-04: Code style gated

- **What:** A linter or formatter is gated — invoked from pre-commit/husky/lint-staged or run as a CI check step — not merely configured
- **How:**
  1. Search gate surfaces for a linter/formatter invocation: `eslint`, `prettier --check`, `ruff`, `flake8`, `pylint`, `black --check`, `golangci-lint`, `cargo fmt --check`, `cargo clippy`, or a `lint` script run from CI (`npm run lint` and package-manager variants).
  2. If none, check whether linter/formatter configs exist at all (the SBP-01/SBP-02 surface) — configured-but-not-gated is Warn.
- **Pass:** Linter or formatter invoked from a gate surface
- **Warn:** Linter/formatter configured but no gate invokes it
- **Fail:** No linting or formatting mechanism found
- **Severity:** medium
- **Category:** 3103

### PRV-05: Architecture boundaries gate

- **What:** Module-boundary rules are mechanically checked and invoked from a gate
- **How:**
  1. Look for boundary-rule config: `.dependency-cruiser.{js,cjs,mjs,json}`, `[importlinter]`/`[tool.importlinter]` in `setup.cfg`/`pyproject.toml`, ArchUnit (dependency in `build.gradle(.kts)`/`pom.xml` or `*ArchTest*.java`), `eslint-plugin-boundaries` / `import/no-restricted-paths` in eslint config, Nx `enforce-module-boundaries`.
  2. Check whether the tool is invoked from a gate surface (pre-commit, CI, or via the gated lint run for eslint-based rules).
- **Pass:** Boundary config present and invoked from a gate
- **Warn:** Boundary config present but nothing invokes it
- **Fail:** No boundary-checking mechanism found
- **Severity:** medium
- **Category:** 3104

### PRV-06: Test and coverage gate

- **What:** CI runs the test suite on every change and enforces a coverage threshold
- **How:**
  1. Search CI workflow files for a test-suite invocation (`pytest`, `npm/pnpm/yarn test`, `go test`, `cargo test`, `mvn test|verify`, `gradle test|check`, `vitest`, `jest`, `tox`, `nox`).
  2. Search CI files and coverage configs (`.coveragerc`, `pyproject.toml [tool.coverage.report]`, jest/vitest config) for a threshold gate: `--cov-fail-under`, `coverageThreshold`, `fail_under`, `jacocoTestCoverageVerification`, `kover`.
- **Pass:** CI test gate and a coverage threshold both present
- **Warn:** CI test gate present, no coverage threshold
- **Fail:** No CI test gate (including no CI at all — that is the finding, not a skip)
- **Severity:** high
- **Category:** 3105

### PRV-07: Agent configuration guarded

- **What:** Agent configuration files and sensitive paths are mechanically guarded from silent modification or abuse
- **How:**
  1. Check for agent-safety hooks (the AIS-07 surface): hooks that restrict agent access to secrets or sensitive files.
  2. Else check `.claude/settings.json` for `PreToolUse` hooks whose matcher or script references `Write`/`Edit` or protected paths, or CI steps that check agent instruction files (`CLAUDE.md`, `AGENTS.md`, `.claude/`, prompt-lint tools).
  3. Generic hooks that exist but guard nothing file-related are Warn.
- **Pass:** A hook or CI step guards the agent configuration surface
- **Warn:** Hooks exist but none guard files or sensitive paths
- **Fail:** No guard mechanism found
- **Skip-When:** No agent configuration files detected (`topology.has_ai_agent_files` false)
- **Severity:** medium
- **Category:** 3106

### PRV-08: Documentation freshness gate

- **What:** Documentation is mechanically checked in CI or pre-commit
- **How:**
  1. Search gate surfaces for a docs checker: `lychee`, `markdown-link-check`, `linkinator`, `linkcheck`, `mkdocs build --strict`, `markdownlint`, `remark-lint`, `vale`.
  2. If none invoked, look for checker configs (`.markdownlint.{json,yaml,yml}`, `.vale.ini`, `lychee.toml`) — config without a gate is Warn.
- **Pass:** Docs checker invoked from a gate surface
- **Warn:** Docs-checker config present but nothing invokes it
- **Fail:** No docs-checking mechanism found
- **Severity:** low
- **Category:** 3107

### PRV-11: Secrets rule written for agents

- **What:** Agent instruction files state an explicit secrets-handling rule
- **How:** Read the agent-visible instruction surface (root and nested `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, `.claude/rules/`, skill files) and judge against the rubric in `standards.toml` category 3110. Evidence must quote the passage and name the file.
- **Pass:** An explicit, actionable secrets rule is stated (never commit credentials; use env vars/vault; `.env` stays gitignored)
- **Warn:** Secrets mentioned but the rule is vague, partial, or buried in boilerplate
- **Fail:** No agent-visible file states a secrets rule — including when no instruction files exist at all
- **Severity:** medium
- **Category:** 3110

### PRV-12: Dependency policy written for agents

- **What:** Agent instruction files state an explicit dependency policy
- **How:** Same instruction surface as PRV-11; judge against the rubric in category 3111.
- **Pass:** An explicit dependency rule is stated (justify new deps, pin versions, commit lockfiles, audit before adding)
- **Warn:** Dependencies mentioned without an actionable rule
- **Fail:** No agent-visible file states a dependency policy — including when no instruction files exist at all
- **Skip-When:** No package manifests detected (`topology.has_package_ecosystem` false)
- **Severity:** medium
- **Category:** 3111

### PRV-13: Security conventions written for agents

- **What:** Agent instruction files state the project's application-security conventions
- **How:** Same instruction surface as PRV-11; judge against the rubric in category 3112.
- **Pass:** Explicit security conventions stated (auth required on endpoints, input validation at the boundary, parameterized queries, TLS rules)
- **Warn:** Security mentioned only as a vague aspiration
- **Fail:** No agent-visible file states security conventions — including when no instruction files exist at all
- **Severity:** high
- **Category:** 3112

### PRV-14: Style rules written for agents

- **What:** Agent instruction files state the project's style and formatting rules
- **How:** Same instruction surface as PRV-11; judge against the rubric in category 3113.
- **Pass:** Explicit style rules stated (named formatter + config, lint command, conventions beyond tool defaults)
- **Warn:** Style mentioned without an actionable rule or command
- **Fail:** No agent-visible file states style rules — including when no instruction files exist at all
- **Severity:** low
- **Category:** 3113

### PRV-15: Architecture rules written for agents

- **What:** Agent instruction files state the project's architecture boundaries
- **How:** Same instruction surface as PRV-11; judge against the rubric in category 3114.
- **Pass:** Explicit architecture rules stated (layering direction, allowed imports, where new code of each kind belongs)
- **Warn:** Architecture described but no rule constrains agent changes
- **Fail:** No agent-visible file states architecture boundaries — including when no instruction files exist at all
- **Severity:** medium
- **Category:** 3114

### PRV-16: Testing expectations written for agents

- **What:** Agent instruction files state the project's testing expectations
- **How:** Same instruction surface as PRV-11; judge against the rubric in category 3115.
- **Pass:** Explicit testing rules stated (tests ship with every change, how to run the suite, what new features need)
- **Warn:** Testing mentioned without an actionable rule or command
- **Fail:** No agent-visible file states testing expectations — including when no instruction files exist at all
- **Severity:** high
- **Category:** 3115

### PRV-17: Agent-surface protection written for agents

- **What:** Agent instruction files state rules protecting the agent configuration surface itself
- **How:** Same instruction surface as PRV-11; judge against the rubric in category 3116.
- **Pass:** Explicit rules govern agent config changes (CLAUDE.md/hooks/MCP changes need review; never weaken hook guards; instruction files are security-sensitive)
- **Warn:** Agent files mentioned without a protective rule
- **Fail:** No agent-visible file states such rules — including when no instruction files exist at all
- **Skip-When:** No agent configuration files detected (`topology.has_ai_agent_files` false)
- **Severity:** medium
- **Category:** 3116

### PRV-18: Docs-maintenance rule written for agents

- **What:** Agent instruction files state a docs-maintenance rule
- **How:** Same instruction surface as PRV-11; judge against the rubric in category 3117.
- **Pass:** An explicit docs rule is stated (update README/docs alongside code; keep referenced commands and paths valid)
- **Warn:** Documentation mentioned without an actionable rule
- **Fail:** No agent-visible file states a docs-maintenance rule — including when no instruction files exist at all
- **Severity:** low
- **Category:** 3117
