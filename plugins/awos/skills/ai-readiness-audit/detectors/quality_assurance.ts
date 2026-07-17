import {
  makeResult,
  iterFiles,
  readTextSafe,
  scanForSignal,
  SOURCE_IGNORE as BASE_SOURCE_IGNORE,
} from './_base.ts';
import { existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { ALL_TEST_GLOBS, ALL_SOURCE_GLOBS } from '../languages.ts';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Glob patterns that identify test files by naming convention — from registry.
const TEST_FILE_GLOBS = ALL_TEST_GLOBS;

// Source file globs (non-test source modules) — from registry.
const SOURCE_FILE_GLOBS = ALL_SOURCE_GLOBS;

// Directories to skip for source file scanning.
const SOURCE_IGNORE = [...BASE_SOURCE_IGNORE, 'vendor', '.tox'];

// Test directories that imply integration-level tests.
// Also matches plain "integration/" (without the "test(s)" suffix), and a
// Maven/Gradle failsafe "it/" directory — but only when nested under a test
// root (…/test/…/it/ or …/tests/…/it/), so an unrelated "it/" dir elsewhere
// in the tree (e.g. an Italian locale bundle) doesn't false-positive.
const INTEGRATION_DIR_RX =
  /\/(integration(?:[_-]?tests?)?|e2e[_-]?tests?|system[_-]?tests?|functional[_-]?tests?)\/|\/tests?\/(?:[^/]+\/)*it\//i;

// Integration test file naming patterns.
const INTEGRATION_FILE_RX =
  /[_.-](integration|contract|integration_test|it)[._-]/i;

// E2E test markers in file content — browser/e2e drivers only. General-purpose
// test runners (vitest, jest) and HTTP assertion libs (supertest) must NOT be
// listed: importing the runner is what every unit test does, so matching it
// would classify entire unit suites as e2e.
const E2E_CONTENT_RX =
  /\b(playwright|cypress|puppeteer|selenium|webdriver|nightwatch|testcafe|detox|appium|k6|gatling|webdriverio|wdio|codeceptjs|robot\s+framework)\b/i;

// E2E config / directory names.
const E2E_GLOBS = [
  'playwright.config.ts',
  'playwright.config.js',
  'playwright.config.mjs',
  'cypress.json',
  'cypress.config.ts',
  'cypress.config.js',
  'cypress.config.mjs',
  'nightwatch.conf.js',
  'wdio.conf.ts',
  'wdio.conf.js',
  'wdio.conf.mjs',
  'testcafe.config.js',
  'codeceptjs.conf.js',
];

// ---------------------------------------------------------------------------
// detectTestInfrastructure — category 2500 (QA-01, method: computed)
//
// Computes what fraction of source modules have at least one test file.
//
// Algorithm:
//   1. Count test files across the repo (using test naming conventions).
//   2. Count source files excluding test files.
//   3. coverage_proxy = test_count / source_count
//
// Thresholds:
//   ratio >= 0.60  → PASS (meaningful tests — 60%+ of source modules)
//   ratio >= 0.30  → WARN (partial coverage)
//   ratio <  0.30  → FAIL
//   0 source files → SKIP
// ---------------------------------------------------------------------------

export function detectTestInfrastructure(
  repoPath: string,
  params?: unknown
): ReturnType<typeof makeResult> {
  const p = params as { threshold?: number; warn_at?: number } | undefined;
  const threshold = p?.threshold ?? 0.6;
  const warnAt = p?.warn_at ?? 0.3;
  const thresholdPct = Math.round(threshold * 100);
  const warnAtPct = Math.round(warnAt * 100);

  // Collect test files
  const testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);

  // Collect all source files
  const allSourceFiles = iterFiles(repoPath, SOURCE_FILE_GLOBS, SOURCE_IGNORE);

  // Filter out test files from source count
  const testFileSet = new Set(testFiles);
  const pureSourceFiles = allSourceFiles.filter((f) => !testFileSet.has(f));

  const testCount = testFiles.length;
  const sourceCount = pureSourceFiles.length;

  if (sourceCount === 0) {
    return makeResult(
      'SKIP',
      null,
      ['no source files found — test infrastructure check skipped'],
      'computed'
    );
  }

  const ratio = testCount / sourceCount;
  const pct = Math.round(ratio * 100);
  // score: continuous coverage proxy clamped to [0,1]
  const score = Math.min(1, Math.max(0, ratio));

  const evidence = [
    `${testCount} test file(s) found for ${sourceCount} source module(s) (${pct}% ratio)`,
    ...testFiles.slice(0, 5).map((f) => `test file: ${relative(repoPath, f)}`),
  ];

  if (ratio >= threshold) {
    return makeResult(
      'PASS',
      ratio,
      [
        `test coverage proxy: ${pct}% — meaningful tests covering ≥ ${thresholdPct}% of source modules`,
        ...evidence,
      ],
      'computed',
      score,
      1.0
    );
  }

  if (ratio >= warnAt) {
    return makeResult(
      'WARN',
      ratio,
      [
        `test coverage proxy: ${pct}% — partial test coverage (below ${thresholdPct}% threshold)`,
        ...evidence,
      ],
      'computed',
      score,
      1.0
    );
  }

  return makeResult(
    'FAIL',
    ratio,
    [
      `test coverage proxy: ${pct}% — insufficient test coverage (below ${warnAtPct}% threshold)`,
      ...evidence,
    ],
    'computed',
    score,
    1.0
  );
}

