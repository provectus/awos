---
name: quality-assurance
title: Quality Assurance
description: Evaluates testing pyramid structure, tooling maturity, and optional contract/ML testing readiness
severity: high
depends-on: [project-topology]
---

# Quality Assurance

Audits the depth and structure of the project's testing approach. Checks whether tests are organized across the full testing pyramid (unit → integration → E2E), whether the pyramid shape is healthy (not inverted), and whether supporting tooling — coverage reporting, test data management, and mocking infrastructure — is in place. Conditional checks for contract testing and ML model iteration testing activate when the topology reveals multi-service or ML architectures.

## Checks

### QA-01: Test infrastructure exists with adequate coverage

- **What:** The project has meaningful tests covering its source modules
- **How:** Detect test infrastructure based on the project's stack. Exclude `node_modules/`, `build/`, `dist/`, `vendor/`, `.venv/` from all globs.

  **Traditional test file globs by stack:**
  - JS/TS: `**/*.test.{ts,tsx,js,jsx}`, `**/*.spec.{ts,tsx,js,jsx}`, `**/__tests__/**/*`
  - Python: `**/test_*.py`, `**/*_test.py`
  - Java: `**/*Test.java`, `**/*Tests.java`, `**/*IT.java`
  - Kotlin: `**/*Test.kt`, `**/*Spec.kt`, `**/*IT.kt`
  - Go: `**/*_test.go`
  - Rust: files in `tests/` directory OR any file containing `#[cfg(test)]`
  - Ruby: `**/*_spec.rb`, `**/*_test.rb`, `**/test_*.rb`
  - PHP: `**/*Test.php`
  - Elixir: `**/*_test.exs`
  - Swift: `**/*Tests.swift`, `**/*Test.swift`
  - Dart/Flutter: `**/*_test.dart`
  - C#: `**/*Tests.cs`, `**/*Test.cs`

  **Declarative frameworks** (dbt, Terraform, Maestro YAML): count individual test definitions, not files.

  Calculate the test-coverage ratio: tested source modules / total source modules. A source module is "tested" if at least one test (file or definition) targets it. Establish linkage by naming convention first (e.g., `Button.test.tsx` targets `Button.tsx`, `user_test.go` targets `user.go`); then by directory co-location (test in `tests/unit/` mirrors source in `src/`). If linkage cannot be resolved for most files, fall back to: any tests exist = Warn, no tests = Fail.

- **Pass:** Test-coverage ratio >= 60%
- **Warn:** Test-coverage ratio > 0% but < 60%
- **Fail:** No tests found
- **Severity:** critical

---

### QA-02: Unit tier present

- **What:** The project has tests that verify individual units of logic in isolation, without real I/O or external dependencies
- **How:** Look for any of the following signals:

  **File/directory naming:**
  - Files: `*.unit.test.*`, `*.unit.spec.*`
  - Directories: `tests/unit/`, `__tests__/unit/`, `spec/unit/`

  **Annotation/marker signals by stack:**
  - Java/Kotlin (JUnit 5): `@Tag("unit")` or `@Tag("fast")` in test files
  - Python (pytest): `@pytest.mark.unit` in test files, or `unit` marker registered in `pytest.ini` / `pyproject.toml`
  - Ruby (RSpec): `:unit` tag on `describe` or `context` blocks
  - PHP (PHPUnit): `@group unit` docblock annotation
  - Go: `*_test.go` files that do NOT contain `//go:build integration` or `//go:build e2e` build constraints (absence of those tags = unit)
  - Rust: `#[cfg(test)]` module co-located inside `src/` files (in-source placement = unit test pattern)
  - Swift (XCTest): test target whose name ends in `UnitTests` or `Tests` (but not `UITests`)
  - Elixir (ExUnit): `use ExUnit.Case` without `Phoenix.ConnTest`, `Ecto.Adapters.SQL.Sandbox`, `DataCase`, or `ConnCase` imports
  - Dart/Flutter: `**/*_test.dart` located in `test/` directory (not `integration_test/`)

  **Import-based inference:** sample 5 test files (one per top-level module where possible, or first 5 alphabetically) — if they import only local project modules and no HTTP clients, DB clients, or external service SDKs, treat them as unit-scoped.

- **Pass:** Unit tests detected via any signal above
- **Warn:** Test files exist but none can be clearly identified as unit-scoped
- **Fail:** No unit test signals detected
- **Severity:** high

---

### QA-03: Integration tier present

