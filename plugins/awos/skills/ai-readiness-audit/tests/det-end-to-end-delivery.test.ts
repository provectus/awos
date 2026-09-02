import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  detectVerticalDelivery,
  detectBidirectionalLinks,
  detectLayerCoverage,
  detectCrossLayerTooling,
  DETECTORS,
} from '../detectors/end_to_end_delivery.ts';
import { tmpDir, writeRepo } from './helpers.ts';

function tmp(): string {
  return tmpDir('e2e-');
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

// Issue: introducing orchestration-root inheritance for DOC-07 initially
// switched the spec→impl evidence path base unconditionally, so an own-repo
// audit (no orchestration root involved at all) silently lost its
// context/spec/ prefix. A repo that is not a member of an orchestration root
// must be completely unaffected by this feature — this pins that invariant.
test('detectBidirectionalLinks: own-repo evidence path is unaffected by orchestration-root support', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'spec', '001-demo'), { recursive: true });
  writeFileSync(
    join(t, 'context', 'spec', '001-demo', 'functional-spec.md'),
    '# Demo spec\n\nImplemented in `src/demo.ts`\n'
  );
  mkdirSync(join(t, 'src'), { recursive: true });
  writeFileSync(
    join(t, 'src', 'demo.ts'),
    '// Spec: context/spec/001-demo\nexport const demo = 1;\n'
  );
  const r = detectBidirectionalLinks(t);
  assert.ok(
    r.evidence.some((e) =>
      e.includes('context/spec/001-demo/functional-spec.md')
    ),
    `an own-repo audit (no orchestration root in play) must render the same evidence path as before orchestration-root support existed — the context/spec/ prefix must not silently disappear; got ${JSON.stringify(r.evidence)}`
  );
});