// ---------------------------------------------------------------------------
// detectUnitTests — category 2501 (QA-04, method: detected)
//
// Detects the presence of unit tests — tests that verify individual units of
// logic in isolation, without real I/O.
//
// Signals:
//   - Test files exist with naming conventions (*.test.*, test_*.py, etc.)
//   - Test file content references mock/stub/spy patterns OR the files live
//     in a directory named unit/ or __tests__/
//
// PASS  if unit test files found.
// FAIL  if no test files found.
// ---------------------------------------------------------------------------

const UNIT_DIR_RX = /\/(unit[_-]?tests?|__tests?__|spec)\//i;
const MOCK_CONTENT_RX =
  /\b(mock|stub|spy|jest\.fn|MagicMock|unittest\.mock|double|sinon|vitest\.fn)\b/i;

export function detectUnitTests(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);

  if (testFiles.length === 0) {
    return makeResult('FAIL', 0, [
      'no test files found — unit tests not detected',
    ]);
  }

  // Check for unit-specific signals
  const unitSignals: string[] = [];

  for (const f of testFiles.slice(0, 50)) {
    const rel = relative(repoPath, f);
    if (UNIT_DIR_RX.test('/' + rel)) {
      unitSignals.push(`unit dir: ${rel}`);
      continue;
    }
    const content = readTextSafe(f);
    if (content === null) continue;
    if (MOCK_CONTENT_RX.test(content)) {
      unitSignals.push(`mock/stub patterns in: ${rel}`);
    }
  }

  // Even without explicit mock signals, test files with standard naming
  // conventions count as unit test evidence.
  const evidence =
    unitSignals.length > 0
      ? unitSignals.slice(0, 10)
      : testFiles.slice(0, 5).map((f) => `test file: ${relative(repoPath, f)}`);

  return makeResult('PASS', testFiles.length, [
    `${testFiles.length} test file(s) found — unit test tier detected`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectIntegrationTests — category 2502 (QA-05, method: detected)
//
// Detects integration tests — tests that verify interactions between
// components across real databases, HTTP calls, or message queues.
//
// Signals (any of):
//   - Files in directories named integration/, integration_tests/, e2e/
//   - Test files named *integration*, *contract*, *it.test.*
//   - Test content referencing real DB or HTTP calls (not mocked):
//     TestContainers, database URLs, supertest/requests without mock setup
//   - Docker-compose in tests/ dir (implies real services spun up)
//
// PASS  if integration signals found.
// WARN  if only borderline signals (e.g. supertest without TestContainers).
// FAIL  if no integration signals found.
// ---------------------------------------------------------------------------

// Content signals that indicate real I/O integration tests (not mocked):
//   HTTP clients:  httpx, requests, supertest, TestClient (ASGI), k6, gatling
//   DB drivers:    asyncpg, psycopg, sqlalchemy engine/session, testcontainers
//   App transports: starlette/fastapi TestClient, httptest.NewServer
//   Framework markers: @SpringBootTest, @DataJpaTest, DatabaseTestCase, rest-assured, karate,
//                       robot framework, @Tag("integration"), pytest.mark.integration
// Covers both qualified calls (httpx.AsyncClient) and import-based unqualified usage
// (from httpx import AsyncClient; import asyncpg; from sqlalchemy import ...).
// Note: `requests.get` is intentionally kept broad — in test files it signals real HTTP.
const INTEGRATION_CONTENT_RX =
  /(?:\bimport\s+(?:httpx|asyncpg|psycopg(?:2)?|testcontainers)\b|\bfrom\s+(?:httpx|asyncpg|psycopg(?:2)?|sqlalchemy|testcontainers|fastapi\.testclient|starlette\.testclient)\s+import\b|\b(?:TestContainers?|testcontainers|DatabaseTestCase|IntegrationTest|@SpringBootTest|@DataJpaTest|httptest\.NewServer|requests\.get|requests\.post|httpx\.get|httpx\.post|httpx\.AsyncClient|httpx\.Client|asyncpg\.connect|asyncpg\.create_pool|psycopg2?\.connect|create_engine|sessionmaker|AsyncSession|TestClient|ASGITransport|supertest|axios\.get|fetch\(|k6\/http|gatling|rest[- ]?assured|karate|robot\s+framework|webdriverio|wdio|pytest\.mark\.integration|@Tag\("integration"\))\b)/i;

const INTEGRATION_FILE_NAME_RX = /integration|contract|system[_-]test/i;

// Maven/Gradle failsafe integration test suffix (FooIT.java, FooITCase.java,
// same convention for Kotlin/Scala). Case-sensitive on purpose — a
// case-insensitive check would false-positive on files like unit.java or
// visit.java, whose basenames happen to end in "it" before the extension.
const INTEGRATION_FILE_IT_SUFFIX_RX = /IT(?:Case)?\.(?:java|kt|scala)$/;

const TEST_DOCKER_GLOBS = ['docker-compose*.yml', 'docker-compose*.yaml'];

export function detectIntegrationTests(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const signals: string[] = [];

  // Signal 1: directories named integration*
  const allTestFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);

  for (const f of allTestFiles) {
    const rel = relative(repoPath, f);
    if (INTEGRATION_DIR_RX.test('/' + rel)) {
      signals.push(`integration dir: ${rel}`);
    }
    if (
      INTEGRATION_FILE_NAME_RX.test(basename(f)) ||
      INTEGRATION_FILE_IT_SUFFIX_RX.test(basename(f))
    ) {
      signals.push(`integration file name: ${rel}`);
    }
    if (signals.length >= 5) break;
  }

  // Signal 2: content-level integration patterns in test files
  if (signals.length < 5) {
    for (const f of allTestFiles.slice(0, 100)) {
      const content = readTextSafe(f);
      if (content === null) continue;
      if (INTEGRATION_CONTENT_RX.test(content)) {
        signals.push(`integration patterns in: ${relative(repoPath, f)}`);
        if (signals.length >= 5) break;
      }
    }
  }

  // Signal 3: conftest.py / test setup files — real projects often put DB/HTTP fixtures there
  if (signals.length < 5) {
    const confFiles = iterFiles(repoPath, ['conftest.py'], SOURCE_IGNORE);
    for (const f of confFiles.slice(0, 20)) {
      const content = readTextSafe(f);
      if (content === null) continue;
      if (INTEGRATION_CONTENT_RX.test(content)) {
        signals.push(`integration patterns in: ${relative(repoPath, f)}`);
        if (signals.length >= 5) break;
      }
    }
  }

  // Signal 4: docker-compose in tests/ directory
  const testsDir = join(repoPath, 'tests');
  const testDir2 = join(repoPath, 'test');
  for (const tDir of [testsDir, testDir2]) {
    if (!existsSync(tDir)) continue;
    const dcFiles = iterFiles(tDir, TEST_DOCKER_GLOBS);
    if (dcFiles.length > 0) {
      signals.push(
        `docker-compose in tests dir: ${relative(repoPath, dcFiles[0])}`
      );
    }
  }

  if (signals.length === 0) {
    return makeResult('FAIL', 0, [
      'no integration test signals found — add tests that exercise real databases, HTTP calls, or message queues',
    ]);
  }

  return makeResult('PASS', signals.length, [
    `integration test tier detected (${signals.length} signal(s))`,
    ...signals.slice(0, 10),
  ]);
}

// ---------------------------------------------------------------------------
// detectE2ETests — category 2503 (QA-06, method: detected)
//
// applies_when: topology.is_not_library
//
// Detects end-to-end tests exercising complete user flows through a real UI,
// API surface, or CLI.
//
// Signals:
//   - Recognised E2E framework config files (playwright.config.*, cypress.json, etc.)
//   - Test files whose content references E2E frameworks
//   - Directories named e2e/, e2e-tests/, acceptance/
//
// PASS  if E2E signals found.
// FAIL  if no E2E signals found.
// ---------------------------------------------------------------------------

const E2E_DIR_RX = /\/(e2e[_-]?tests?|acceptance[_-]?tests?|ui[_-]?tests?)\//i;

export function detectE2ETests(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const signals: string[] = [];

  // Signal 1: known E2E config files at repo root
  for (const glob of E2E_GLOBS) {
    const matches = iterFiles(repoPath, [glob]);
    if (matches.length > 0) {
      signals.push(`E2E config: ${relative(repoPath, matches[0])}`);
    }
  }

  // Signal 2: test files in e2e/ directories
  const testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);

  for (const f of testFiles) {
    const rel = relative(repoPath, f);
    if (E2E_DIR_RX.test('/' + rel)) {
      signals.push(`e2e dir: ${rel}`);
      if (signals.length >= 5) break;
    }
  }

  // Signal 3: E2E framework references in test files
  if (signals.length < 5) {
    for (const f of testFiles.slice(0, 100)) {
      const content = readTextSafe(f);
      if (content === null) continue;
      if (E2E_CONTENT_RX.test(content)) {
        signals.push(`E2E framework in: ${relative(repoPath, f)}`);
        if (signals.length >= 5) break;
      }
    }
  }

  if (signals.length === 0) {
    return makeResult('FAIL', 0, [
      'no end-to-end test signals found — add E2E tests with Playwright, Cypress, or similar',
    ]);
  }

  return makeResult('PASS', signals.length, [
    `E2E test tier detected (${signals.length} signal(s))`,
    ...signals.slice(0, 10),
  ]);
}

// ---------------------------------------------------------------------------
// detectTestPyramid — category 2504 (QA-07, method: computed)
//
// Checks that test distribution follows a healthy pyramid:
//   most tests unit-level, fewer integration, fewest E2E.
//
// Counting heuristic:
//   unit_count       = test files NOT in integration/ or e2e/ dirs
//   integration_count = test files in integration*/ dirs or with integration
//                       in the filename
//   e2e_count        = test files in e2e*/ or acceptance*/ dirs, or files
//                       containing E2E framework references
//
// Pyramid shape criteria:
//   PASS  if unit > integration AND (e2e == 0 OR integration >= e2e)
//   WARN  if counts exist but pyramid is inverted in one tier
//   FAIL  if clearly inverted (fewer unit than integration or e2e)
//   SKIP  if no test files found
// ---------------------------------------------------------------------------

export function detectTestPyramid(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);

  if (testFiles.length === 0) {
    return makeResult(
      'SKIP',
      null,
      ['no test files found — pyramid shape not computable'],
      'computed'
    );
  }

  let unitCount = 0;
  let integrationCount = 0;
  let e2eCount = 0;

  for (const f of testFiles) {
    const rel = '/' + relative(repoPath, f);

    if (E2E_DIR_RX.test(rel)) {
      e2eCount++;
      continue;
    }

    if (INTEGRATION_DIR_RX.test(rel) || INTEGRATION_FILE_RX.test(basename(f))) {
      integrationCount++;
      continue;
    }

    // Check content for E2E markers (quick scan)
    const content = readTextSafe(f);
    const isE2E = content !== null && E2E_CONTENT_RX.test(content);

    if (isE2E) {
      e2eCount++;
    } else {
      unitCount++;
    }
  }

  const evidence = [
    `unit: ${unitCount} | integration: ${integrationCount} | e2e: ${e2eCount}`,
  ];

  // Healthy pyramid: unit > integration, integration >= e2e (or e2e == 0)
  const unitDominates = unitCount > integrationCount;
  const e2eSmallest = e2eCount === 0 || integrationCount >= e2eCount;

  if (unitDominates && e2eSmallest) {
    return makeResult(
      'PASS',
      unitCount,
      [`test pyramid shape is healthy`, ...evidence],
      'computed'
    );
  }

  if (!unitDominates && unitCount > 0) {
    return makeResult(
      'WARN',
      integrationCount,
      [
        `test pyramid may be inverted — integration (${integrationCount}) meets or exceeds unit (${unitCount})`,
        ...evidence,
      ],
      'computed'
    );
  }

  // Unit is still the largest tier, but e2e exceeds integration — top-heavy
  // (missing-middle) shape rather than a true inversion.
  if (unitDominates && !e2eSmallest) {
    return makeResult(
      'WARN',
      unitCount,
      [
        `test pyramid top-heavy — e2e (${e2eCount}) exceeds integration (${integrationCount})`,
        ...evidence,
      ],
      'computed'
    );
  }

  return makeResult(
    'FAIL',
    0,
    [
      `test pyramid is inverted — unit (${unitCount}) is not the largest tier`,
      ...evidence,
    ],
    'computed'
  );
}

