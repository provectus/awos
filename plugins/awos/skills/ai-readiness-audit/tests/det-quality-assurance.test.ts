import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectTestInfrastructure,
  detectUnitTests,
  detectIntegrationTests,
  detectE2ETests,
  detectTestPyramid,
  detectCoverageConfig,
  detectTestDataManagement,
  detectMockingIsolation,
  detectContractTests,
  detectMlIterationTests,
  DETECTORS,
} from '../detectors/quality_assurance.ts';
import { tmpDir } from './helpers.ts';

function tmp(): string {
  return tmpDir('qa-');
}

// ---------------------------------------------------------------------------
// detectTestInfrastructure (2500 — QA-01, computed)
// ---------------------------------------------------------------------------

test('QA-01: no source files returns SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# project\n');
  const r = detectTestInfrastructure(t);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.method, 'computed');
});

test('QA-01: zero tests and some source files is FAIL (0% ratio)', () => {
  const t = tmp();
  mkdirSync(join(t, 'src'));
  for (let i = 0; i < 5; i++) {
    writeFileSync(join(t, 'src', `module${i}.ts`), `export const x${i} = 1;\n`);
  }
  const r = detectTestInfrastructure(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'computed');
});

test('QA-01: 3 test files for 3 source files is PASS (100% ratio)', () => {
  const t = tmp();
  mkdirSync(join(t, 'src'));
  for (let i = 0; i < 3; i++) {
    writeFileSync(join(t, 'src', `module${i}.ts`), `export const x${i} = 1;\n`);
    writeFileSync(
      join(t, 'src', `module${i}.test.ts`),
      `import { x${i} } from './module${i}';\n`
    );
  }
  const r = detectTestInfrastructure(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'computed');
});

test('QA-01: 4 test files for 10 source files is WARN (40% ratio)', () => {
  const t = tmp();
  mkdirSync(join(t, 'src'));
  for (let i = 0; i < 10; i++) {
    writeFileSync(join(t, 'src', `m${i}.ts`), `export const x = ${i};\n`);
  }
  // 4/10 = 0.4, which is >= 0.3 (WARN) but < 0.6 (PASS)
  for (let i = 0; i < 4; i++) {
    writeFileSync(join(t, 'src', `m${i}.test.ts`), `test("m${i}", () => {})\n`);
  }
  const r = detectTestInfrastructure(t);
  assert.equal(r.status, 'WARN');
});

// ---------------------------------------------------------------------------
// detectUnitTests (2501 — QA-04, detected)
// ---------------------------------------------------------------------------

test('QA-04: no test files is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectUnitTests(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-04: test files present is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'tests'));
  writeFileSync(
    join(t, 'tests', 'test_app.py'),
    'def test_main():\n    pass\n'
  );
  const r = detectUnitTests(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('QA-04: spec file is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'spec'));
  writeFileSync(join(t, 'spec', 'app.spec.ts'), 'it("works", () => {})\n');
  const r = detectUnitTests(t);
  assert.equal(r.status, 'PASS');
});

test('QA-04: Jest mock usage in test file is detected as unit signal', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.test.ts'),
    'jest.mock("./db");\ntest("fetches", () => {});\n'
  );
  const r = detectUnitTests(t);
  assert.equal(r.status, 'PASS');
  assert.ok(
    r.evidence.some((e) => e.includes('mock')),
    'evidence must cite the jest.mock unit-test signal'
  );
});

// ---------------------------------------------------------------------------
// detectIntegrationTests (2502 — QA-05, detected)
// ---------------------------------------------------------------------------

test('QA-05: no integration signals is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectIntegrationTests(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-05: integration/ directory with test files is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'integration'));
  writeFileSync(
    join(t, 'integration', 'db.test.ts'),
    'it("connects", async () => {})\n'
  );
  const r = detectIntegrationTests(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('QA-05: TestContainers import in test file is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.test.ts'),
    'import { GenericContainer } from "testcontainers";\nit("real db", async () => {});\n'
  );
  const r = detectIntegrationTests(t);
  assert.equal(r.status, 'PASS');
});

