import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectArchPattern,
  detectImportGraph,
  detectSeparationOfConcerns,
  detectNamingConventions,
  detectFileSizes,
  DETECTORS,
} from '../detectors/code_architecture.ts';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'arch-'));
}

// ---------------------------------------------------------------------------
// detectArchPattern — code 2100 (ARCH-01, detected)
//
// PASS if architecture doc present OR recognizable layered dir layout.
// WARN if only a layered layout without explicit doc.
// FAIL if neither found.
// ---------------------------------------------------------------------------

test('ARCH-01: PASS when ARCHITECTURE.md is present', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'ARCHITECTURE.md'),
    '# Architecture\n\nThis project uses layered architecture.\n'
  );
  const r = detectArchPattern(t);
  assert.equal(r.status, 'PASS', 'ARCHITECTURE.md should yield PASS');
  assert.equal(r.method, 'detected');
});

test('ARCH-01: PASS when docs/architecture.md is present', () => {
  const t = tmp();
  mkdirSync(join(t, 'docs'));
  writeFileSync(join(t, 'docs', 'architecture.md'), '# System Architecture\n');
  const r = detectArchPattern(t);
  assert.equal(r.status, 'PASS', 'docs/architecture.md should yield PASS');
});

test('ARCH-01: PASS when docs/architecture.adoc is present', () => {
  const t = tmp();
  mkdirSync(join(t, 'docs'), { recursive: true });
  writeFileSync(join(t, 'docs', 'architecture.adoc'), '= Arch');
  const r = detectArchPattern(t);
  assert.equal(r.status, 'PASS', 'docs/architecture.adoc should yield PASS');
});

test('ARCH-01: WARN when recognizable layered dirs present but no explicit arch doc', () => {
  const t = tmp();
  // Recognizable layered layout: at least 3 of {src, lib, api, routes, controllers, services, models, domain, infra, infrastructure, application}
  mkdirSync(join(t, 'src'));
  mkdirSync(join(t, 'src', 'routes'));
  mkdirSync(join(t, 'src', 'controllers'));
  mkdirSync(join(t, 'src', 'services'));
  writeFileSync(join(t, 'src', 'routes', 'user.ts'), 'export {};\n');
  const r = detectArchPattern(t);
  assert.equal(
    r.status,
    'WARN',
    'layered layout without doc should yield WARN'
  );
});

test('ARCH-01: FAIL when no architecture signals found', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print("hello")\n');
  const r = detectArchPattern(t);
  assert.equal(r.status, 'FAIL', 'no architecture signals should yield FAIL');
});

// ---------------------------------------------------------------------------
// detectImportGraph — code 2101 (ARCH-02, detected)
//
// Grep-based import scanner. Detects layer violations (lower-level modules
// importing from higher-level modules).
// FAIL on >= 2 import layer violations.
// WARN on exactly 1 violation.
// PASS when no violations found.
// ---------------------------------------------------------------------------

test('ARCH-02: SKIP when no source files exist — absence is not compliance', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# hi\n');
  const r = detectImportGraph(t);
  assert.equal(r.status, 'SKIP', 'no source files → SKIP (nothing to measure)');
});

test('ARCH-02: SKIP when no files live under recognised layer directories', () => {
  const t = tmp();
  mkdirSync(join(t, 'lib'));
  writeFileSync(join(t, 'lib', 'util.ts'), "import { x } from './other';\n");
  const r = detectImportGraph(t);
  assert.equal(
    r.status,
    'SKIP',
    'no layered dirs → SKIP (import layering not applicable)'
  );
});

test('ARCH-02: PASS when all imports go in one direction', () => {
  const t = tmp();
  mkdirSync(join(t, 'routes'));
  mkdirSync(join(t, 'services'));
  mkdirSync(join(t, 'models'));
  // routes → services → models (unidirectional, valid)
  writeFileSync(
    join(t, 'routes', 'user.ts'),
    "import { UserService } from '../services/user';\n"
  );
  writeFileSync(
    join(t, 'services', 'user.ts'),
    "import { User } from '../models/user';\n"
  );
  writeFileSync(
    join(t, 'models', 'user.ts'),
    'export interface User { id: string; }\n'
  );
  const r = detectImportGraph(t);
  assert.equal(r.status, 'PASS', 'unidirectional imports should yield PASS');
});