// ---------------------------------------------------------------------------
// detectCoverageConfig — category 2505 (QA-03, method: detected)
//
// Detects whether the project measures what percentage of source code is
// exercised by tests.
//
// Signals:
//   - coverage config in package.json (jest.coverageThreshold, c8, nyc)
//   - .nycrc, .nycrc.json, .c8rc
//   - pyproject.toml / setup.cfg with [tool.coverage.*]
//   - .coveragerc
//   - codecov.yml / .codecov.yml
//   - Makefile / CI workflow referencing coverage
//
// PASS  if any coverage configuration found.
// FAIL  if no coverage configuration found.
// ---------------------------------------------------------------------------

// Files whose PRESENCE alone signals a coverage setup.
const COVERAGE_CONFIG_FILES = [
  '.nycrc',
  '.nycrc.json',
  '.c8rc',
  '.coveragerc',
  'codecov.yml',
  '.codecov.yml',
  'jest.config.ts',
  'jest.config.js',
  'jest.config.json',
  'vitest.config.ts',
  'vitest.config.js',
  '.simplecov', // SimpleCov (Ruby)
  'tarpaulin.toml', // cargo-tarpaulin (Rust)
  'lcov.info', // LCOV output — coverage was generated
  '.coverage', // Python coverage.py output file
];