- **What:** The project has tests that verify interactions between components — across real databases, real HTTP calls, or real message queues
- **How:** Look for any of the following signals:

  **File/directory naming:**
  - Files: `*.integration.test.*`, `*.integration.spec.*`, `*.int.test.*`, `*_integration_test.go`, `*IT.java`, `*IT.kt`
  - Directories: `tests/integration/`, `__tests__/integration/`, `spec/integration/`

  **Annotation/framework signals by stack:**
  - Spring Boot (Java/Kotlin): `@SpringBootTest`, `@DataJpaTest`, `@WebMvcTest`, `@DataMongoTest`, `@RestClientTest`, `@ServiceConnection`
  - Testcontainers (any JVM): `@Testcontainers`, `@Container`, or imports from `org.testcontainers`
  - Python (pytest): `@pytest.mark.integration`, or `integration` marker registered in `pytest.ini` / `pyproject.toml`, or `conftest.py` with DB/HTTP fixtures
  - Ruby (RSpec): `type: :integration` metadata, or tests importing `DatabaseCleaner` or `FactoryBot` against a real database
  - PHP (PHPUnit): `@group integration` annotation, or extending `AbstractIntegrationTestCase`
  - Go: `//go:build integration` or legacy `// +build integration` build constraint in test files
  - Rust: files inside the top-level `tests/` directory (Rust canonical location for integration tests, separate from `src/`)
  - Elixir: test files that import `Phoenix.ConnTest`, `Ecto.Adapters.SQL.Sandbox`, or use `DataCase` / `ConnCase` from Phoenix

- **Pass:** Integration tests detected via any signal above
- **Warn:** Tests appear to hit real dependencies (DB/HTTP imports in test files) but no explicit integration markers found
- **Fail:** No integration test signals detected
- **Severity:** high

---

### QA-04: E2E tier present

- **What:** The project has end-to-end tests that exercise complete user flows through a real UI, API surface, or CLI
- **How:** Look for any of the following signals:

  **Config file signals:**
  - `playwright.config.{ts,js,mts,mjs}` — Playwright
  - `cypress.config.{ts,js}`, `cypress.json` — Cypress
  - `wdio.config.{ts,js}` — WebdriverIO
  - `.detoxrc.{js,json}`, `detox.config.js` — Detox (React Native)
  - `appium.config.{js,ts}`, `.appiumrc` — Appium
  - `nightwatch.conf.js`, `nightwatch.config.js` — Nightwatch
  - `codecept.conf.{js,ts}` — CodeceptJS
  - `testcafe.config.js` or `testcafe` key in `package.json` — TestCafe

  **Directory/file signals:**
  - Directories: `cypress/`, `e2e/`, `tests/e2e/`, `__tests__/e2e/`
  - `maestro/` or `.maestro/` containing `*.yaml` flow files (Maestro mobile)
  - `integration_test/**/*_test.dart` (Flutter E2E)
  - `**/*UITests.swift`, `**/*UITest.swift` (Swift/Xcode UI tests)
  - `androidTest/**/*.{java,kt}` (Android Espresso)
  - Files: `**/*.e2e.test.*`, `**/*.e2e.spec.*`, `**/*.e2e-spec.*`

  **Annotation signals:**
  - Python: `@pytest.mark.e2e`
  - Java/Kotlin (JUnit 5): `@Tag("e2e")`
  - PHP (PHPUnit): `@group e2e`
  - Go: `//go:build e2e`

- **Pass:** E2E tooling config AND test files both present
- **Warn:** E2E config present but no test files found (tooling set up but unused)
- **Fail:** No E2E signals detected
- **Skip-When:** Topology shows library (no runnable entry point)
- **Severity:** high

---

### QA-05: Pyramid shape — no inversion

- **What:** The distribution of tests across tiers follows a healthy pyramid: most tests are unit-level, fewer are integration-level, fewest are E2E
- **How:** Use findings from QA-02, QA-03, and QA-04 to estimate test counts at each tier. Count test files (or test definitions for declarative stacks) matched by each tier's signals. A healthy pyramid satisfies: unit_count >= integration_count >= e2e_count.
- **Pass:** unit_count >= integration_count >= e2e_count, or only one tier is present
- **Warn:** E2E count exceeds unit count but integration layer exists as a buffer, OR integration count exceeds unit count by less than 2×
- **Fail:** E2E count > unit count (inverted pyramid), or integration count > unit count by a significant margin (2× or more)
- **Skip-When:** Fewer than 2 tiers received a Pass result in QA-02, QA-03, or QA-04
- **Severity:** medium

---

### QA-06: Coverage reporting configured

- **What:** The project measures what percentage of source code is exercised by tests, optionally enforcing a minimum threshold
- **How:** Check for coverage tool configuration:
  - Jest: `collectCoverage: true` or `coverageThreshold` key in `jest.config.*`
  - Vitest: `coverage` section in `vitest.config.*`
  - pytest-cov: `pytest-cov` in `requirements*.txt` or `pyproject.toml`; `--cov` flag in `pytest.ini` or `pyproject.toml` `addopts`
  - JaCoCo: `jacoco` plugin in `build.gradle` or `build.gradle.kts`
  - nyc / c8: `.nycrc`, `.nycrc.json`, or `c8` / `nyc` script in `package.json`
  - Go: `go test -coverprofile` flag in `Makefile`, CI config, or `go test ./... -cover` in CI scripts
  - Ruby: `simplecov` gem in `Gemfile` or `require 'simplecov'` in `spec_helper.rb` / `.simplecov`
