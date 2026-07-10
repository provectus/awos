// frameworks.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMEWORK_AUTH_PATTERNS } from './frameworks.ts';

const hasAuth = (src: string) =>
  FRAMEWORK_AUTH_PATTERNS.some((rx) => rx.test(src));

test('framework auth patterns recognize DI/guard/decorator idioms', () => {
  assert.ok(
    hasAuth('async def update(user = Depends(get_current_user)):'),
    'FastAPI Depends auth'
  );
  assert.ok(hasAuth('@UseGuards(AuthGuard)'), 'NestJS guard');
  assert.ok(
    hasAuth('@PreAuthorize("hasRole(\'ADMIN\')")'),
    'Spring PreAuthorize'
  );
  assert.ok(hasAuth('[Authorize]'), 'ASP.NET attribute');
  assert.ok(hasAuth('@login_required'), 'Flask/Django decorator');
  assert.ok(
    hasAuth('user = Security(get_current_user, scopes=["me"])'),
    'FastAPI Security with auth dependency'
  );
});

test('framework auth patterns do not match unrelated code', () => {
  assert.equal(hasAuth('def add(a, b):\n    return a + b'), false);
  assert.equal(
    FRAMEWORK_AUTH_PATTERNS.some((rx) => rx.test('Security(app_config)')),
    false,
    'bare Security(app_config) must not match — not an auth dependency'
  );
});

test('AS-06 narrow: @require_premium and @require_feature_flag do not match', () => {
  assert.equal(
    hasAuth('@require_premium'),
    false,
    '@require_premium must not match — not an auth decorator'
  );
  assert.equal(
    hasAuth('@require_feature_flag'),
    false,
    '@require_feature_flag must not match — not an auth decorator'
  );
});

test('AS-06 narrow: authenticate in comment/prose does not match', () => {
  assert.equal(
    hasAuth('# authenticate the user later'),
    false,
    'bare "authenticate" in a comment must not match — call form required'
  );
  assert.equal(
    hasAuth('// We will authenticate via OAuth'),
    false,
    'authenticate in a comment must not match'
  );
});

test('AS-06 narrow: authenticate() call and @require_role DO match', () => {
  assert.ok(
    hasAuth('authenticate(user, password)'),
    'authenticate() call must match'
  );
  assert.ok(
    hasAuth('@require_role'),
    '@require_role must match — it is auth-specific'
  );
  assert.ok(
    hasAuth('@require_permission'),
    '@require_permission must match — it is auth-specific'
  );
  assert.ok(
    hasAuth('@require_scope'),
    '@require_scope must match — it is auth-specific'
  );
});