test('QA-05: httpx + DB fixture in test file (no integration dir/marker) is PASS', () => {
  // Regression: real integration tests using httpx + asyncpg without an
  // explicit "integration/" directory or @pytest.mark.integration must
  // still be detected via content signals.
  const t = tmp();
  mkdirSync(join(t, 'tests'));
  // A conftest that sets up a real DB connection — DB fixture signal
  writeFileSync(
    join(t, 'tests', 'conftest.py'),
    [
      'import pytest',
      'import asyncpg',
      '',
      '@pytest.fixture',
      'async def db_pool():',
      '    pool = await asyncpg.create_pool(dsn="postgresql://localhost/testdb")',
      '    yield pool',
      '    await pool.close()',
    ].join('\n') + '\n'
  );
  // A test that uses httpx.AsyncClient against a real ASGI app
  writeFileSync(
    join(t, 'tests', 'test_api.py'),
    [
      'import pytest',
      'import httpx',
      'from myapp import app',
      '',
      '@pytest.mark.anyio',
      'async def test_create_item(db_pool):',
      '    async with httpx.AsyncClient(app=app, base_url="http://test") as client:',
      '        resp = await client.post("/items", json={"name": "foo"})',
      '    assert resp.status_code == 201',
    ].join('\n') + '\n'
  );
  const r = detectIntegrationTests(t);
  assert.equal(
    r.status,
    'PASS',
    'httpx + asyncpg test must be detected as integration'
  );
  assert.ok((r.value as number) > 0, 'signal count must be positive');
});

test('QA-05: pure mock unit test (no real I/O) is NOT counted as integration — stays FAIL', () => {
  // A test that only uses MagicMock / jest.fn — no real HTTP or DB client.
  // The overall result should be FAIL because no integration signals are present.
  const t = tmp();
  writeFileSync(
    join(t, 'test_unit.py'),
    [
      'from unittest.mock import MagicMock, patch',
      '',
      'def test_service_calls_repo():',
      '    repo = MagicMock()',
      '    repo.find.return_value = {"id": 1}',
      '    service = MyService(repo)',
      '    result = service.get(1)',
      '    repo.find.assert_called_once_with(1)',
    ].join('\n') + '\n'
  );
  const r = detectIntegrationTests(t);
  assert.equal(
    r.status,
    'FAIL',
    'pure mock unit test must not be detected as integration'
  );
});

test('QA-05: httpx.AsyncClient in test file alone is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'test_http.py'),
    'import httpx\nasync def test_endpoint():\n    async with httpx.AsyncClient() as c:\n        r = await c.get("http://localhost:8000/health")\n    assert r.status_code == 200\n'
  );
  const r = detectIntegrationTests(t);
  assert.equal(r.status, 'PASS');
});

test('QA-05: sqlalchemy create_engine in test file is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'test_db.py'),
    'from sqlalchemy import create_engine\ndef test_schema():\n    engine = create_engine("postgresql://localhost/db")\n    with engine.connect() as conn:\n        conn.execute("SELECT 1")\n'
  );
  const r = detectIntegrationTests(t);
  assert.equal(r.status, 'PASS');
});

test('QA-05: TestClient (ASGI transport) in test file is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'test_asgi.py'),
    'from starlette.testclient import TestClient\nfrom myapp import app\ndef test_homepage():\n    client = TestClient(app)\n    response = client.get("/")\n    assert response.status_code == 200\n'
  );
  const r = detectIntegrationTests(t);
  assert.equal(r.status, 'PASS');
});

test('QA-05: from httpx import AsyncClient + from asyncpg import (unqualified, conftest) — PASS', () => {
  // Mirrors the onex-discovery-api pattern: conftest.py uses import-based
  // unqualified forms only — no httpx.AsyncClient or asyncpg.connect prefix.
  // The detector must catch this via import signals + conftest scanning.
  const t = tmp();
  mkdirSync(join(t, 'tests'));
  writeFileSync(
    join(t, 'tests', 'conftest.py'),
    [
      'import pytest',
      'from httpx import ASGITransport, AsyncClient',
      'from asyncpg import connect',
      '',
      '@pytest.fixture',
      'async def client(app):',
      '    transport = ASGITransport(app=app)',
      '    async with AsyncClient(transport=transport, base_url="http://test") as ac:',
      '        yield ac',
      '',
      '@pytest.fixture',
      'async def db_conn():',
      '    conn = await connect(dsn="postgresql://localhost/testdb")',
      '    yield conn',
      '    await conn.close()',
    ].join('\n') + '\n'
  );
  // test file uses fixtures but has no httpx/asyncpg references itself
  writeFileSync(
    join(t, 'tests', 'test_api.py'),
    [
      'import pytest',
      '',
      'async def test_create(client, db_conn):',
      '    resp = await client.post("/items", json={"name": "foo"})',
      '    assert resp.status_code == 201',
    ].join('\n') + '\n'
  );
  const r = detectIntegrationTests(t);
  assert.equal(
    r.status,
    'PASS',
    'import-based httpx/asyncpg in conftest must be detected as integration'
  );
  assert.ok((r.value as number) > 0, 'signal count must be positive');
});