// Files where CONTENT is checked for coverage patterns.
const COVERAGE_CONTENT_SCAN_FILES = [
  'pytest.ini',
  'tox.ini',
  'pyproject.toml',
  'setup.cfg',
  'package.json',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Makefile',
];

const COVERAGE_CONTENT_RX =
  /coverageThreshold|coverage[_-]?report|coverage[_-]?min|(?:\[tool\.coverage)|codecov|nyc|c8\b|--coverage\b|--cov\b|pytest-cov|JaCoCo|jacoco|go\s+test.*-cover|SimpleCov|tarpaulin/i;

export function detectCoverageConfig(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const signals: string[] = [];

  // Check known coverage config files (presence is sufficient signal).
  for (const name of COVERAGE_CONFIG_FILES) {
    const full = join(repoPath, name);
    if (existsSync(full)) {
      signals.push(`coverage config: ${name}`);
    }
  }

  // Check content-scanned files for coverage patterns.
  for (const name of COVERAGE_CONTENT_SCAN_FILES) {
    const full = join(repoPath, name);
    if (!existsSync(full)) continue;
    const content = readTextSafe(full);
    if (content === null) continue;
    if (COVERAGE_CONTENT_RX.test(content)) {
      signals.push(`coverage settings in ${name}`);
    }
  }

  if (signals.length > 0) {
    return makeResult('PASS', signals.length, [
      `coverage measurement configured (${signals.length} signal(s))`,
      ...signals,
    ]);
  }

  return makeResult('FAIL', 0, [
    'no test coverage configuration found — add jest/vitest coverage, .coveragerc, or codecov',
  ]);
}

// ---------------------------------------------------------------------------
// detectTestDataManagement — category 2506 (QA-08, method: detected)
//
// Detects whether tests use a structured approach to test data rather than
// scattering hardcoded inline values.
//
// Signals:
//   - fixtures/ or testdata/ directory with data files
//   - factory / builder patterns in test files (factory_boy, FactoryGirl,
//     faker, Test::Factory, data-builder, TestDataBuilder)
//   - shared test helpers / setup files (conftest.py, test_helpers.*, test/helpers/*)
//
// PASS  if any structured test data management found.
// FAIL  if no such patterns found.
// ---------------------------------------------------------------------------

const FIXTURE_DIR_NAMES = [
  'fixtures',
  'testdata',
  'test-data',
  'test_data',
  '__fixtures__',
  'factories',
  'factory',
];

const FACTORY_CONTENT_RX =
  /\b(factory_boy|FactoryGirl|FactoryBot|faker|Faker|TestDataBuilder|test[_-]?factory|data[_-]?builder|use_factory|create_factory|generate_fake)\b/i;

const CONFTEST_GLOBS = ['conftest.py', 'test_helpers.*', 'test-helpers.*'];

export function detectTestDataManagement(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const signals: string[] = [];

  // Signal 1: fixture/testdata directories
  for (const name of FIXTURE_DIR_NAMES) {
    const full = join(repoPath, name);
    if (existsSync(full)) {
      signals.push(`fixture directory: ${name}/`);
      break;
    }
    // Also check inside test/ and tests/
    for (const testRoot of ['test', 'tests', '__tests__']) {
      const nested = join(repoPath, testRoot, name);
      if (existsSync(nested)) {
        signals.push(`fixture directory: ${testRoot}/${name}/`);
        break;
      }
    }
    if (signals.length > 0) break;
  }

  // Signal 2: factory / faker patterns in test files
  const testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);

  for (const f of testFiles.slice(0, 80)) {
    const content = readTextSafe(f);
    if (content === null) continue;
    if (FACTORY_CONTENT_RX.test(content)) {
      signals.push(`factory/faker patterns in: ${relative(repoPath, f)}`);
      if (signals.length >= 3) break;
    }
  }

  // Signal 3: conftest.py or test helpers
  const confFiles = iterFiles(repoPath, CONFTEST_GLOBS, SOURCE_IGNORE);
  if (confFiles.length > 0) {
    signals.push(`test setup/helper file: ${relative(repoPath, confFiles[0])}`);
  }

  if (signals.length > 0) {
    return makeResult('PASS', signals.length, [
      `structured test data management detected (${signals.length} signal(s))`,
      ...signals,
    ]);
  }

  return makeResult('FAIL', 0, [
    'no structured test data management found — add fixtures/ directory, factory patterns, or conftest.py',
  ]);
}

