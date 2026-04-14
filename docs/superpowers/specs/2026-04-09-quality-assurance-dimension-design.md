# Quality Assurance Dimension — Design Spec

**Date:** 2026-04-09
**Status:** Approved for implementation

---

## Summary

Add a new `quality-assurance` dimension to the AWOS AI Readiness Audit plugin. This dimension provides deep evaluation of a project's testing maturity by analyzing testing pyramid structure, tooling, and optional conditional checks for contract and ML testing. The existing SBP-04 check is removed from `software-best-practices` and a lineage note is added there pointing to this new dimension.

---

## DAG Placement

- **New dimension:** `quality-assurance`
- **depends-on:** `[project-topology]` — Phase 2, same as other substantive dimensions
- **Impact on existing DAG:** `end-to-end-delivery` currently depends on `software-best-practices`; it must also depend on `quality-assurance` since QA-01 replaces SBP-04
- **Frontmatter severity:** `high`

---

## Changes to `software-best-practices.md`

- Remove SBP-04 entirely
- Add after SBP-03 (before SBP-05):

  > _Test infrastructure and coverage are evaluated in the **Quality Assurance** dimension (`quality-assurance.md`), which provides a full testing pyramid analysis._

- No renumbering — the gap between SBP-03 and SBP-05 is bridged by the note

---

## Checks

### QA-01: Test infrastructure exists

Full port of SBP-04. Detects test files or declarative test definitions across all supported stacks, excluding `node_modules/`, `build/`, `dist/`, `vendor/`, `.venv/`.

**Traditional test file globs:**

| Stack        | Patterns                                                                      |
| ------------ | ----------------------------------------------------------------------------- |
| JS/TS        | `**/*.test.{ts,tsx,js,jsx}`, `**/*.spec.{ts,tsx,js,jsx}`, `**/__tests__/**/*` |
| Python       | `**/test_*.py`, `**/*_test.py`                                                |
| Java         | `**/*Test.java`, `**/*Tests.java`, `**/*IT.java`                              |
| Kotlin       | `**/*Test.kt`, `**/*Spec.kt`, `**/*IT.kt`                                     |
| Go           | `**/*_test.go`                                                                |
| Rust         | `tests/` directory OR files containing `#[cfg(test)]` module                  |
| Ruby         | `**/*_spec.rb`, `**/*_test.rb`, `**/test_*.rb`                                |
| PHP          | `**/*Test.php`                                                                |
| Elixir       | `**/*_test.exs`                                                               |
| Swift        | `**/*Tests.swift`, `**/*Test.swift`                                           |
| Dart/Flutter | `**/*_test.dart`                                                              |
| C#           | `**/*Tests.cs`, `**/*Test.cs`                                                 |

**Declarative frameworks** (dbt, Terraform, Maestro YAML): count individual test definitions, not files.

Calculate test-coverage ratio: tested source modules / total source modules.

- **Pass:** ratio ≥ 60%
- **Warn:** ratio > 0% but < 60%
- **Fail:** no tests found
- **Severity:** critical

---

### QA-02: Unit tier present

**File/directory signals:**

- Naming: `*.unit.test.*`, `*.unit.spec.*`
- Directories: `tests/unit/`, `__tests__/unit/`, `spec/unit/`

**Annotation/marker signals:**

| Stack                 | Markers                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| Java/Kotlin (JUnit 5) | `@Tag("unit")`, `@Tag("fast")`                                         |
| Python (pytest)       | `@pytest.mark.unit`, `unit` marker in `pytest.ini` or `pyproject.toml` |
| Ruby (RSpec)          | `:unit` tag on `describe`/`context` blocks                             |
| PHP (PHPUnit)         | `@group unit` docblock annotation                                      |
| Go                    | `*_test.go` with no `//go:build integration` or `//go:build e2e` tag   |
| Rust                  | `#[cfg(test)]` module co-located inside `src/` files                   |
| Swift (XCTest)        | Test target name ending in `UnitTests` or `Tests` (not `UITests`)      |
| Elixir (ExUnit)       | `use ExUnit.Case` without Phoenix/Ecto integration imports             |
| Dart/Flutter          | `**/*_test.dart` in `test/` directory (not `integration_test/`)        |