test('ARCH-02: FAIL when 2+ files in models/ import from routes/ (repeated layer violations)', () => {
  const t = tmp();
  mkdirSync(join(t, 'routes'));
  mkdirSync(join(t, 'models'));
  writeFileSync(
    join(t, 'routes', 'user.ts'),
    "import { User } from '../models/user';\n"
  );
  // Two layer violations: models importing from routes in two files
  writeFileSync(
    join(t, 'models', 'user.ts'),
    "import { router } from '../routes/user';\nexport interface User {}\n"
  );
  writeFileSync(
    join(t, 'models', 'post.ts'),
    "import { router } from '../routes/user';\nexport interface Post {}\n"
  );
  const r = detectImportGraph(t);
  assert.equal(
    r.status,
    'FAIL',
    '2 layer violations (models importing routes) should yield FAIL'
  );
  assert.ok(
    r.evidence.some((e) => e.includes('models')),
    'evidence should mention models'
  );
});

test('ARCH-02: WARN (not FAIL) when controllers/ imports from routes/ exactly once', () => {
  const t = tmp();
  mkdirSync(join(t, 'routes'));
  mkdirSync(join(t, 'controllers'));
  writeFileSync(
    join(t, 'routes', 'index.ts'),
    "import { ctrl } from '../controllers/user';\n"
  );
  // controllers should not import routes — but a single violation is WARN
  writeFileSync(
    join(t, 'controllers', 'user.ts'),
    "import { router } from '../routes/index';\nexport function ctrl() {}\n"
  );
  const r = detectImportGraph(t);
  assert.equal(
    r.status,
    'WARN',
    'exactly 1 layer violation should yield WARN, not FAIL'
  );
});

test('ARCH-02: WARN (not FAIL) when services/ imports from routes/ exactly once', () => {
  const t = tmp();
  mkdirSync(join(t, 'routes'));
  mkdirSync(join(t, 'services'));
  writeFileSync(
    join(t, 'routes', 'api.ts'),
    "import { svc } from '../services/api';\n"
  );
  // services should not import routes — but a single violation is WARN
  writeFileSync(
    join(t, 'services', 'api.ts'),
    "import { router } from '../routes/api';\nexport function svc() {}\n"
  );
  const r = detectImportGraph(t);
  assert.equal(
    r.status,
    'WARN',
    'exactly 1 layer violation should yield WARN, not FAIL'
  );
});

test('ARCH-02: PASS with clean architecture src/ with no violations', () => {
  const t = tmp();
  mkdirSync(join(t, 'src'));
  mkdirSync(join(t, 'src', 'api'));
  mkdirSync(join(t, 'src', 'domain'));
  writeFileSync(
    join(t, 'src', 'api', 'handler.ts'),
    "import { process } from '../domain/processor';\n"
  );
  writeFileSync(
    join(t, 'src', 'domain', 'processor.ts'),
    'export function process() {}\n'
  );
  const r = detectImportGraph(t);
  assert.equal(r.status, 'PASS', 'clean api→domain should yield PASS');
});

test('ARCH-02: multi-level relative path (../../routes/x) is detected as a layer violation', () => {
  // Regression: the old code stripped only ONE leading ../ so '../../routes/index'
  // became '../routes/index' → first segment '..' → no tier match → violation missed.
  // The fix strips ALL leading ../ segments before splitting.
  const t = tmp();
  mkdirSync(join(t, 'src'));
  mkdirSync(join(t, 'src', 'models'));
  mkdirSync(join(t, 'src', 'routes'));
  writeFileSync(
    join(t, 'src', 'routes', 'index.ts'),
    'export const router = {};\n'
  );
  // models/ importing from routes/ via a two-level relative path
  writeFileSync(
    join(t, 'src', 'models', 'user.ts'),
    "import { router } from '../../routes/index';\nexport interface User { id: string; }\n"
  );
  const r = detectImportGraph(t);
  assert.equal(
    r.status,
    'WARN',
    'models importing routes via ../../routes/x must be detected as a layer violation (single violation → WARN)'
  );
  assert.ok(
    r.evidence.some((e) => e.includes('models')),
    'evidence should mention the models layer'
  );
});