// ---------------------------------------------------------------------------
// detectMockingIsolation — category 2507 (QA-09, method: detected)
//
// Detects whether tests use mocking/stubbing to isolate the code under test
// from external dependencies.
//
// Signals (any of):
//   - Mock/stub/spy imports in test files
//   - DI framework usage (inversify, spring, fastapi.Depends, etc.)
//   - Mock decorators or fixtures (pytest-mock, unittest.mock, jest.mock)
//
// PASS  if mocking signals found.
// FAIL  if no mocking signals found.
// ---------------------------------------------------------------------------

const MOCK_IMPORT_RX =
  /\b(?:jest\.mock|vi\.mock|sinon|mockery|unittest\.mock|from\s+unittest\s+import\s+mock|from\s+unittest\.mock|pytest[_-]mock|testify\/mock|mockito|EasyMock|Mockery|mocker\.patch|mock\.patch|@MockBean|@Mock\b)\b/i;

export function detectMockingIsolation(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);

  if (testFiles.length === 0) {
    return makeResult('FAIL', 0, [
      'no test files found — mocking/isolation not detectable',
    ]);
  }

  const signals = scanForSignal(repoPath, TEST_FILE_GLOBS, MOCK_IMPORT_RX, {
    fileLimit: 100,
    matchLimit: 5,
    ignore: SOURCE_IGNORE,
  }).map((rel) => `mock/stub usage in: ${rel}`);

  if (signals.length > 0) {
    return makeResult('PASS', signals.length, [
      `mocking/stubbing patterns detected in ${signals.length} test file(s)`,
      ...signals,
    ]);
  }

  return makeResult('FAIL', 0, [
    'no mocking/stubbing patterns found in test files — tests may have real I/O dependencies',
  ]);
}