// ---------------------------------------------------------------------------
// detectE2ETests (2503 — QA-06, detected)
// ---------------------------------------------------------------------------

test('QA-06: no E2E signals is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectE2ETests(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-06: playwright.config.ts at root is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'playwright.config.ts'),
    'import { defineConfig } from "@playwright/test";\nexport default defineConfig({});\n'
  );
  const r = detectE2ETests(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(
    r.evidence.some((e) => e.includes('playwright')),
    'evidence must cite the playwright config as the E2E signal'
  );
});

test('QA-06: cypress import in test file is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'e2e'));
  writeFileSync(
    join(t, 'e2e', 'login.spec.ts'),
    'import cypress from "cypress";\ndescribe("login", () => {});\n'
  );
  const r = detectE2ETests(t);
  assert.equal(r.status, 'PASS');
});

test('QA-06: test file in e2e/ dir is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'e2e-tests'));
  writeFileSync(
    join(t, 'e2e-tests', 'flow.test.ts'),
    'test("flow", () => {})\n'
  );
  const r = detectE2ETests(t);
  assert.equal(r.status, 'PASS');
});

// ---------------------------------------------------------------------------
// detectTestPyramid (2504 — QA-07, computed)
// ---------------------------------------------------------------------------

test('QA-07: no test files returns SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectTestPyramid(t);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.method, 'computed');
});

test('QA-07: mostly unit tests with no E2E is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'tests'));
  for (let i = 0; i < 8; i++) {
    writeFileSync(join(t, 'tests', `test_unit${i}.py`), 'def test_x(): pass\n');
  }
  mkdirSync(join(t, 'tests', 'integration'));
  writeFileSync(
    join(t, 'tests', 'integration', 'test_db.py'),
    'def test_db(): pass\n'
  );
  const r = detectTestPyramid(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'computed');
});

test('QA-07: more integration than unit is WARN or FAIL', () => {
  const t = tmp();
  // 2 unit, 10 integration
  writeFileSync(join(t, 'unit1.test.ts'), 'test("u1", () => {})\n');
  writeFileSync(join(t, 'unit2.test.ts'), 'test("u2", () => {})\n');
  mkdirSync(join(t, 'integration'));
  for (let i = 0; i < 10; i++) {
    writeFileSync(
      join(t, 'integration', `int${i}.test.ts`),
      'test("int", () => {})\n'
    );
  }
  const r = detectTestPyramid(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    `expected WARN or FAIL, got ${r.status}`
  );
  assert.equal(r.method, 'computed');
});

// ---------------------------------------------------------------------------
// detectCoverageConfig (2505 — QA-03, detected)
// ---------------------------------------------------------------------------

test('QA-03: no coverage config is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectCoverageConfig(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-03: .coveragerc present is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, '.coveragerc'),
    '[run]\nsource = src\n[report]\nfail_under = 80\n'
  );
  const r = detectCoverageConfig(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(
    r.evidence.some((e) => e.includes('.coveragerc')),
    'evidence must cite .coveragerc as the coverage config'
  );
});

test('QA-03: codecov.yml present is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'codecov.yml'), 'coverage:\n  minimum: 80\n');
  const r = detectCoverageConfig(t);
  assert.equal(r.status, 'PASS');
});

test('QA-03: package.json with coverageThreshold is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'package.json'),
    JSON.stringify({
      jest: {
        coverageThreshold: { global: { branches: 80, lines: 80 } },
      },
    })
  );
  const r = detectCoverageConfig(t);
  assert.equal(r.status, 'PASS');
  assert.ok(
    r.evidence.some((e) => e.includes('package.json')),
    'evidence must cite the package.json jest coverageThreshold'
  );
});

// ---------------------------------------------------------------------------
// detectTestDataManagement (2506 — QA-08, detected)
// ---------------------------------------------------------------------------

test('QA-08: no test data signals is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectTestDataManagement(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-08: fixtures/ directory at root is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'fixtures'));
  writeFileSync(join(t, 'fixtures', 'user.json'), '{"id": 1}\n');
  const r = detectTestDataManagement(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(
    r.evidence.some((e) => e.includes('fixtures')),
    'evidence must cite the fixtures/ directory'
  );
});