- **Pass:** Coverage tool configured with thresholds defined
- **Warn:** Coverage tool present but no thresholds defined, OR no coverage tooling found
- **Severity:** low

---

### QA-07: Test data management

- **What:** Tests use a structured approach to create and manage test data, rather than scattering hardcoded inline values across test files
- **How:** Check for:
  - Fixture directories: `fixtures/`, `__fixtures__/`, `testdata/`, `test/fixtures/`, `spec/fixtures/`
  - Factory libraries in dependencies: `factory-girl`, `fishery`, `rosie` (JS/TS); `factory_boy` (Python); `FactoryBot` / `factory_bot` (Ruby); `testdata/` fixtures (Go — no dominant factory library; Go projects typically rely on fixture directories)
  - Faker libraries: `faker`, `@faker-js/faker`, `Faker` (PHP), `Bogus` (C#)
  - Seed scripts: `seeds/`, `db/seeds/`, `prisma/seed.*`, `scripts/seed.*`
  - Confirm usage: grep for the detected library/directory name inside test files to verify it is actually used (not just installed)
- **Pass:** Fixtures or factories present and referenced in test files
- **Warn:** One approach present but sparse (library installed but used in fewer than 3 test files)
- **Fail:** No test data strategy — tests use only hardcoded inline values
- **Severity:** low

---

### QA-08: Test isolation — mocking infrastructure

- **What:** Unit and integration tests use mocking/stubbing to isolate the code under test from external dependencies
- **How:** Check for mocking libraries in dependencies or imports:
  - JS/TS: `jest.mock`, `vi.mock`, `sinon`, `nock`, `msw` (mock service worker)
  - Python: `unittest.mock`, `pytest-mock`, `responses`, `httpretty`
  - Java/Kotlin: `mockito-core`, `mockk`, `WireMock`
  - Go: `gomock`, `testify/mock`
  - Ruby: `rspec-mocks` (included in RSpec), `webmock`, `vcr`
  - PHP: PHPUnit built-in mock builder (`createMock`, `getMockBuilder`)
  - Rust: `mockall`, `mockito`
  - Elixir: `Mox`

  Sample 5 test files and confirm mocking is actively used (grep for `mock`, `stub`, `spy`, `fake`, or library-specific calls).

- **Pass:** Mocking library present and actively used in sampled test files
- **Warn:** Library present but used in fewer than 2 of the 5 sampled files
- **Fail:** No mocking infrastructure detected
- **Severity:** medium

---

### QA-09: Contract testing

- **What:** Service boundaries are verified through consumer-driven contract tests, ensuring producers don't break consumers
- **How:** Check for contract testing frameworks:
  - Pact: `pact/` directory, `**/*.pact.json`, `@pact-foundation/pact` in dependencies, `au.com.dius.pact` in Gradle
  - Spring Cloud Contract: `contracts/` directory with `*.groovy` or `*.yml` contract files
  - Schemathesis / Dredd: `schemathesis` or `dredd` in dependencies with config files
  - Karate: `classpath:karate-config.js`, `import com.intuit.karate` in test files, or `karate` artifact in Gradle/Maven dependencies
- **Pass:** Contract tests present covering at least one service boundary
- **Warn:** Contract tooling installed but no contract files found
- **Fail:** No contract testing detected
- **Skip-When:** Topology shows single-service repo or no inter-service communication patterns detected
- **Severity:** high

---

### QA-10: ML model iteration testing

- **What:** ML models are tested for quality metrics as part of the development cycle, not just functional correctness
- **How:** Check for ML evaluation frameworks or patterns in test files:
  - `great_expectations` config (`great_expectations.yml` or `great_expectations/` directory)
  - `deepchecks` in dependencies
  - `evidently` in dependencies
  - `whylogs` in dependencies
  - Test files that import ML frameworks (`sklearn`, `torch`, `tensorflow`, `xgboost`, `transformers`, `keras`) AND contain assertions on model quality metrics (accuracy, f1, precision, recall, loss thresholds) — grep for `assert.*score`, `assert.*accuracy`, `assert.*f1`, or similar patterns
- **Pass:** Model evaluation tests present with explicit quality metric assertions
- **Warn:** ML framework imports appear in test files but no metric assertions found (tests exist but don't gate on model quality)
- **Fail:** No ML model testing detected
- **Skip-When:** Topology shows no ML layer — no ML framework imports (`sklearn`, `torch`, `tensorflow`, `xgboost`, `transformers`) found in non-test source files
- **Severity:** high
