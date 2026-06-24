import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'qa-'));
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
// detectUnitTests (2501 — QA-02, detected)
// ---------------------------------------------------------------------------

test('QA-02: no test files is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectUnitTests(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-02: test files present is PASS', () => {
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

test('QA-02: spec file is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'spec'));
  writeFileSync(join(t, 'spec', 'app.spec.ts'), 'it("works", () => {})\n');
  const r = detectUnitTests(t);
  assert.equal(r.status, 'PASS');
});

test('QA-02: Jest mock usage in test file is detected as unit signal', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.test.ts'),
    'jest.mock("./db");\ntest("fetches", () => {});\n'
  );
  const r = detectUnitTests(t);
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.some((e) => e.includes('mock')));
});

// ---------------------------------------------------------------------------
// detectIntegrationTests (2502 — QA-03, detected)
// ---------------------------------------------------------------------------

test('QA-03: no integration signals is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectIntegrationTests(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-03: integration/ directory with test files is PASS', () => {
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

test('QA-03: TestContainers import in test file is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.test.ts'),
    'import { GenericContainer } from "testcontainers";\nit("real db", async () => {});\n'
  );
  const r = detectIntegrationTests(t);
  assert.equal(r.status, 'PASS');
});

// ---------------------------------------------------------------------------
// detectE2ETests (2503 — QA-04, detected)
// ---------------------------------------------------------------------------

test('QA-04: no E2E signals is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectE2ETests(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-04: playwright.config.ts at root is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'playwright.config.ts'),
    'import { defineConfig } from "@playwright/test";\nexport default defineConfig({});\n'
  );
  const r = detectE2ETests(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(r.evidence.some((e) => e.includes('playwright')));
});

test('QA-04: cypress import in test file is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'e2e'));
  writeFileSync(
    join(t, 'e2e', 'login.spec.ts'),
    'import cypress from "cypress";\ndescribe("login", () => {});\n'
  );
  const r = detectE2ETests(t);
  assert.equal(r.status, 'PASS');
});

test('QA-04: test file in e2e/ dir is PASS', () => {
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
// detectTestPyramid (2504 — QA-05, computed)
// ---------------------------------------------------------------------------

test('QA-05: no test files returns SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectTestPyramid(t);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.method, 'computed');
});

test('QA-05: mostly unit tests with no E2E is PASS', () => {
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

test('QA-05: more integration than unit is WARN or FAIL', () => {
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
// detectCoverageConfig (2505 — QA-06, detected)
// ---------------------------------------------------------------------------

test('QA-06: no coverage config is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectCoverageConfig(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-06: .coveragerc present is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, '.coveragerc'),
    '[run]\nsource = src\n[report]\nfail_under = 80\n'
  );
  const r = detectCoverageConfig(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(r.evidence.some((e) => e.includes('.coveragerc')));
});

test('QA-06: codecov.yml present is PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'codecov.yml'), 'coverage:\n  minimum: 80\n');
  const r = detectCoverageConfig(t);
  assert.equal(r.status, 'PASS');
});

test('QA-06: package.json with coverageThreshold is PASS', () => {
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
  assert.ok(r.evidence.some((e) => e.includes('package.json')));
});

// ---------------------------------------------------------------------------
// detectTestDataManagement (2506 — QA-07, detected)
// ---------------------------------------------------------------------------

test('QA-07: no test data signals is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectTestDataManagement(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-07: fixtures/ directory at root is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'fixtures'));
  writeFileSync(join(t, 'fixtures', 'user.json'), '{"id": 1}\n');
  const r = detectTestDataManagement(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(r.evidence.some((e) => e.includes('fixtures')));
});

test('QA-07: factory_boy import in test file is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'tests'));
  writeFileSync(
    join(t, 'tests', 'test_user.py'),
    'import factory_boy\nclass UserFactory(factory_boy.Factory): pass\n'
  );
  const r = detectTestDataManagement(t);
  assert.equal(r.status, 'PASS');
});

test('QA-07: conftest.py present is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'conftest.py'),
    'import pytest\n@pytest.fixture\ndef client(): pass\n'
  );
  const r = detectTestDataManagement(t);
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.some((e) => e.includes('conftest.py')));
});

// ---------------------------------------------------------------------------
// detectMockingIsolation (2507 — QA-08, detected)
// ---------------------------------------------------------------------------

test('QA-08: no test files is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectMockingIsolation(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-08: jest.mock in test file is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.test.ts'),
    'jest.mock("./db");\ntest("fetches", () => {});\n'
  );
  const r = detectMockingIsolation(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(r.evidence.some((e) => e.includes('app.test.ts')));
});

test('QA-08: unittest.mock import in Python test is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'tests'));
  writeFileSync(
    join(t, 'tests', 'test_service.py'),
    'from unittest import mock\ndef test_service(): pass\n'
  );
  const r = detectMockingIsolation(t);
  assert.equal(r.status, 'PASS');
});

test('QA-08: test file without mock signals is FAIL', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.test.ts'),
    'test("trivial", () => { expect(1).toBe(1); });\n'
  );
  const r = detectMockingIsolation(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectContractTests (2508 — QA-09, detected)
// ---------------------------------------------------------------------------

test('QA-09: no contract signals is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print(1)\n');
  const r = detectContractTests(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('QA-09: pacts/ directory present is PASS', () => {
  const t = tmp();
  mkdirSync(join(t, 'pacts'));
  writeFileSync(join(t, 'pacts', 'consumer-provider.json'), '{}');
  const r = detectContractTests(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
  assert.ok(r.evidence.some((e) => e.includes('pact')));
});

test('QA-09: Pact import in test file is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'consumer.test.ts'),
    'import { Pact } from "@pact-foundation/pact";\ntest("contract", () => {});\n'
  );
  const r = detectContractTests(t);
  assert.equal(r.status, 'PASS');
});

// ---------------------------------------------------------------------------
// detectMlIterationTests (2509 — QA-10, detected)
// ---------------------------------------------------------------------------

test('QA-10: no ML framework detected returns SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.ts'), 'console.log("hello")\n');
  const r = detectMlIterationTests(t);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.method, 'detected');
});

test('QA-10: ML project with no quality tests is FAIL', () => {
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

test('QA-10: ML project with evidently-like assertions is PASS', () => {
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
  assert.ok(r.evidence.some((e) => e.includes('test_model.py')));
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
