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