**Import-based inference:** test file imports only local modules with no HTTP clients, DB clients, or external service SDKs.

- **Pass:** unit tests detected via any signal above
- **Warn:** test files exist but none are clearly unit-scoped
- **Fail:** no unit test signals detected
- **Severity:** high

---

### QA-03: Integration tier present

**File/directory signals:**

- Naming: `*.integration.test.*`, `*.integration.spec.*`, `*.int.test.*`, `*_integration_test.go`, `*IT.java`, `*IT.kt`
- Directories: `tests/integration/`, `__tests__/integration/`, `spec/integration/`

**Annotation/framework signals:**

| Stack                     | Markers                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Spring Boot (Java/Kotlin) | `@SpringBootTest`, `@DataJpaTest`, `@WebMvcTest`, `@DataMongoTest`, `@RestClientTest`, `@ServiceConnection`            |
| Testcontainers (any JVM)  | `@Testcontainers`, `@Container`, imports from `org.testcontainers`                                                     |
| Python (pytest)           | `@pytest.mark.integration`, `conftest.py` with DB/HTTP fixtures, `integration` marker in `pytest.ini`/`pyproject.toml` |
| Ruby (RSpec)              | `type: :integration` metadata, or tests using `DatabaseCleaner`/`FactoryBot` with real DB                              |
| PHP (PHPUnit)             | `@group integration`, extending `AbstractIntegrationTestCase`                                                          |
| Go                        | `//go:build integration` or legacy `// +build integration` tag                                                         |
| Rust                      | Files in top-level `tests/` directory (Rust canonical integration test location)                                       |
| Elixir                    | Test files using `Phoenix.ConnTest`, `Ecto.Adapters.SQL.Sandbox`, `DataCase`, or `ConnCase`                            |

- **Pass:** integration tests detected via any signal above
- **Warn:** tests appear to hit real dependencies but no explicit integration markers found
- **Fail:** no integration test signals detected
- **Severity:** high

---

### QA-04: E2E tier present

**Config file signals:**

| Tool                 | Config Files                                             |
| -------------------- | -------------------------------------------------------- |
| Playwright           | `playwright.config.{ts,js,mts,mjs}`                      |
| Cypress              | `cypress.config.{ts,js}`, `cypress.json`                 |
| WebdriverIO          | `wdio.config.{ts,js}`                                    |
| Detox (React Native) | `.detoxrc.{js,json}`, `detox.config.js`                  |
| Appium               | `appium.config.{js,ts}`, `.appiumrc`                     |
| Nightwatch           | `nightwatch.conf.js`, `nightwatch.config.js`             |
| CodeceptJS           | `codecept.conf.{js,ts}`                                  |
| TestCafe             | `testcafe.config.js` or `testcafe` key in `package.json` |

**Directory/file signals:**

- `cypress/`, `e2e/`, `tests/e2e/`, `__tests__/e2e/`
- `maestro/` or `.maestro/` with `*.yaml` flow files (Maestro mobile)
- `integration_test/**/*_test.dart` (Flutter E2E)
- `**/*UITests.swift`, `**/*UITest.swift` (Swift/Xcode UI tests)
- `androidTest/**/*.{java,kt}` (Android Espresso)
- `**/*.e2e.test.*`, `**/*.e2e.spec.*`, `**/*.e2e-spec.*`

**Annotation signals:**

| Stack                 | Markers            |
| --------------------- | ------------------ |
| Python                | `@pytest.mark.e2e` |
| Java/Kotlin (JUnit 5) | `@Tag("e2e")`      |
| PHP (PHPUnit)         | `@group e2e`       |
| Go                    | `//go:build e2e`   |