// ---------------------------------------------------------------------------
// detectSeparationOfConcerns — code 2103 (ARCH-04, detected)
//
// Count data-access calls inline in route/presentation files.
// FAIL if any route/controller/handler file has >= 3 data-access calls.
// WARN if any has 1-2 data-access calls.
// PASS if none.
// ---------------------------------------------------------------------------

test('ARCH-04: PASS when route files have no data-access calls', () => {
  const t = tmp();
  mkdirSync(join(t, 'routes'));
  mkdirSync(join(t, 'services'));
  writeFileSync(
    join(t, 'routes', 'user.ts'),
    [
      "import { UserService } from '../services/user';",
      'export function getUser(req, res) {',
      '  // Calls a service method — no direct DB/ORM access in the route',
      '  const user = UserService.getUser(req.params.id);',
      '  res.json(user);',
      '}',
    ].join('\n') + '\n'
  );
  const r = detectSeparationOfConcerns(t);
  assert.equal(
    r.status,
    'PASS',
    'route delegating to service should yield PASS'
  );
  assert.equal(r.method, 'detected');
});

test('ARCH-04: FAIL when route file has >= 3 inline DB calls', () => {
  const t = tmp();
  mkdirSync(join(t, 'routes'));
  writeFileSync(
    join(t, 'routes', 'user.ts'),
    [
      "import db from '../db';",
      'export async function getUser(req, res) {',
      '  const user = await db.query("SELECT * FROM users WHERE id = $1", [req.params.id]);',
      '  const posts = await db.query("SELECT * FROM posts WHERE user_id = $1", [user.id]);',
      '  const comments = await db.query("SELECT * FROM comments WHERE user_id = $1", [user.id]);',
      '  res.json({ user, posts, comments });',
      '}',
    ].join('\n') + '\n'
  );
  const r = detectSeparationOfConcerns(t);
  assert.equal(
    r.status,
    'FAIL',
    '3 db.query calls in routes/ should yield FAIL'
  );
  assert.ok(
    r.evidence.some((e) => e.includes('routes/user.ts')),
    'evidence should name the offending file'
  );
});

test('ARCH-04: WARN when route file has 1-2 inline DB calls', () => {
  const t = tmp();
  mkdirSync(join(t, 'routes'));
  writeFileSync(
    join(t, 'routes', 'product.ts'),
    [
      "import db from '../db';",
      'export async function getProduct(req, res) {',
      '  const product = await db.query("SELECT * FROM products WHERE id = $1", [req.params.id]);',
      '  res.json(product);',
      '}',
    ].join('\n') + '\n'
  );
  const r = detectSeparationOfConcerns(t);
  assert.equal(r.status, 'WARN', '1-2 db calls in routes/ should yield WARN');
});

test('ARCH-04: PASS when no route/controller files exist', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print("hello")\n');
  const r = detectSeparationOfConcerns(t);
  assert.equal(r.status, 'PASS', 'no route files → PASS');
});

test('ARCH-04: FAIL when controller has 3 ORM calls (Python style)', () => {
  const t = tmp();
  mkdirSync(join(t, 'controllers'));
  writeFileSync(
    join(t, 'controllers', 'user.py'),
    [
      'from app import db',
      'def get_user(user_id):',
      '    user = db.session.query(User).filter_by(id=user_id).first()',
      '    posts = db.session.query(Post).filter_by(user_id=user_id).all()',
      '    comments = db.session.query(Comment).filter_by(user_id=user_id).all()',
      '    return {"user": user, "posts": posts, "comments": comments}',
    ].join('\n') + '\n'
  );
  const r = detectSeparationOfConcerns(t);
  assert.equal(
    r.status,
    'FAIL',
    '3 db.session.query calls in controllers/ should yield FAIL'
  );
});

