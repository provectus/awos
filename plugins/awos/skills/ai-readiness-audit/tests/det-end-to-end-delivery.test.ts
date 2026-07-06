import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectVerticalDelivery,
  detectBidirectionalLinks,
  detectLayerCoverage,
  detectCrossLayerTooling,
  DETECTORS,
} from '../detectors/end_to_end_delivery.ts';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'e2e-'));
}

// ---------------------------------------------------------------------------
// detectVerticalDelivery — category 2300 (SBP-08, method: computed)
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

test('detectVerticalDelivery: single-layer repo (no multi-layer dirs) → SKIP', () => {
  const t = tmp();
  // Single-layer repo: only Python source files, no multi-layer directories
  mkdirSync(join(t, 'src'), { recursive: true });
  writeFileSync(join(t, 'src', 'app.py'), 'print("hello")\n');
  writeFileSync(join(t, 'src', 'utils.py'), 'def helper(): pass\n');
  // Without a real git repo the branch list is empty, so it SKIPs at the
  // "no feature branches" gate — but we also want to verify it would SKIP
  // due to the layer gate for repos that DO have branches. The no-git path
  // conveniently returns SKIP for the right reason.
  const r = detectVerticalDelivery(t);
  assert.equal(r.status, 'SKIP', 'expected SKIP for single-layer repo');
});

test('detectVerticalDelivery: real git repo with feature branch but single source layer → SKIP via layer-count gate', () => {
  // This test exercises the layerCount < 2 gate specifically — distinct from
  // the no-branches gate. We need a real git repo so the branch list is
  // non-empty, but the repo has only one architectural layer (no api/frontend/db dirs).
  const t = tmp();
  mkdirSync(join(t, 'src'), { recursive: true });
  writeFileSync(join(t, 'src', 'main.py'), 'print("hello")\n');

  // Init a real git repo with a feature branch
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: t, encoding: 'utf8', stdio: 'pipe' });
  try {
    git(['init']);
    git(['config', 'user.email', 'test@test.com']);
    git(['config', 'user.name', 'Test']);
    git(['add', '.']);
    git(['commit', '-m', 'initial']);
    git(['checkout', '-b', 'feat/single-layer-feature']);
    writeFileSync(join(t, 'src', 'utils.py'), 'def helper(): pass\n');
    git(['add', '.']);
    git(['commit', '-m', 'add utils']);
    git(['checkout', 'master']);
  } catch {
    // If git is unavailable, skip this test gracefully
    return;
  }

  const r = detectVerticalDelivery(t);
  assert.equal(
    r.status,
    'SKIP',
    'expected SKIP via layer-count gate when repo has feature branches but only one source layer'
  );
  assert.ok(
    r.evidence.some((e) => e.includes('layer') || e.includes('architectural')),
    `evidence should mention layers; got: ${r.evidence.join('; ')}`
  );
});

test('detectVerticalDelivery: detached HEAD pseudo-entry is not a feature branch → SKIP', () => {
  const t = tmp();
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: t, encoding: 'utf8', stdio: 'pipe' });
  try {
    git(['init', '-b', 'main']);
    git(['config', 'user.email', 'test@test.com']);
    git(['config', 'user.name', 'Test']);
    writeFileSync(join(t, 'a.txt'), 'a\n');
    git(['add', '.']);
    git(['commit', '-m', 'initial']);
    // Detach HEAD: `git branch` now emits "(HEAD detached at <sha>)" which
    // must be filtered, not treated as a feature branch.
    git(['checkout', '--detach', 'HEAD']);
  } catch {
    return; // git unavailable — skip gracefully
  }
  const r = detectVerticalDelivery(t);
  assert.equal(
    r.status,
    'SKIP',
    `detached-HEAD pseudo entry must not count as a feature branch (SKIP); got ${r.status}`
  );
  assert.ok(
    r.evidence.some((e) => e.includes('no feature branches')),
    `SKIP must come from the no-feature-branches gate; got ${JSON.stringify(r.evidence)}`
  );
});

// ---------------------------------------------------------------------------
// E2E-02 (category 2301) was REMOVED — name-based layer-split detection is
// gone. These tests confirm the absence.
// ---------------------------------------------------------------------------

test('E2E-02 detector is removed — DETECTORS has no key 2301', () => {
  assert.equal(
    DETECTORS[2301],
    undefined,
    'category 2301 (E2E-02) must not be in DETECTORS'
  );
});

// ---------------------------------------------------------------------------
// detectBidirectionalLinks — category 2302 (DOC-07, method: detected)
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
// detectLayerCoverage — category 2303 (SBP-09, method: detected)
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
// detectCrossLayerTooling — category 2304 (ARCH-07, method: detected)
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

test('DETECTORS map contains codes 2300, 2302, 2303, 2304 — no 2301', () => {
  assert.ok(
    2300 in DETECTORS,
    'DETECTORS must include 2300 (detectVerticalDelivery)'
  );
  // 2301 (E2E-02) was removed — name-based layer-split detection dropped
  assert.equal(
    DETECTORS[2301],
    undefined,
    'DETECTORS must NOT include 2301 (E2E-02 removed)'
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