// ---------------------------------------------------------------------------
// detectContractTests — category 2508 (QA-10, method: detected)
//
// applies_when: topology.is_multi_service
//
// Detects consumer-driven contract tests ensuring producers do not break
// consumers.
//
// Signals:
//   - Pact framework imports / config files (pact, pact-python, pactflow)
//   - Spring Cloud Contract files
//   - Provider verification patterns
//   - Directory named contracts/ or pacts/
//
// PASS  if contract test signals found.
// FAIL  if no contract signals found.
// SKIP  would normally apply for single-service, but we attempt detection
//       regardless (the orchestrator applies topology.is_multi_service as a
//       filter; FAIL here is acceptable for single-service repos).
// ---------------------------------------------------------------------------

const CONTRACT_CONFIG_GLOBS = ['pact.config.*', '*.pact.ts', '*.pact.js'];
const CONTRACT_DIR_NAMES = ['pacts', 'contracts', 'contract-tests'];

const CONTRACT_CONTENT_RX =
  /\b(?:Pact|pact|PactV[23]|InteractionBuilder|spring[_-]cloud[_-]contract|provider[_-]?verification|consumer[_-]?contract|@PactTestFor|@Provider|messageProvider)\b/i;

export function detectContractTests(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const signals: string[] = [];

  // Known contract config files
  const contractConfigs = iterFiles(
    repoPath,
    CONTRACT_CONFIG_GLOBS,
    SOURCE_IGNORE
  );
  if (contractConfigs.length > 0) {
    signals.push(`contract config: ${relative(repoPath, contractConfigs[0])}`);
  }

  // Known contract directories
  for (const name of CONTRACT_DIR_NAMES) {
    if (existsSync(join(repoPath, name))) {
      signals.push(`contract directory: ${name}/`);
      break;
    }
  }

  // Content scan in test files
  if (signals.length < 3) {
    const testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);
    for (const f of testFiles.slice(0, 100)) {
      const content = readTextSafe(f);
      if (content === null) continue;
      if (CONTRACT_CONTENT_RX.test(content)) {
        signals.push(`Pact/contract patterns in: ${relative(repoPath, f)}`);
        if (signals.length >= 3) break;
      }
    }
  }

  if (signals.length > 0) {
    return makeResult('PASS', signals.length, [
      `contract testing detected (${signals.length} signal(s))`,
      ...signals,
    ]);
  }

  return makeResult('FAIL', 0, [
    'no consumer-driven contract test signals found — add Pact or Spring Cloud Contract for multi-service verification',
  ]);
}

