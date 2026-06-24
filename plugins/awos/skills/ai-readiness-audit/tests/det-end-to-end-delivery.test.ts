import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectVerticalDelivery,
  detectNoLayerSplit,
  detectBidirectionalLinks,
  detectLayerCoverage,
  detectCrossLayerTooling,
  DETECTORS,
} from '../detectors/end_to_end_delivery.ts';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'e2e-'));
}

// ---------------------------------------------------------------------------
// detectVerticalDelivery — category 2300 (E2E-01, method: computed)
// applies_when: topology.is_monorepo
// Detects whether the repo has multiple top-level src layers (frontend+backend)
// and git feature branches. In the absence of git we check directory signals.
// ---------------------------------------------------------------------------

test('detectVerticalDelivery: no feature branches → SKIP', () => {
  const t = tmp();
  // Not a git repo — can't compute ratio
  const r = detectVerticalDelivery(t);
  assert.equal(
    r.status,
    'SKIP',
    'expected SKIP when no git feature branches present'
  );
  assert.equal(r.method, 'computed');
});

// ---------------------------------------------------------------------------
// detectNoLayerSplit — category 2301 (E2E-02, method: detected)
// applies_when: topology.is_monorepo
// Detects paired *-backend/*-frontend branch name patterns in git branches.
// Without git branches to inspect, falls back to SKIP.
// ---------------------------------------------------------------------------

test('detectNoLayerSplit: no git repo → SKIP', () => {
  const t = tmp();
  const r = detectNoLayerSplit(t);
  assert.equal(
    r.status,
    'SKIP',
    'expected SKIP when no git branches available'
  );
  assert.equal(r.method, 'detected');
});

// ---------------------------------------------------------------------------
// detectBidirectionalLinks — category 2302 (E2E-03, method: detected)
// always applies
// Checks that spec files reference implementation paths and implementation
// files reference spec directories.
// ---------------------------------------------------------------------------

test('detectBidirectionalLinks: spec references impl AND impl references spec → PASS', () => {
  const t = tmp();
  // Create a spec file that references implementation path
  mkdirSync(join(t, 'context', 'spec', '001-auth'), { recursive: true });
  writeFileSync(
    join(t, 'context', 'spec', '001-auth', 'functional-spec.md'),
    '# Auth spec\n\nImplemented in `src/auth/login.ts`\n'
  );
  // Create implementation file referencing spec
  mkdirSync(join(t, 'src', 'auth'), { recursive: true });
  writeFileSync(
    join(t, 'src', 'auth', 'login.ts'),
    '// Spec: context/spec/001-auth\nexport function login() {}\n'
  );
  const r = detectBidirectionalLinks(t);
  assert.equal(
    r.status,
    'PASS',
    'expected PASS when bidirectional spec↔impl links exist'
  );
  assert.equal(r.method, 'detected');
});

test('detectBidirectionalLinks: no spec dir → FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.ts'), 'export const x = 1;\n');
  const r = detectBidirectionalLinks(t);
  assert.equal(r.status, 'FAIL', 'expected FAIL when no spec directory exists');
});

test('detectBidirectionalLinks: spec exists but no impl cross-refs → WARN', () => {
  const t = tmp();
  // Only spec side — no implementation cross-references
  mkdirSync(join(t, 'context', 'spec', '001-feature'), { recursive: true });
  writeFileSync(
    join(t, 'context', 'spec', '001-feature', 'functional-spec.md'),
    '# Feature spec\n\nThis is a standalone spec with no impl references.\n'
  );
  mkdirSync(join(t, 'src'), { recursive: true });
  writeFileSync(join(t, 'src', 'feature.ts'), 'export const x = 1;\n');
  const r = detectBidirectionalLinks(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    'expected WARN or FAIL when only one direction of links exists'
  );
});

// ---------------------------------------------------------------------------
// detectLayerCoverage — category 2303 (E2E-04, method: detected)
// applies_when: topology.has_multiple_layers
// Checks that API defs have UI consumers and DB schemas have API layers.
// ---------------------------------------------------------------------------