test('QA-08: factory_boy import in test file is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'tests'));
  writeFileSync(
    join(t, 'tests', 'test_user.py'),
    'import factory_boy\nclass UserFactory(factory_boy.Factory): pass\n'
  );
  const r = detectTestDataManagement(t);
  assert.equal(r.status, 'PASS');
});

test('QA-08: conftest.py present is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'conftest.py'),
    'import pytest\n@pytest.fixture\ndef client(): pass\n'
  );
  const r = detectTestDataManagement(t);
  assert.equal(r.status, 'PASS');
  assert.ok(
    r.evidence.some((e) => e.includes('conftest.py')),
    'evidence must cite conftest.py as the pytest-fixture signal'
  );
});

// ---------------------------------------------------------------------------
// detectMockingIsolation (2507 — QA-09, detected)
// ---------------------------------------------------------------------------

test('QA-09: no test files is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectMockingIsolation(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-09: jest.mock in test file is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.test.ts'),
    'jest.mock("./db");\ntest("fetches", () => {});\n'
  );
  const r = detectMockingIsolation(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(
    r.evidence.some((e) => e.includes('app.test.ts')),
    'evidence must name the test file using jest.mock'
  );
});

test('QA-09: unittest.mock import in Python test is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'tests'));
  writeFileSync(
    join(t, 'tests', 'test_service.py'),
    'from unittest import mock\ndef test_service(): pass\n'
  );
  const r = detectMockingIsolation(t);
  assert.equal(r.status, 'PASS');
});

test('QA-09: test file without mock signals is FAIL', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.test.ts'),
    'test("trivial", () => { expect(1).toBe(1); });\n'
  );
  const r = detectMockingIsolation(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectContractTests (2508 — QA-10, detected)
// ---------------------------------------------------------------------------

test('QA-10: no contract signals is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectContractTests(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-10: pacts/ directory present is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'pacts'));
  writeFileSync(join(t, 'pacts', 'consumer-provider.json'), '{}');
  const r = detectContractTests(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(
    r.evidence.some((e) => e.includes('pact')),
    'evidence must cite the pacts/ contract directory'
  );
});

test('QA-10: Pact import in test file is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'consumer.test.ts'),
    'import { Pact } from "@pact-foundation/pact";\ntest("contract", () => {});\n'
  );
  const r = detectContractTests(t);
  assert.equal(r.status, 'PASS');
});

// ---------------------------------------------------------------------------
// detectMlIterationTests (2509 — QA-11, detected)
// ---------------------------------------------------------------------------

test('QA-11: no ML framework detected returns SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.ts'), 'console.log("hello")\n');
  const r = detectMlIterationTests(t);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.method, 'detected');
});

test('QA-11: pandas/numpy-only data scripts are not an ML project (SKIP)', () => {
  const t = tmp();
  // General data wrangling — no ML framework — must not subject the repo to
  // the ML-iteration-tests requirement.
  writeFileSync(
    join(t, 'etl.py'),
    'import pandas as pd\nimport numpy as np\ndf = pd.read_csv("data.csv")\nprint(np.mean(df["x"]))\n'
  );
  const r = detectMlIterationTests(t);
  assert.equal(
    r.status,
    'SKIP',
    `pandas/numpy alone must not classify the repo as ML (QA-11 SKIP); got ${r.status}`
  );
});

test('QA-11: ML project with no quality tests is FAIL', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'train.py'),
    'import sklearn\nfrom sklearn import svm\n'
  );
  writeFileSync(join(t, 'test_train.py'), 'def test_train(): pass\n');
  const r = detectMlIterationTests(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-11: ML project with evidently-like assertions is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'train.py'),
    'import sklearn\nfrom sklearn import tree\n'
  );
  writeFileSync(
    join(t, 'test_model.py'),
    'import sklearn\nassert accuracy_score(y_true, y_pred) > 0.85\n'
  );
  const r = detectMlIterationTests(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(
    r.evidence.some((e) => e.includes('test_model.py')),
    'evidence must name the ML quality test file'
  );
});

// ---------------------------------------------------------------------------
// C5 broadened coverage — new tests for Phase C additions
// ---------------------------------------------------------------------------