test('ARCH-04: PASS when route file only uses Array.prototype.find() — not a DB call', () => {
  // Regression: ORM_STATIC_RX formerly matched bare `.find(` which is also
  // Array.prototype.find(), a completely idiomatic JS idiom that has nothing
  // to do with data access. The fix requires findOne/findAll/findBy… or a
  // Django `.objects.` prefix, so Array.find() is never counted.
  //
  // This fixture is deliberately crafted to match NONE of the data-access
  // patterns: no db/conn/cursor/session/repo prefix, no .objects., no
  // findOne/findAll/findBy…, no raw SQL. It must stay PASS.
  const t = tmp();
  mkdirSync(join(t, 'routes'));
  writeFileSync(
    join(t, 'routes', 'items.ts'),
    [
      "import { items } from '../data/items';",
      'export function getItem(req, res) {',
      '  // Use Array.prototype.find — this is NOT a DB/ORM call',
      '  const item = items.find(x => x.id === req.params.id);',
      '  res.json(item ?? null);',
      '}',
    ].join('\n') + '\n'
  );
  const r = detectSeparationOfConcerns(t);
  assert.equal(
    r.status,
    'PASS',
    'Array.prototype.find() must not be counted as a data-access call (should yield PASS)'
  );
});

test('ARCH-04: WARN/FAIL when route file has real ORM calls (Model.findAll / db.query)', () => {
  // Confirm that genuine ORM calls (Model.findAll, db.query) are still detected
  // now that bare Array.find() is excluded.
  const t = tmp();
  mkdirSync(join(t, 'routes'));
  writeFileSync(
    join(t, 'routes', 'orders.ts'),
    [
      "import { db } from '../db';",
      "import { Order } from '../models/order';",
      'export async function listOrders(req, res) {',
      '  const orders = await Order.findAll({ where: { userId: req.user.id } });',
      '  const count = await db.query("SELECT COUNT(*) FROM orders");',
      '  res.json({ orders, count });',
      '}',
    ].join('\n') + '\n'
  );
  const r = detectSeparationOfConcerns(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    `real ORM/DB calls in routes/ should yield WARN or FAIL, got ${r.status}`
  );
});

test('ARCH-04: PASS when UI strings contain SQL-verb English ("Delete item") — not raw SQL', () => {
  const t = tmp();
  mkdirSync(join(t, 'views'));
  // "Delete item", "Update profile", "Create account" are button labels, not
  // SQL — the raw-SQL heuristic requires a SQL continuation (FROM/INTO/SET…).
  writeFileSync(
    join(t, 'views', 'buttons.tsx'),
    [
      'export function Actions() {',
      '  return (',
      '    <>',
      '      <Button>Delete item</Button>',
      '      <Button>Update profile</Button>',
      '      <Button>Create account</Button>',
      '    </>',
      '  );',
      '}',
    ].join('\n') + '\n'
  );
  const r = detectSeparationOfConcerns(t);
  assert.equal(
    r.status,
    'PASS',
    `English "Delete item" button labels must not count as inline SQL; got ${r.status}`
  );
});

test('ARCH-04: real raw SQL (SELECT id FROM users) in a route file is still detected', () => {
  const t = tmp();
  mkdirSync(join(t, 'routes'));
  writeFileSync(
    join(t, 'routes', 'raw.ts'),
    'export const q = "SELECT id FROM users WHERE active = 1";\n'
  );
  const r = detectSeparationOfConcerns(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    `SELECT id FROM users must still register as raw SQL (WARN/FAIL); got ${r.status}`
  );
});

// ---------------------------------------------------------------------------
// detectNamingConventions — code 2104 (ARCH-05, detected)
//
// Check file-naming convention adherence.
// PASS if >= 90% files follow a consistent pattern (all snake_case, all camelCase, all kebab-case, or all PascalCase).
// WARN if 70–89% follow the dominant pattern.
// FAIL if < 70%.
// ---------------------------------------------------------------------------

test('ARCH-05: PASS when all source files use snake_case', () => {
  const t = tmp();
  const names = [
    'user_service.ts',
    'data_repository.ts',
    'api_controller.ts',
    'auth_helper.ts',
  ];
  for (const n of names) writeFileSync(join(t, n), '// file\n');
  const r = detectNamingConventions(t);
  assert.equal(r.status, 'PASS', 'all snake_case should yield PASS');
  assert.equal(r.method, 'detected');
});