test('detectBidirectionalLinks: inherited spec evidence renders a readable path, not a ../.. trail', () => {
  const root = tmpDir('e2e-doc07-readable-');
  const member = join(root, 'services', 'api');
  mkdirSync(member, { recursive: true });
  mkdirSync(join(root, 'context', 'spec', '001-demo'), { recursive: true });
  writeFileSync(
    join(root, 'context', 'spec', '001-demo', 'functional-spec.md'),
    '# Demo spec\n\nImplemented in `src/demo.ts`.\n\nLine four.\nLine five.\nLine six.\nLine seven.\n'
  );
  mkdirSync(join(member, 'src'), { recursive: true });
  writeFileSync(
    join(member, 'src', 'demo.ts'),
    '// Spec: context/spec/001-demo\nexport const demo = 1;\n'
  );
  try {
    const r = detectBidirectionalLinks(member, {
      inheritance: { orchestrationRoot: root, inherits: true },
    });
    assert.ok(
      r.evidence.some((e) =>
        e.includes('context/spec/001-demo/functional-spec.md')
      ),
      `inherited spec evidence must reconstruct the logical context/spec/… location, not the raw resolved path; got ${JSON.stringify(r.evidence)}`
    );
    assert.ok(
      r.evidence.every((e) => !e.includes('../')),
      `inherited spec evidence must not render as an unreadable ../.. trail; got ${JSON.stringify(r.evidence)}`
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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

test('detectBidirectionalLinks: impl→spec regex recognizes OpenSpec and GSD paths (registry-derived)', () => {
  // SPEC_REF_RX is now built from the SPEC_FRAMEWORKS registry
  // (spec_frameworks.ts) instead of a hand-maintained duplicate — this pins
  // that the two frameworks added by that rework (OpenSpec, GSD) are
  // actually recognized by the impl→spec half, not just present in the
  // registry.
  const t = tmp();
  mkdirSync(join(t, 'context', 'spec', '001-x'), { recursive: true });
  writeFileSync(
    join(t, 'context', 'spec', '001-x', 'functional-spec.md'),
    '# X\n\nImplemented in `src/x.ts`\n'
  );
  mkdirSync(join(t, 'src'), { recursive: true });
  writeFileSync(
    join(t, 'src', 'x.ts'),
    '// See openspec/changes/add-thing/proposal.md\nexport const x = 1;\n'
  );
  const r = detectBidirectionalLinks(t);
  assert.equal(
    r.status,
    'PASS',
    'a source file referencing an openspec/changes/ path must count as an impl→spec reference'
  );
});

test('detectBidirectionalLinks: impl→spec regex recognizes a GSD .planning/phases/ path', () => {
  const t = tmp();
  mkdirSync(join(t, 'context', 'spec', '001-x'), { recursive: true });
  writeFileSync(
    join(t, 'context', 'spec', '001-x', 'functional-spec.md'),
    '# X\n\nImplemented in `src/x.ts`\n'
  );
  mkdirSync(join(t, 'src'), { recursive: true });
  writeFileSync(
    join(t, 'src', 'x.ts'),
    '// Plan: .planning/phases/01-init/01-01-PLAN.md\nexport const x = 1;\n'
  );
  const r = detectBidirectionalLinks(t);
  assert.equal(
    r.status,
    'PASS',
    'a source file referencing a .planning/phases/ path must count as an impl→spec reference'
  );
});

// ---------------------------------------------------------------------------
// detectLayerCoverage — category 2303 (SBP-09, method: detected)
// applies_when: topology.has_multiple_layers
// Checks that API defs have UI consumers and DB schemas have API layers.
// ---------------------------------------------------------------------------

test('detectLayerCoverage: API + UI + DB all present → PASS', () => {
  const t = tmp();
  writeRepo(t, {
    // API layer
    'api/routes.ts': 'export const routes = [];\n',
    // UI layer
    'frontend/src/App.tsx': 'export default function App() {}\n',
    // DB schema
    'schema.sql': 'CREATE TABLE users (id INT);\n',
  });
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

// ---------------------------------------------------------------------------
// Verdict-threshold params (standards.toml pass_at/warn_at/fail_at)
// ---------------------------------------------------------------------------

test('detectVerticalDelivery: pass_at param is honored — 0.5 ratio is PASS by default but WARN with pass_at 0.6', () => {
  const t = tmp();
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: t, encoding: 'utf8', stdio: 'pipe' });
  try {
    // Two layers present on trunk: api/ (hasApi) + frontend/ (hasUi)
    mkdirSync(join(t, 'api'), { recursive: true });
    mkdirSync(join(t, 'frontend'), { recursive: true });
    writeFileSync(join(t, 'api', 'routes.ts'), 'export const routes = [];\n');
    writeFileSync(
      join(t, 'frontend', 'App.tsx'),
      'export default function App() {}\n'
    );
    git(['init', '-b', 'main']);
    git(['config', 'user.email', 'test@test.com']);
    git(['config', 'user.name', 'Test']);
    git(['add', '.']);
    git(['commit', '-m', 'initial']);
    // Vertical branch: touches api/ AND frontend/ (2 layers)
    git(['checkout', '-b', 'feat/vertical']);
    writeFileSync(join(t, 'api', 'items.ts'), 'export const items = [];\n');
    writeFileSync(
      join(t, 'frontend', 'Items.tsx'),
      'export function Items() {}\n'
    );
    git(['add', '.']);
    git(['commit', '-m', 'vertical slice']);
    git(['checkout', 'main']);
    // Flat branch: touches api/ only (1 layer)
    git(['checkout', '-b', 'feat/flat']);
    writeFileSync(join(t, 'api', 'flat.ts'), 'export const flat = 1;\n');
    git(['add', '.']);
    git(['commit', '-m', 'api-only change']);
    git(['checkout', 'main']);
  } catch {
    return; // git unavailable — skip gracefully
  }

  // 1 of 2 feature branches is vertical → ratio 0.5 → PASS at default pass_at 0.5
  assert.equal(
    detectVerticalDelivery(t).status,
    'PASS',
    '0.5 vertical ratio must be PASS under the default pass_at 0.5'
  );
  const r = detectVerticalDelivery(t, { pass_at: 0.6 });
  assert.equal(
    r.status,
    'WARN',
    'pass_at param must be honored: raising pass_at to 0.6 must flip to WARN'
  );
  assert.ok(
    r.evidence.some((e) => e.includes('below 60%')),
    `WARN evidence must cite the resolved pass_at (60%); got: ${r.evidence[0]}`
  );
});

// ---------------------------------------------------------------------------
// Orchestration-root inheritance — DOC-07
//
// The member always supplies the implementation half of the link (the code
// has to live where the code is); the root may supply the spec half, since
// in this layout the spec workspace lives at the root by design.
// ---------------------------------------------------------------------------

function writeImplRef(dir: string): void {
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(
    join(dir, 'src', 'handler.ts'),
    '// Implements context/spec/001-demo\nexport const handler = () => null;\n'
  );
}

function writeSpecWithImplRef(dir: string): void {
  const specDir = join(dir, 'context', 'spec', '001-demo');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(
    join(specDir, 'functional-spec.md'),
    '# Functional Spec\n\nImplemented in src/handler.ts.\n\nLine four.\nLine five.\nLine six.\nLine seven.\n'
  );
}

function inheritParams(root: string) {
  return { inheritance: { orchestrationRoot: root, inherits: true } };
}

/** Root carries the spec half; member always carries the implementation half. */
function docInheritFixture(prefix: string): { root: string; member: string } {
  const root = tmpDir(prefix);
  const member = join(root, 'services', 'api');
  mkdirSync(member, { recursive: true });
  writeSpecWithImplRef(root);
  writeImplRef(member);
  return { root, member };
}

test('DOC-07 inherits the spec half of the link from the orchestration root', () => {
  const { root, member } = docInheritFixture('e2e-doc07-inherit-');
  try {
    assert.equal(
      detectBidirectionalLinks(member).status,
      'FAIL',
      'DOC-07 must FAIL for a member with no context/spec/ and no root in scope — otherwise the inheritance test proves nothing'
    );
    const res = detectBidirectionalLinks(member, inheritParams(root));
    assert.equal(
      res.status,
      'PASS',
      'DOC-07 must be credited once the spec half is visible via the orchestration root and the impl half is visible in the member'
    );
    assert.ok(
      res.evidence.some((e) => /inherited from orchestration root/.test(e)),
      `DOC-07's evidence must say the spec-side credit was inherited; got ${JSON.stringify(res.evidence)}`
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('DOC-07 is unchanged for a member carrying both halves itself', () => {
  const root = tmpDir('e2e-doc07-own-root-');
  const member = tmpDir('e2e-doc07-own-member-');
  writeSpecWithImplRef(member);
  writeImplRef(member);
  try {
    const bare = detectBidirectionalLinks(member);
    const withRoot = detectBidirectionalLinks(member, inheritParams(root));
    assert.deepEqual(
      withRoot,
      bare,
      'DOC-07 must produce byte-identical results for a self-sufficient member whether or not a root is in scope — this is the no-regression guarantee for repos that already pass'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('DOC-07 does not inherit the spec half when the category policy is false', () => {
  const { root, member } = docInheritFixture('e2e-doc07-nopolicy-');
  try {
    const res = detectBidirectionalLinks(member, {
      inheritance: { orchestrationRoot: root, inherits: false },
    });
    assert.equal(
      res.status,
      'FAIL',
      'DOC-07 must respect its standards.toml policy — a root in scope is not by itself permission to inherit'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