test('detectLayerCoverage: API + UI + DB all present → PASS', () => {
  const t = tmp();
  // API layer
  mkdirSync(join(t, 'api'), { recursive: true });
  writeFileSync(join(t, 'api', 'routes.ts'), 'export const routes = [];\n');
  // UI layer
  mkdirSync(join(t, 'frontend', 'src'), { recursive: true });
  writeFileSync(
    join(t, 'frontend', 'src', 'App.tsx'),
    'export default function App() {}\n'
  );
  // DB schema
  writeFileSync(join(t, 'schema.sql'), 'CREATE TABLE users (id INT);\n');
  const r = detectLayerCoverage(t);
  assert.equal(
    r.status,
    'PASS',
    'expected PASS when API + UI + DB layers all present'
  );
  assert.equal(r.method, 'detected');
});

test('detectLayerCoverage: single-layer project → SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print("hello")\n');
  const r = detectLayerCoverage(t);
  assert.equal(r.status, 'SKIP', 'expected SKIP for single-layer projects');
});

test('detectLayerCoverage: API only, no UI layer → WARN', () => {
  const t = tmp();
  mkdirSync(join(t, 'api'), { recursive: true });
  writeFileSync(join(t, 'api', 'routes.ts'), 'export const routes = [];\n');
  writeFileSync(join(t, 'schema.sql'), 'CREATE TABLE users (id INT);\n');
  const r = detectLayerCoverage(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    'expected WARN or FAIL when API present but no UI consumers'
  );
});

// ---------------------------------------------------------------------------
// detectCrossLayerTooling — category 2304 (E2E-05, method: detected)
// applies_when: topology.is_monorepo
// Checks for cross-layer tooling: Makefile, docker-compose, shared CI.
// ---------------------------------------------------------------------------

test('detectCrossLayerTooling: Makefile present → PASS', () => {
  const t = tmp();
  writeFileSync(join(t, 'Makefile'), 'build:\n\techo "build all"\n');
  const r = detectCrossLayerTooling(t);
  assert.equal(r.status, 'PASS', 'expected PASS when Makefile present');
  assert.ok(r.evidence.some((e) => e.toLowerCase().includes('makefile')));
  assert.equal(r.method, 'detected');
});

test('detectCrossLayerTooling: docker-compose.yml present → PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'docker-compose.yml'),
    'services:\n  db:\n    image: postgres\n'
  );
  const r = detectCrossLayerTooling(t);
  assert.equal(r.status, 'PASS');
});

test('detectCrossLayerTooling: docker-compose.yaml (alternate ext) → PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'docker-compose.yaml'),
    'services:\n  app:\n    image: node\n'
  );
  const r = detectCrossLayerTooling(t);
  assert.equal(r.status, 'PASS');
});

test('detectCrossLayerTooling: .github/workflows CI file → PASS', () => {
  const t = tmp();
  mkdirSync(join(t, '.github', 'workflows'), { recursive: true });
  writeFileSync(
    join(t, '.github', 'workflows', 'ci.yml'),
    'on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n'
  );
  const r = detectCrossLayerTooling(t);
  assert.equal(
    r.status,
    'PASS',
    'expected PASS when .github/workflows CI file present'
  );
});

test('detectCrossLayerTooling: no cross-layer tooling → FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# project\n');
  const r = detectCrossLayerTooling(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// DETECTORS map
// ---------------------------------------------------------------------------

test('DETECTORS map contains codes 2300, 2301, 2302, 2303, 2304', () => {
  assert.ok(
    2300 in DETECTORS,
    'DETECTORS must include 2300 (detectVerticalDelivery)'
  );
  assert.ok(
    2301 in DETECTORS,
    'DETECTORS must include 2301 (detectNoLayerSplit)'
  );
  assert.ok(
    2302 in DETECTORS,
    'DETECTORS must include 2302 (detectBidirectionalLinks)'
  );
  assert.ok(
    2303 in DETECTORS,
    'DETECTORS must include 2303 (detectLayerCoverage)'
  );
  assert.ok(
    2304 in DETECTORS,
    'DETECTORS must include 2304 (detectCrossLayerTooling)'
  );
});

test('DETECTORS[2304] returns same result as detectCrossLayerTooling', () => {
  const t = tmp();
  writeFileSync(join(t, 'Makefile'), 'all:\n\techo hi\n');
  const direct = detectCrossLayerTooling(t);
  const viaMap = DETECTORS[2304](t);
  assert.equal(viaMap.status, direct.status);
  assert.equal(viaMap.method, 'detected');
});