test('ARCH-05: PASS when all source files use kebab-case', () => {
  const t = tmp();
  const names = [
    'user-service.ts',
    'data-repository.ts',
    'api-controller.ts',
    'auth-helper.ts',
  ];
  for (const n of names) writeFileSync(join(t, n), '// file\n');
  const r = detectNamingConventions(t);
  assert.equal(r.status, 'PASS', 'all kebab-case should yield PASS');
});

test('ARCH-05: FAIL when files are mixed with < 70% consistent', () => {
  const t = tmp();
  // 3 snake_case, 2 kebab-case, 2 camelCase → dominant is snake_case with 3/7 ≈ 43% → FAIL
  const names = [
    'user_service.ts',
    'data_repository.ts',
    'api_controller.ts',
    'user-profile.ts',
    'data-access.ts',
    'userController.ts',
    'dataProcessor.ts',
  ];
  for (const n of names) writeFileSync(join(t, n), '// file\n');
  const r = detectNamingConventions(t);
  assert.equal(
    r.status,
    'FAIL',
    'mixed naming < 70% dominant should yield FAIL'
  );
});

test('ARCH-05: single-token lowercase names are compatible with every lowercase convention', () => {
  const t = tmp();
  // `utils` / `api` carry no separator evidence — they must count toward
  // kebab-case dominance instead of being pinned to snake_case and dragging
  // the ratio below the PASS threshold.
  for (const n of ['utils.ts', 'api.ts', 'user-profile.ts']) {
    writeFileSync(join(t, n), '// file\n');
  }
  const r = detectNamingConventions(t);
  assert.equal(
    r.status,
    'PASS',
    `utils.ts + api.ts + user-profile.ts must read as consistent kebab-case; got ${r.status}`
  );
  assert.ok(
    r.evidence.some((e) => e.includes('kebab-case (3/3')),
    `dominant convention must be kebab-case with all 3 files compatible; got ${JSON.stringify(r.evidence)}`
  );
});

test('ARCH-05: SKIP when no source files found — absence is not compliance', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# project\n');
  const r = detectNamingConventions(t);
  assert.equal(r.status, 'SKIP', 'no source files → SKIP (nothing to check)');
});

test('ARCH-05: FAIL when any file departs from the dominant convention (all-or-nothing)', () => {
  const t = tmp();
  // 7 snake_case, 3 others → any departure FAILs (the graded WARN band is retired)
  const snakeNames = [
    'a_module.ts',
    'b_module.ts',
    'c_module.ts',
    'd_module.ts',
    'e_module.ts',
    'f_module.ts',
    'g_module.ts',
  ];
  const otherNames = ['userController.ts', 'dataProcessor.ts', 'apiHelper.ts'];
  for (const n of snakeNames) writeFileSync(join(t, n), '// file\n');
  for (const n of otherNames) writeFileSync(join(t, n), '// file\n');
  const r = detectNamingConventions(t);
  assert.equal(
    r.status,
    'FAIL',
    '70% dominance must FAIL under the all-or-nothing standard'
  );
});

// ---------------------------------------------------------------------------
// detectFileSizes — code 2105 (ARCH-06, computed)
//
// % of source files over LOC threshold (300 lines).
// PASS if <= 10% over threshold.
// WARN if 11–30% over threshold.
// FAIL if > 30% over threshold.
// Value is the ratio (0–1) as a float.
// ---------------------------------------------------------------------------

test('ARCH-06: PASS when no source files exceed 300-line threshold', () => {
  const t = tmp();
  // 3 small files
  for (let i = 0; i < 3; i++) {
    writeFileSync(
      join(t, `module${i}.ts`),
      Array(50).fill('// line\n').join('')
    );
  }
  const r = detectFileSizes(t);
  assert.equal(r.status, 'PASS', 'no oversized files → PASS');
  assert.equal(r.method, 'computed');
  assert.equal(typeof r.value, 'number');
  assert.equal(r.value, 0, 'ratio should be exactly 0');
});

