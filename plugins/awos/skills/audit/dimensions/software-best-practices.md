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

### SBP-02: Formatting is automated

- **What:** Code formatting is automated and consistent
- **How:** Check for Prettier config (`.prettierrc*`, `prettier.config.*`) for frontend, and ktlint/spotless for Kotlin. Check for format scripts or pre-commit hooks.
- **Pass:** Formatters configured with automated scripts or hooks
- **Warn:** Formatters configured but no automation (manual only)
- **Fail:** No formatting tools configured
- **Severity:** medium

### SBP-03: Type safety is enforced

- **What:** The project uses strong typing where available
- **How:** For TypeScript: check `tsconfig.json` for `strict: true` or equivalent strict flags. For Kotlin: this is inherent to the language — check that `@Suppress` annotations are minimal.
- **Pass:** Strict mode enabled (TS) or minimal type suppressions (Kotlin)
- **Warn:** Some strict flags enabled but not full strict mode
- **Fail:** Strict mode disabled or excessive type suppressions/`any` usage
- **Severity:** high

### SBP-04: Test infrastructure exists with adequate coverage

- **What:** The project has meaningful tests written covering its source modules
- **How:** Detect test infrastructure based on the project's stack:
  1. **Traditional test files** (JS/TS/Kotlin/Python/Go/etc.): Glob for
     `**/*.test.{ts,tsx,js,jsx}`, `**/*.spec.{ts,tsx,js,jsx}`,
     `**/__tests__/**/*.{ts,tsx,js,jsx}`, `**/*_test.py`, `**/test_*.py`,
     `**/*Test.kt`, `**/*Spec.kt`, `**/*_test.go`, etc.
     Exclude `node_modules/`, `build/`, `dist/`, `vendor/`, `.venv/`.
     Count discrete test files.
  2. **Declarative test frameworks** (dbt, Terraform, Maestro, etc.): Count
     individual test _definitions_, not files. A single YAML or config file
     may declare many independent test assertions, flows, or checks. Parse
     the relevant format and count each discrete test unit.

  Use the metric appropriate to the stack: test _files_ for file-per-test
  frameworks, test _definitions_ for declarative frameworks. Calculate the
  test-coverage ratio: tested source modules / total source modules. A source
  module is "tested" if at least one test (file or definition) targets it.

- **Pass:** Test-coverage ratio >= 60% (at least 60% of source modules have
  associated tests)
- **Warn:** Test-coverage ratio > 0% but < 60% (some modules lack test
  coverage)
- **Fail:** No tests found
- **Severity:** critical

### SBP-05: CI/CD pipeline exists

- **What:** Automated build/test/deploy pipeline is configured
- **How:** Check for `.gitlab-ci.yml`, `.github/workflows/`, `Jenkinsfile`, or equivalent CI config files
- **Pass:** CI pipeline exists with build and test stages
- **Warn:** CI pipeline exists but is missing test or quality gate stages
- **Fail:** No CI/CD configuration found
- **Severity:** high

### SBP-06: Error handling patterns are consistent

- **What:** The codebase follows consistent error handling rather than silent swallowing
- **How:** Sample 5 catch blocks across backend and frontend. Check whether errors are logged, re-thrown, or silently ignored. Look for global error handlers.
- **Pass:** Errors are consistently logged or propagated; global handlers exist
- **Warn:** Mixed patterns — some errors handled well, some silently swallowed
- **Fail:** Widespread silent error swallowing (empty catch blocks, no logging)
- **Severity:** high

### SBP-07: Dependencies are managed

- **What:** Dependencies are locked and reasonably up-to-date
- **How:** Check for lock files (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `gradle.lockfile`). Check if there's a strategy for updates (renovate config, dependabot config).
- **Pass:** Lock files present and dependency update automation configured
- **Warn:** Lock files present but no automated update strategy
- **Fail:** No lock files found
- **Severity:** medium
