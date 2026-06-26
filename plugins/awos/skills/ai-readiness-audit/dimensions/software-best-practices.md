---
name: software-best-practices
title: Software Best Practices
description: Evaluates code quality, architecture patterns, and engineering standards
severity: high
depends-on: [project-topology]
---

# Software Best Practices

Audits the codebase for adherence to software engineering fundamentals: clean architecture, SOLID principles, error handling, and tooling.

## Checks

### SBP-01: Linting is configured and enforced

- **What:** Code linters are configured for all major languages in the project
- **How:** Check for lint configuration: ESLint config (`eslint.config.*`, `.eslintrc*`) for TypeScript/JS, detekt or ktlint config for Kotlin. Verify lint scripts exist in package.json or Makefile.
- **Pass:** Linters configured for all languages with runnable scripts
- **Warn:** Linters configured but missing for one language
- **Fail:** No linting configuration found
- **Severity:** high
- **Category:** 2700

### SBP-02: Formatting is automated

- **What:** Code formatting is automated and consistent
- **How:** Check for Prettier config (`.prettierrc*`, `prettier.config.*`) for frontend, and ktlint/spotless for Kotlin. Check for format scripts or pre-commit hooks.
- **Pass:** Formatters configured with automated scripts or hooks
- **Warn:** Formatters configured but no automation (manual only)
- **Fail:** No formatting tools configured
- **Severity:** medium
- **Category:** 2701

### SBP-03: Type safety is enforced

- **What:** The project uses strong typing where the language supports it
- **How:** Check for strict-mode type config (e.g., `tsconfig.json` with `strict: true` for TypeScript, strict flags in other typed languages) or a high ratio of type annotations in sampled source files.
- **Pass:** Strong typing is enabled or demonstrated across the codebase
- **Warn:** Some typed configurations present but not comprehensively applied
- **Fail:** No type safety mechanisms detected or widespread use of type-suppression directives
- **Severity:** high
- **Category:** 2702

> _Test infrastructure and coverage are evaluated in the **Quality Assurance** dimension (`quality-assurance.md`), which provides a full testing pyramid analysis._

### SBP-05: CI/CD pipeline exists

- **What:** Automated build/test/deploy pipeline is configured
- **How:** Check for `.gitlab-ci.yml`, `.github/workflows/`, `Jenkinsfile`, or equivalent CI config files
- **Pass:** CI pipeline exists with build and test stages
- **Warn:** CI pipeline exists but is missing test or quality gate stages
- **Fail:** No CI/CD configuration found
- **Severity:** high
- **Category:** 2703

### SBP-06: Error handling patterns are consistent

- **What:** The codebase follows consistent error handling rather than silent swallowing
- **How:** Sample 5 catch blocks across backend and frontend. Check whether errors are logged, re-thrown, or silently ignored. Look for global error handlers. Also detect Python-2 `except A, B:` syntax which is a SyntaxError on Python 3.
- **Pass:** Errors are consistently logged or propagated; global handlers exist; no Python-2 except-clause syntax
- **Warn:** Mixed patterns — some errors handled well, some silently swallowed
- **Fail:** Widespread silent error swallowing (empty catch blocks, no logging) or Python-2 except-clause syntax defects found
- **Severity:** high
- **Category:** 2704, 2706

### SBP-07: Dependencies are managed

- **What:** Dependencies are locked and reasonably up-to-date
- **How:** Check for lock files (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `gradle.lockfile`). Check if there's a strategy for updates (renovate config, dependabot config).
- **Pass:** Lock files present and dependency update automation configured
- **Warn:** Lock files present but no automated update strategy
- **Fail:** No lock files found
- **Severity:** medium
- **Category:** 2705