test('ARCH-06: FAIL when > 30% of source files exceed 300 lines', () => {
  const t = tmp();
  // 2 big files (301 lines each), 4 small files → 2/6 = 33.3% → FAIL
  for (let i = 0; i < 2; i++) {
    writeFileSync(join(t, `big${i}.ts`), Array(301).fill('// line\n').join(''));
  }
  for (let i = 0; i < 4; i++) {
    writeFileSync(
      join(t, `small${i}.ts`),
      Array(50).fill('// line\n').join('')
    );
  }
  const r = detectFileSizes(t);
  assert.equal(r.status, 'FAIL', '33% oversized → FAIL');
  // value = 2/6 ≈ 0.333...
  assert.ok(
    (r.value as number) > 0.3 && (r.value as number) < 0.4,
    `expected ratio ~0.33, got ${r.value}`
  );
  assert.ok(
    r.evidence.some((e) => e.includes('big0.ts') || e.includes('big1.ts')),
    'evidence should list oversized files'
  );
});

test('ARCH-06: WARN when 11–30% of source files exceed 300 lines', () => {
  const t = tmp();
  // 2 big files (301 lines), 8 small files → 2/10 = 20% → WARN
  for (let i = 0; i < 2; i++) {
    writeFileSync(join(t, `big${i}.ts`), Array(301).fill('// line\n').join(''));
  }
  for (let i = 0; i < 8; i++) {
    writeFileSync(
      join(t, `small${i}.ts`),
      Array(50).fill('// line\n').join('')
    );
  }
  const r = detectFileSizes(t);
  assert.equal(r.status, 'WARN', '20% oversized → WARN');
  // value = 2/10 = 0.2
  assert.equal(r.value, 0.2, 'ratio should be exactly 0.2');
});

test('ARCH-06: PASS when exactly 10% of source files exceed 300 lines', () => {
  const t = tmp();
  // 1 big file, 9 small files → 1/10 = 10% → PASS (boundary)
  writeFileSync(join(t, 'big.ts'), Array(301).fill('// line\n').join(''));
  for (let i = 0; i < 9; i++) {
    writeFileSync(
      join(t, `small${i}.ts`),
      Array(50).fill('// line\n').join('')
    );
  }
  const r = detectFileSizes(t);
  assert.equal(r.status, 'PASS', '10% boundary → PASS');
  assert.equal(r.value, 0.1, 'ratio should be exactly 0.1');
});

test('ARCH-06: PASS when no source files found', () => {
  const t = tmp();
  writeFileSync(join(t, 'README.md'), '# project\n');
  const r = detectFileSizes(t);
  assert.equal(r.status, 'PASS', 'no source files → PASS');
  assert.equal(r.value, 0);
});

// ---------------------------------------------------------------------------
// DETECTORS map
// ---------------------------------------------------------------------------

test('DETECTORS map contains all code-architecture computed/detected codes', () => {
  assert.ok(
    2100 in DETECTORS,
    'DETECTORS must include 2100 (detectArchPattern)'
  );
  assert.ok(
    2101 in DETECTORS,
    'DETECTORS must include 2101 (detectImportGraph)'
  );
  // 2102 is judgment — no detector
  assert.ok(
    2103 in DETECTORS,
    'DETECTORS must include 2103 (detectSeparationOfConcerns)'
  );
  assert.ok(
    2104 in DETECTORS,
    'DETECTORS must include 2104 (detectNamingConventions)'
  );
  assert.ok(2105 in DETECTORS, 'DETECTORS must include 2105 (detectFileSizes)');
  assert.ok(
    !(2102 in DETECTORS),
    'DETECTORS must NOT include 2102 (judgment — no detector)'
  );
});

test('DETECTORS[2105] returns same result as detectFileSizes', () => {
  const t = tmp();
  writeFileSync(join(t, 'module.ts'), Array(50).fill('// line\n').join(''));
  const direct = detectFileSizes(t);
  const viaMap = DETECTORS[2105](t);
  assert.equal(viaMap.status, direct.status);
  assert.equal(viaMap.method, 'computed');
});