test('QA-04: flat tests/ dir (no unit/ subdir) still returns PASS', () => {
  // Flat tests/ directory with no unit/ or __tests__/ tier split.
  // The broadened globs should find the test files and still return PASS.
  const t = tmp();
  mkdirSync(join(t, 'tests'));
  writeFileSync(join(t, 'tests', 'test_app.py'), 'def test_main(): pass\n');
  writeFileSync(join(t, 'tests', 'test_db.py'), 'def test_db(): pass\n');
  const r = detectUnitTests(t);
  assert.equal(
    r.status,
    'PASS',
    'flat tests/ dir without unit/ subdir must still PASS'
  );
});

test('QA-03: pytest.ini with --cov returns PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'pytest.ini'),
    '[pytest]\naddopts = --cov=src --cov-report=term-missing\n'
  );
  const r = detectCoverageConfig(t);
  assert.equal(r.status, 'PASS', 'pytest.ini with --cov must return PASS');
});

test('QA-03: tox.ini with pytest-cov returns PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'tox.ini'), '[pytest]\naddopts = --cov=mypackage\n');
  const r = detectCoverageConfig(t);
  assert.equal(r.status, 'PASS', 'tox.ini with pytest-cov must return PASS');
});

test('QA-06: Vitest reference is NOT an E2E signal (unit runner, not a browser driver) — B1', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.spec.ts'),
    'import { vitest } from "vitest";\ntest("x", () => {});\n'
  );
  const r = detectE2ETests(t);
  assert.notEqual(
    r.status,
    'PASS',
    'importing the vitest unit runner must not count as E2E evidence'
  );
});

test('QA-06: Playwright reference in test file IS detected as E2E signal', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'flow.spec.ts'),
    'import { test } from "@playwright/test";\ntest("x", async ({ page }) => {});\n'
  );
  const r = detectE2ETests(t);
  assert.equal(
    r.status,
    'PASS',
    'a playwright import must be detected as an E2E signal'
  );
});

test('QA-05: k6 reference in test file returns PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'load.test.js'),
    'import http from "k6/http";\nexport default function() { http.get("http://test.k6.io"); }\n'
  );
  const r = detectIntegrationTests(t);
  assert.equal(
    r.status,
    'PASS',
    'k6 reference should be detected as integration'
  );
});

// ---------------------------------------------------------------------------
// DETECTORS map
// ---------------------------------------------------------------------------

test('DETECTORS map contains codes 2500-2509', () => {
  for (const code of [
    2500, 2501, 2502, 2503, 2504, 2505, 2506, 2507, 2508, 2509,
  ]) {
    assert.ok(code in DETECTORS, `DETECTORS must include ${code}`);
  }
});

test('DETECTORS[2500] dispatches to detectTestInfrastructure', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# project\n');
  const direct = detectTestInfrastructure(t);
  const viaMap = DETECTORS[2500](t);
  assert.equal(viaMap.status, direct.status);
  assert.equal(viaMap.method, 'computed');
});

test('DETECTORS[2504] dispatches to detectTestPyramid', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# project\n');
  const r = DETECTORS[2504](t);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.method, 'computed');
});

test('DETECTORS[2509] dispatches to detectMlIterationTests', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.ts'), 'console.log(1)\n');
  const r = DETECTORS[2509](t);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.method, 'detected');
});

// ---------------------------------------------------------------------------
// Verdict-threshold params (standards.toml pass_at/warn_at/fail_at)
// ---------------------------------------------------------------------------

test('QA-01: warn_at param is honored — 40% ratio is WARN by default but FAIL with warn_at 0.5', () => {
  const t = tmp();
  mkdirSync(join(t, 'src'));
  for (let i = 0; i < 10; i++) {
    writeFileSync(join(t, 'src', `m${i}.ts`), `export const x = ${i};\n`);
  }
  for (let i = 0; i < 4; i++) {
    writeFileSync(join(t, 'src', `m${i}.test.ts`), `test("m${i}", () => {})\n`);
  }
  // 4/10 = 0.4 — WARN with the default warn_at (0.3)
  assert.equal(
    detectTestInfrastructure(t).status,
    'WARN',
    '0.4 ratio must be WARN under the default warn_at 0.3'
  );
  // Raising warn_at above the ratio must flip the verdict to FAIL
  const r = detectTestInfrastructure(t, { warn_at: 0.5 });
  assert.equal(
    r.status,
    'FAIL',
    'warn_at param must be honored: 0.4 ratio with warn_at 0.5 must FAIL'
  );
  assert.ok(
    r.evidence.some((e) => e.includes('below 50% threshold')),
    `FAIL evidence must cite the resolved warn_at (50%), got: ${r.evidence[0]}`
  );
});
