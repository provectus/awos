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

### SBP-04: Test infrastructure exists

- **What:** The project has a test framework configured and tests written
- **How:** Glob for test files: `**/*.test.{ts,tsx,js,jsx}`, `**/*Test.kt`, `**/*Spec.kt`. Check for test runner configs and test scripts.
- **Pass:** Test framework configured and 10+ test files exist
- **Warn:** Test framework configured but fewer than 10 test files
- **Fail:** No test infrastructure found
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