// ---------------------------------------------------------------------------
// detectMlIterationTests — category 2509 (QA-11, method: detected)
//
// applies_when: topology.has_ml_layer
//
// Detects whether ML models are tested for quality metrics as part of the
// development cycle.
//
// Signals:
//   - ML testing framework imports: pytest-ml, evidently, deepchecks, great_expectations,
//     mlflow model evaluation, alibi-detect, alibi-explain, great-expectations
//   - Metric assertion patterns: assert accuracy/f1/precision/recall/rmse > threshold
//   - Test files with ml/model in the name under a tests/ directory
//
// PASS  if ML testing signals found.
// FAIL  if no ML testing signals found.
// SKIP  if no ML-related source files detected.
// ---------------------------------------------------------------------------

// pandas/numpy are deliberately absent: they are general data-wrangling
// libraries, and their presence alone (ETL scripts, analytics notebooks)
// does not make a project an ML project subject to QA-11.
const ML_SOURCE_RX =
  /\b(?:sklearn|scikit-learn|torch|tensorflow|keras|transformers|xgboost|lightgbm|catboost|mlflow)\b/i;

const ML_TEST_CONTENT_RX =
  /\b(?:assert.*(?:accuracy|f1[_-]score|precision|recall|rmse|mae|auc|roc_auc)|evidently|deepchecks|great_expectations|mlflow\.evaluate|ModelCard|alibi|check_model|model_performance)\b/i;