- **Pass:** E2E tooling config and test files both present
- **Warn:** E2E config present but no test files found (tooling set up but unused)
- **Fail:** no E2E signals detected
- **Skip-When:** topology shows library (no runnable entry point)
- **Severity:** high

---

### QA-05: Pyramid shape — no inversion

Uses findings from QA-02, QA-03, QA-04 to count tests at each tier. A healthy pyramid: unit ≥ integration ≥ E2E.

- **Pass:** unit count ≥ integration count ≥ E2E count, or only one tier exists
- **Warn:** E2E count exceeds unit count but integration layer exists as a buffer
- **Fail:** E2E count > unit count (inverted pyramid), or integration count > unit count significantly
- **Skip-When:** fewer than 2 tiers detected
- **Severity:** medium

---

### QA-06: Coverage reporting configured _(optional)_

Check for coverage tool configuration: `jest` with `coverageThreshold` or `collectCoverage`, `vitest` coverage config, `pytest-cov` in requirements/pyproject, `jacoco` plugin in Gradle, `.nycrc`, `c8` in scripts.

- **Pass:** coverage tool configured with thresholds defined
- **Warn:** coverage tool present but no thresholds, or no coverage tooling found
- **Severity:** low _(no FAIL state — this check is advisory only)_

---

### QA-07: Test data management

Check for fixture directories (`fixtures/`, `__fixtures__/`, `testdata/`), factory libraries (`factory-girl`, `fishery`, `faker`, `factory_boy`, `gomock`), or seed scripts (`seeds/`, `db/seeds/`).

- **Pass:** fixtures or factories present and referenced in test files
- **Warn:** one approach present but sparse usage
- **Fail:** no test data strategy — tests appear to use only hardcoded inline values
- **Severity:** low

---

### QA-08: Test isolation — mocking infrastructure

Check for mocking libraries: `jest.mock`, `vi.mock`, `sinon`, `nock`, `msw`, `mockito`, `gomock`, `unittest.mock`. Sample 5 test files to confirm mocks are used to isolate external dependencies in unit/integration tests.

- **Pass:** mocking library present and actively used
- **Warn:** library present but minimal usage found in sampled files
- **Fail:** no mocking infrastructure detected
- **Severity:** medium

---

### QA-09: Contract testing _(conditional)_

Check for consumer-driven contract frameworks: Pact files (`pact/`, `**/*.pact.json`), Spring Cloud Contract (`contracts/`), or similar.

- **Pass:** contract tests present covering at least one service boundary
- **Warn:** contract tooling configured but no contract files found
- **Fail:** no contract tests
- **Skip-When:** topology shows single-service repo or no inter-service communication detected
- **Severity:** high

---

### QA-10: ML model iteration testing _(conditional)_

Check for ML testing patterns: `pytest` with model evaluation assertions, `great_expectations` config, `deepchecks`, `evidently`, `whylogs`, or test files that import ML frameworks (`sklearn`, `torch`, `tensorflow`, `xgboost`, `transformers`) and assert on model quality metrics.

- **Pass:** model evaluation tests present with quality metric assertions
- **Warn:** ML framework imports appear in test context but no metric assertions found
- **Fail:** no ML model testing
- **Skip-When:** topology shows no ML layer (no ML framework imports in source files)
- **Severity:** high

---

## Scoring

Standard AWOS scoring applies (from `scoring.md`): each check contributes to the dimension percentage. Skipped checks are excluded from the denominator. QA-06 has no FAIL state — its worst outcome is WARN, making it a low-weight advisory signal.

---

## Files to Create / Modify

| Action | File                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| Create | `plugins/awos/skills/ai-readiness-audit/dimensions/quality-assurance.md`                                             |
| Modify | `plugins/awos/skills/ai-readiness-audit/dimensions/software-best-practices.md` — remove SBP-04, add lineage note     |
| Modify | `plugins/awos/skills/ai-readiness-audit/dimensions/end-to-end-delivery.md` — add `quality-assurance` to `depends-on` |
