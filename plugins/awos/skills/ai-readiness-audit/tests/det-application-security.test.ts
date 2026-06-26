/**
 * det-application-security.test.ts
 *
 * Hermetic detector tests for the application-security dimension (AS-01 through
 * AS-09). Each test pins a specific verdict by writing minimal fixture files into
 * a temp directory and asserting the expected status. The judgment categories
 * AS-10 (authorization correctness) and AS-11 (insecure design) have no detectors
 * and are therefore not tested here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectTlsEnforced,
  detectSecurityHeaders,
  detectCorsNotWildcard,
  detectParameterizedSql,
  detectNoHardcodedSecrets,
  detectAuthOnMutations,
  detectPasswordSessionHygiene,
  detectInputValidation,
  detectRateLimiting,
  DETECTORS,
} from '../detectors/application_security.ts';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'as-'));
}

// ---------------------------------------------------------------------------
// detectTlsEnforced (3000 — AS-01)
// ---------------------------------------------------------------------------

test('AS-01: no plain-HTTP URLs in config is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'config.yaml'),
    'database_url: "https://db.example.com"\napi_base: "https://api.example.com"\n'
  );
  const r = detectTlsEnforced(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('AS-01: plain-HTTP URL in config is WARN (1 hit)', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'settings.toml'),
    '[service]\nbase_url = "http://api.mycompany.com"\n'
  );
  const r = detectTlsEnforced(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    `expected WARN or FAIL, got ${r.status}`
  );
});

test('AS-01: localhost plain-HTTP is PASS (exempted)', () => {
  const t = tmp();
  writeFileSync(
    join(t, '.env'),
    'API_URL=http://localhost:8000\nDB_URL=http://127.0.0.1:5432\n'
  );
  const r = detectTlsEnforced(t);
  assert.equal(r.status, 'PASS');
});

// ---------------------------------------------------------------------------
// detectSecurityHeaders (3001 — AS-02)
// ---------------------------------------------------------------------------

test('AS-02: X-Content-Type-Options and X-Frame-Options present is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'middleware.py'),
    `
response['X-Content-Type-Options'] = 'nosniff'
response['X-Frame-Options'] = 'DENY'
`
  );
  const r = detectSecurityHeaders(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('AS-02: only one security header is WARN', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.js'),
    "res.setHeader('X-Frame-Options', 'DENY');\n"
  );
  const r = detectSecurityHeaders(t);
  assert.equal(r.status, 'WARN');
});

test('AS-02: no security headers is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print("hello")\n');
  const r = detectSecurityHeaders(t);
  assert.equal(r.status, 'FAIL');
});

test('AS-02: all three headers present is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'nginx.conf'),
    `
add_header X-Content-Type-Options nosniff;
add_header X-Frame-Options DENY;
add_header Strict-Transport-Security "max-age=31536000";
`
  );
  const r = detectSecurityHeaders(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.value, 3);
});

// ---------------------------------------------------------------------------
// detectCorsNotWildcard (3002 — AS-03)
// ---------------------------------------------------------------------------

test('AS-03: CORS wildcard origin fails', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'CORS(app, origins="*")\n');
  const r = detectCorsNotWildcard(t);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.method, 'detected');
});

test('AS-03: CORS scoped origins passes', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.py'),
    'CORS(app, origins=["https://x.com", "https://y.com"])\n'
  );
  const r = detectCorsNotWildcard(t);
  assert.equal(r.status, 'PASS');
});

test('AS-03: no CORS config is SKIP (N/A)', () => {
  // Absence of CORS configuration is not "safe" — it's not applicable.
  // Browsers default to same-origin when no CORS header is set, so there
  // is nothing to grade. This was previously returning PASS (the bug).
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print("hello world")\n');
  const r = detectCorsNotWildcard(t);
  assert.equal(r.status, 'SKIP');
});

test('AS-03: allowed_origins wildcard is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'settings.py'), 'CORS_ALLOWED_ORIGINS = ["*"]\n');
  const r = detectCorsNotWildcard(t);
  assert.equal(r.status, 'FAIL');
});

// ---------------------------------------------------------------------------
// detectParameterizedSql (3003 — AS-04)
// ---------------------------------------------------------------------------

test('AS-04: string-built SQL with + operator is WARN or FAIL', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'db.py'),
    'cur.execute("SELECT * FROM u WHERE id=" + uid)\n'
  );
  const r = detectParameterizedSql(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    `expected WARN or FAIL for string-built SQL, got ${r.status}`
  );
  assert.equal(r.method, 'detected');
});

test('AS-04: f-string SQL is WARN or FAIL', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'repo.py'),
    'cur.execute(f"SELECT * FROM users WHERE id={user_id}")\n'
  );
  const r = detectParameterizedSql(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    `expected WARN or FAIL for f-string SQL, got ${r.status}`
  );
});

test('AS-04: multiple string-built SQL patterns is FAIL', () => {
  const t = tmp();
  // Three hits → FAIL (threshold is ≥3)
  writeFileSync(
    join(t, 'db.py'),
    [
      'cur.execute("SELECT * FROM u WHERE id=" + uid)',
      'cur.execute("DELETE FROM sessions WHERE token=" + tok)',
      'cur.execute("UPDATE users SET name=" + name + " WHERE id=" + uid)',
    ].join('\n') + '\n'
  );
  const r = detectParameterizedSql(t);
  assert.equal(r.status, 'FAIL');
});

test('AS-04: parameterized query is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'db.py'),
    'cur.execute("SELECT * FROM u WHERE id = ?", (uid,))\n'
  );
  const r = detectParameterizedSql(t);
  assert.equal(r.status, 'PASS');
});

test('AS-04: empty repo is PASS (no SQL patterns)', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print("no db here")\n');
  const r = detectParameterizedSql(t);
  assert.equal(r.status, 'PASS');
});

// ---------------------------------------------------------------------------
// detectNoHardcodedSecrets (3004 — AS-05)
// ---------------------------------------------------------------------------

test('AS-05: hardcoded API key fails', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'config.py'),
    'API_KEY = "sk-abcdef1234567890abcdef1234567890"\n'
  );
  const r = detectNoHardcodedSecrets(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    `expected WARN or FAIL, got ${r.status}`
  );
  assert.equal(r.method, 'detected');
});

test('AS-05: placeholder value is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'config.py'),
    'API_KEY = os.environ.get("API_KEY", "changeme")\n'
  );
  const r = detectNoHardcodedSecrets(t);
  assert.equal(r.status, 'PASS');
});

test('AS-05: AWS access key in source fails', () => {
  const t = tmp();
  // Use a key pattern that does not contain placeholder-filter words
  writeFileSync(join(t, 'aws.py'), 'AWS_KEY = "AKIAIOSFODNN7REALKEY9"\n');
  const r = detectNoHardcodedSecrets(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    `expected WARN or FAIL for AWS key, got ${r.status}`
  );
});

// ---------------------------------------------------------------------------
// detectAuthOnMutations (3005 — AS-06)
// ---------------------------------------------------------------------------

test('AS-06: mutation route with auth decorator is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'views.py'),
    `
@login_required
@app.post('/api/items')
def create_item():
    pass
`
  );
  const r = detectAuthOnMutations(t);
  assert.ok(
    r.status === 'PASS' || r.status === 'SKIP',
    `expected PASS or SKIP, got ${r.status}`
  );
  assert.equal(r.method, 'detected');
});

test('AS-06: mutation route without auth is FAIL or WARN', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'routes.py'),
    `
@app.post('/api/items')
def create_item():
    pass

@app.delete('/api/items/<id>')
def delete_item(id):
    pass
`
  );
  const r = detectAuthOnMutations(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    `expected WARN or FAIL, got ${r.status}`
  );
});

test('AS-06: no mutation routes is SKIP', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.py'),
    '@app.get("/health")\ndef health():\n    return "ok"\n'
  );
  const r = detectAuthOnMutations(t);
  assert.equal(r.status, 'SKIP');
});

// ---------------------------------------------------------------------------
// detectPasswordSessionHygiene (3006 — AS-07)
// ---------------------------------------------------------------------------

test('AS-07: bcrypt usage is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'auth.py'),
    'import bcrypt\nhashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())\n'
  );
  const r = detectPasswordSessionHygiene(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('AS-07: md5 for password is FAIL', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'auth.py'),
    'import hashlib\nhashed_password = hashlib.md5(password.encode()).hexdigest()\n'
  );
  const r = detectPasswordSessionHygiene(t);
  assert.equal(r.status, 'FAIL');
});

test('AS-07: argon2 usage is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'users.ts'),
    'import { hash } from "argon2";\nconst hashed = await hash(password);\n'
  );
  const r = detectPasswordSessionHygiene(t);
  assert.equal(r.status, 'PASS');
});

test('AS-07: no hash patterns is SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'main.py'), 'print("hello")\n');
  const r = detectPasswordSessionHygiene(t);
  assert.equal(r.status, 'SKIP');
});

// ---------------------------------------------------------------------------
// detectInputValidation (3007 — AS-08)
// ---------------------------------------------------------------------------

test('AS-08: pydantic model is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'schemas.py'),
    'from pydantic import BaseModel\nclass ItemCreate(BaseModel):\n    name: str\n    price: float\n'
  );
  const r = detectInputValidation(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('AS-08: zod schema is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'schema.ts'),
    'import { z } from "zod";\nconst schema = z.object({ name: z.string() });\n'
  );
  const r = detectInputValidation(t);
  assert.equal(r.status, 'PASS');
});

test('AS-08: no validation patterns is SKIP', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print("hello")\n');
  const r = detectInputValidation(t);
  assert.equal(r.status, 'SKIP');
});

// ---------------------------------------------------------------------------
// detectRateLimiting (3008 — AS-09)
// ---------------------------------------------------------------------------

test('AS-09: flask-limiter reference is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.py'),
    'from flask_limiter import Limiter\nlimiter = Limiter(app, key_func=get_remote_address)\n'
  );
  const r = detectRateLimiting(t);
  assert.equal(r.status, 'PASS');
  assert.equal(r.method, 'detected');
});

test('AS-09: express-rate-limit reference is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'app.js'),
    'const rateLimit = require("express-rate-limit");\napp.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));\n'
  );
  const r = detectRateLimiting(t);
  assert.equal(r.status, 'PASS');
});

test('AS-09: no rate limiting is FAIL', () => {
  const t = tmp();
  writeFileSync(join(t, 'app.py'), 'print("no rate limiting here")\n');
  const r = detectRateLimiting(t);
  assert.equal(r.status, 'FAIL');
});

test('AS-09: NestJS @Throttle decorator is PASS', () => {
  const t = tmp();
  writeFileSync(
    join(t, 'controller.ts'),
    '@Throttle(10, 60)\n@Controller("auth")\nexport class AuthController {}\n'
  );
  const r = detectRateLimiting(t);
  assert.equal(r.status, 'PASS');
});

// ---------------------------------------------------------------------------
// C6 — broadened SQL_GLOBS: .cs, .sql template files
// ---------------------------------------------------------------------------

test('AS-04: string-built SQL in a *.cs file is WARN or FAIL', () => {
  // C# file — now in scope via ALL_SOURCE_GLOBS
  const t = tmp();
  writeFileSync(
    join(t, 'Repo.cs'),
    'var sql = "SELECT * FROM Users WHERE Id=" + userId;\nconn.Execute(sql);\n'
  );
  const r = detectParameterizedSql(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    `expected WARN or FAIL for string-built SQL in .cs, got ${r.status}`
  );
});

test('AS-04: string-built SQL in a *.sql.j2 Jinja template file is WARN or FAIL', () => {
  // Jinja SQL template with string interpolation — not a parameterized query
  const t = tmp();
  // Use a clear pattern: execute("SELECT...WHERE id=" + var)
  writeFileSync(
    join(t, 'users.sql.j2'),
    'cur.execute("SELECT * FROM users WHERE id=" + user_id)\n'
  );
  const r = detectParameterizedSql(t);
  assert.ok(
    r.status === 'WARN' || r.status === 'FAIL',
    `expected WARN or FAIL for string-built SQL in .sql.j2, got ${r.status}`
  );
});

// ---------------------------------------------------------------------------
// DETECTORS map — structural sanity
// ---------------------------------------------------------------------------

test('DETECTORS map covers all detected codes 3000-3008', () => {
  for (const code of [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008]) {
    assert.ok(
      code in DETECTORS,
      `DETECTORS must include code ${code} (AS-0${code - 2999})`
    );
  }
});

test('DETECTORS map does not include judgment codes 3009/3010', () => {
  assert.ok(
    !(3009 in DETECTORS),
    'code 3009 (authorization correctness) is judgment — must not have a detector'
  );
  assert.ok(
    !(3010 in DETECTORS),
    'code 3010 (insecure design) is judgment — must not have a detector'
  );
});