const ML_TEST_FILE_RX =
  /(?:test[_-]model|model[_-]test|test[_-]ml|ml[_-]test|test[_-]metrics)/i;

export function detectMlIterationTests(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  // Check if this is an ML project at all
  let hasML = false;
  const sourceSample = iterFiles(
    repoPath,
    ['*.py', '*.ipynb'],
    SOURCE_IGNORE
  ).slice(0, 50);

  for (const f of sourceSample) {
    const content = readTextSafe(f);
    if (content === null) continue;
    if (ML_SOURCE_RX.test(content)) {
      hasML = true;
      break;
    }
  }

  if (!hasML) {
    return makeResult(
      'SKIP',
      null,
      ['no ML framework usage detected — QA-11 not applicable'],
      'detected'
    );
  }

  // Look for ML quality test signals
  const signals: string[] = [];

  const testFiles = iterFiles(repoPath, TEST_FILE_GLOBS, SOURCE_IGNORE);

  for (const f of testFiles.slice(0, 100)) {
    const rel = relative(repoPath, f);
    if (ML_TEST_FILE_RX.test(basename(f))) {
      signals.push(`ML test file: ${rel}`);
      if (signals.length >= 5) break;
    }
    const content = readTextSafe(f);
    if (content === null) continue;
    if (ML_TEST_CONTENT_RX.test(content)) {
      signals.push(`ML quality assertions in: ${rel}`);
      if (signals.length >= 5) break;
    }
  }

  if (signals.length > 0) {
    return makeResult('PASS', signals.length, [
      `ML iteration testing detected (${signals.length} signal(s))`,
      ...signals,
    ]);
  }

  return makeResult('FAIL', 0, [
    'ML framework detected but no quality metric testing found — add evidently, deepchecks, or assert metric thresholds',
  ]);
}

// ---------------------------------------------------------------------------
// DETECTORS — maps each quality-assurance code to its function.
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  2500: detectTestInfrastructure, // QA-01 test infrastructure + coverage proxy (computed)
  2501: detectUnitTests, // QA-04 unit test tier (detected)
  2502: detectIntegrationTests, // QA-05 integration test tier (detected)
  2503: detectE2ETests, // QA-06 E2E test tier (detected)
  2504: detectTestPyramid, // QA-07 pyramid shape (computed)
  2505: detectCoverageConfig, // QA-03 coverage reporting config (detected)
  2506: detectTestDataManagement, // QA-08 test data management (detected)
  2507: detectMockingIsolation, // QA-09 test isolation/mocking (detected)
  2508: detectContractTests, // QA-10 contract testing (detected)
  2509: detectMlIterationTests, // QA-11 ML iteration testing (detected)
};
