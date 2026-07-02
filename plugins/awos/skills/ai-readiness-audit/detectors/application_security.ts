import { makeResult, iterFiles, grep } from './_base.ts';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { ALL_SOURCE_GLOBS } from '../languages.ts';
import { FRAMEWORK_AUTH_PATTERNS } from '../frameworks.ts';

// ---------------------------------------------------------------------------
// detectTlsEnforced — category 3000 (AS-01, method: detected)
//
// PASS if no plain-HTTP service URLs (http://<non-localhost> origins,
// ALLOWED_HOSTS entries, BASE_URL values) are found in config/env files.
// FAIL if plain HTTP is detected for non-localhost origins.
// SKIP if no HTTP-API indicators are found.
// ---------------------------------------------------------------------------

const TLS_CONFIG_GLOBS = [
  '*.env',
  '*.env.*',
  '*.yaml',
  '*.yml',
  '*.toml',
  '*.ini',
  '*.cfg',
  '*.conf',
  '*.json',
];

// Must actually be http (not https)
const PLAIN_HTTP_STRICT_RX =
  /http:\/\/((?!localhost|127\.|0\.0\.0\.0|::1)[a-zA-Z0-9\-._]+)/gi;

// Schema/namespace identifier hosts. URLs like
// `"$schema": "http://json-schema.org/draft-07/schema#"` or an XML
// `xmlns="http://www.w3.org/..."` are opaque identifiers, never fetched over
// the network — they say nothing about TLS enforcement.
const SCHEMA_HOST_ALLOWLIST_RX =
  /^(?:(?:[\w-]+\.)*json-schema\.org|www\.w3\.org|(?:[\w-]+\.)*openapis\.org|xmlns[\w.-]*|schemas\.[\w.-]+)\.?$/i;

const TLS_CONFIG_IGNORE = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.venv',
  '__pycache__',
  '.next',
  'target',
  'fixtures',
  'testdata',
  '__tests__',
  'test',
  'tests',
  'docs',
  'vendor',
];

export function detectTlsEnforced(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const plainHttpHits: Array<{ file: string; line: number; text: string }> = [];

  const files = iterFiles(repoPath, TLS_CONFIG_GLOBS, TLS_CONFIG_IGNORE);

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments
      if (/^\s*(#|\/\/|\/\*|<!--)/.test(line)) continue;
      // Skip example/template values
      if (/example|template|placeholder|localhost|127\.|your[_-]/i.test(line))
        continue;
      PLAIN_HTTP_STRICT_RX.lastIndex = 0;
      for (
        let m = PLAIN_HTTP_STRICT_RX.exec(line);
        m !== null;
        m = PLAIN_HTTP_STRICT_RX.exec(line)
      ) {
        if (SCHEMA_HOST_ALLOWLIST_RX.test(m[1])) continue;
        plainHttpHits.push({
          file: relative(repoPath, filePath),
          line: i + 1,
          text: line.trim().slice(0, 100),
        });
        break;
      }
    }

    if (plainHttpHits.length >= 10) break;
  }

  if (plainHttpHits.length === 0) {
    return makeResult('PASS', 1, [
      'no plain-HTTP (http://) service URLs found in config files — TLS appears enforced',
    ]);
  }

  const evidence = plainHttpHits.map(
    (h) => `${h.file}:${h.line} plain-HTTP URL: ${h.text}`
  );

  if (plainHttpHits.length <= 2) {
    return makeResult('WARN', plainHttpHits.length, [
      `${plainHttpHits.length} plain-HTTP URL(s) found — review whether they are production service URLs`,
      ...evidence,
    ]);
  }

  return makeResult('FAIL', plainHttpHits.length, [
    `${plainHttpHits.length} plain-HTTP service URL(s) found — enforce HTTPS for all non-local origins`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectSecurityHeaders — category 3001 (AS-02, method: detected)
//
// Checks that common HTTP security headers are configured in the codebase.
// Looks for X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security.
//
// PASS if at least 2 of the 3 expected headers are referenced.
// WARN if only 1 is referenced.
// FAIL if none are referenced.
// ---------------------------------------------------------------------------

const HEADER_GLOBS = [
  '*.py',
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.go',
  '*.java',
  '*.kt',
  '*.rb',
  '*.php',
  '*.conf',
  '*.yaml',
  '*.yml',
  '*.toml',
  '*.nginx',
  '*.htaccess',
  'Caddyfile',
];

const SECURITY_HEADERS: Array<{ name: string; rx: RegExp }> = [
  {
    name: 'X-Content-Type-Options',
    rx: /x[_-]?content[_-]?type[_-]?options/i,
  },
  { name: 'X-Frame-Options', rx: /x[_-]?frame[_-]?options/i },
  {
    name: 'Strict-Transport-Security',
    rx: /strict[_-]?transport[_-]?security|HSTS/i,
  },
];

export function detectSecurityHeaders(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const found: string[] = [];

  for (const { name, rx } of SECURITY_HEADERS) {
    const hits = grep(repoPath, rx, HEADER_GLOBS);
    if (hits.length > 0) {
      found.push(name);
    }
  }

  // score: fraction of expected security headers found
  const score =
    SECURITY_HEADERS.length > 0 ? found.length / SECURITY_HEADERS.length : 0;

  if (found.length >= 2) {
    return makeResult(
      'PASS',
      found.length,
      [
        `${found.length} of ${SECURITY_HEADERS.length} security headers configured: ${found.join(', ')}`,
        ...found.map((h) => `header configured: ${h}`),
      ],
      'detected',
      score,
      1.0
    );
  }

  if (found.length === 1) {
    const missing = SECURITY_HEADERS.filter((h) => !found.includes(h.name)).map(
      (h) => h.name
    );
    return makeResult(
      'WARN',
      found.length,
      [
        `only ${found.length} security header found (${found[0]}) — add ${missing.join(', ')}`,
        ...missing.map((h) => `missing header: ${h}`),
      ],
      'detected',
      score,
      1.0
    );
  }

  return makeResult(
    'FAIL',
    0,
    [
      `no HTTP security headers (${SECURITY_HEADERS.map((h) => h.name).join(', ')}) found in source — configure them in your framework middleware or reverse proxy`,
    ],
    'detected',
    score,
    1.0
  );
}

// ---------------------------------------------------------------------------
// detectCorsNotWildcard — category 3002 (AS-03, method: detected)
//
// Three-state result:
//   FAIL  — wildcard origin ('*') found; anyone can call this API.
//   PASS  — CORS configured with specific origins (not '*').
//   SKIP  — no CORS construct found at all; browsers enforce same-origin by
//           default so the check is not applicable.
// ---------------------------------------------------------------------------

const CORS_GLOBS = [
  '*.py',
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.go',
  '*.java',
  '*.kt',
  '*.rb',
  '*.php',
  '*.conf',
  '*.yaml',
  '*.yml',
  '*.toml',
  '*.json',
];

// Patterns that indicate a wildcard CORS origin, e.g.:
//   origins="*", origins=['*'], allow_origins=["*"], cors_allowed_origins=["*"], cors_allowed_origins=*
const CORS_WILDCARD_RX =
  /(?:cors[_-]?(?:allowed[_-]?)?origins?|origins?|allow(?:ed)?[_-]?origins?|access.control.allow.origin)[^=\n]{0,30}=\s*\[?\s*['"]?\s*\*\s*['"]?\s*\]?/i;

// Pattern that is clearly scoped (not wildcard)
const CORS_SCOPED_RX =
  /(?:origins?|allow(?:ed)?_origins?|access.control.allow.origin|cors)[^=\n]{0,30}=\s*['"\[{]?\s*https?:\/\//i;

// Broader presence signal — any recognizable CORS keyword (middleware, decorator,
// header, or config key), used to distinguish "CORS not configured" from
// "CORS configured but origin format not recognized by the above patterns".
const CORS_PRESENCE_RX =
  /CORSMiddleware|@CrossOrigin|\bcors\s*\(|add_cors_headers|cors_headers|cors_allowed_origins|CORS_ALLOWED|cors_origin\b|Access-Control-Allow-Origin/i;

export function detectCorsNotWildcard(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const wildcardHits: Array<{ file: string; line: number; text: string }> = [];
  const scopedHits: Array<{ file: string; line: number; text: string }> = [];
  let corsFound = false;

  const files = iterFiles(repoPath, CORS_GLOBS);

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(#|\/\/|\/\*)/.test(line)) continue;
      if (CORS_WILDCARD_RX.test(line)) {
        corsFound = true;
        wildcardHits.push({
          file: relative(repoPath, filePath),
          line: i + 1,
          text: line.trim().slice(0, 120),
        });
      } else if (CORS_SCOPED_RX.test(line)) {
        corsFound = true;
        scopedHits.push({
          file: relative(repoPath, filePath),
          line: i + 1,
          text: line.trim().slice(0, 120),
        });
      } else if (CORS_PRESENCE_RX.test(line)) {
        corsFound = true;
      }
    }
  }

  if (wildcardHits.length > 0) {
    return makeResult('FAIL', wildcardHits.length, [
      `${wildcardHits.length} wildcard CORS origin ('*') found — restrict to specific allowed origins`,
      ...wildcardHits.slice(0, 5).map((h) => `${h.file}:${h.line} ${h.text}`),
    ]);
  }

  if (scopedHits.length > 0) {
    return makeResult('PASS', scopedHits.length, [
      `CORS is configured with scoped origins (not '*')`,
      ...scopedHits.slice(0, 3).map((h) => `${h.file}:${h.line} ${h.text}`),
    ]);
  }

  if (!corsFound) {
    return makeResult('SKIP', null, [
      'no CORS configuration found — browsers default to same-origin; check is not applicable',
    ]);
  }

  // CORS keyword detected but origin format not matched by wildcard or scoped patterns.
  return makeResult('PASS', 0, [
    'CORS configuration detected but origin constraints not recognized — review manually',
  ]);
}

// ---------------------------------------------------------------------------
// detectParameterizedSql — category 3003 (AS-04, method: detected)
//
// Detects string-concatenated SQL queries which indicate SQL injection risk.
// Looks for patterns like:
//   cursor.execute("SELECT ... " + var)
//   db.query("... WHERE id=" + id)
//   f"SELECT ... WHERE id={id}"  (Python f-string with SQL)
//
// PASS if no string-built SQL is found.
// FAIL if string concatenation/interpolation in SQL queries is detected.
// ---------------------------------------------------------------------------

const SQL_GLOBS = [
  ...ALL_SOURCE_GLOBS,
  '*.sql',
  '*.sql.j2',
  '*.sql.erb',
  '*.psql',
  '*.tmpl',
];

// Patterns indicating string-built SQL
const STRING_SQL_PATTERNS: RegExp[] = [
  // Python: cursor.execute("..." + var) or cursor.execute("..." % var)
  /(?:execute|query)\s*\(\s*["'].*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)[^"']*["']\s*\+/i,
  // Python: f-string SQL with variable interpolation
  /(?:execute|query)\s*\(\s*f["'].*(?:SELECT|INSERT|UPDATE|DELETE|WHERE).*\{[^}]+\}/i,
  // JavaScript/TypeScript: db.query("..." + var)
  /(?:db|pool|conn|client|connection)\.(?:query|execute|run)\s*\(\s*["'`].*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)[^"'`]*["'`]\s*\+/i,
  // Template literal SQL with interpolation
  /(?:db|pool|conn|client|connection)\.(?:query|execute|run)\s*\(\s*`.*(?:SELECT|INSERT|UPDATE|DELETE|WHERE).*\$\{[^}]+\}/i,
  // Generic: "SELECT * FROM ... WHERE id=" + variable
  /["']SELECT[^"']*WHERE[^"']*=["']\s*\+/i,
];

export function detectParameterizedSql(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const hits: Array<{ file: string; line: number; text: string }> = [];

  const files = iterFiles(repoPath, SQL_GLOBS);

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(#|\/\/|\/\*)/.test(line)) continue;
      // Skip test files
      if (
        /test|spec|mock|fixture|fake/i.test(
          relative(repoPath, filePath).toLowerCase()
        )
      )
        continue;

      for (const pat of STRING_SQL_PATTERNS) {
        if (pat.test(line)) {
          hits.push({
            file: relative(repoPath, filePath),
            line: i + 1,
            text: line.trim().slice(0, 120),
          });
          break;
        }
      }

      if (hits.length >= 15) break;
    }
    if (hits.length >= 15) break;
  }

  if (hits.length === 0) {
    return makeResult('PASS', 0, [
      'no string-concatenated SQL query patterns found — parameterized queries appear to be used',
    ]);
  }

  const evidence = hits
    .slice(0, 8)
    .map((h) => `${h.file}:${h.line} possible string-built SQL: ${h.text}`);

  if (hits.length <= 2) {
    return makeResult('WARN', hits.length, [
      `${hits.length} possible string-built SQL pattern(s) found — review for injection risk`,
      ...evidence,
    ]);
  }

  return makeResult('FAIL', hits.length, [
    `${hits.length} string-concatenated SQL query pattern(s) found — use parameterized queries or an ORM`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectNoHardcodedSecrets — category 3004 (AS-05, method: detected)
//
// Checks for hardcoded credentials in source files (application-security
// variant — looks at a broader set of patterns than the security dimension).
//
// PASS if no hardcoded secret patterns found.
// WARN if 1–2 suspicious patterns found.
// FAIL if 3+ patterns found.
// ---------------------------------------------------------------------------

const APPSEC_SOURCE_GLOBS = [
  '*.py',
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.go',
  '*.java',
  '*.kt',
  '*.rb',
  '*.php',
  '*.yaml',
  '*.yml',
  '*.toml',
  '*.ini',
  '*.cfg',
  '*.conf',
  '*.json',
];

const APPSEC_SECRET_PATTERNS: RegExp[] = [
  // AWS access keys
  /AKIA[0-9A-Z]{16}/,
  // Generic key/secret/token/password assignments with non-trivial values
  /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|credential|private[_-]?key|client[_-]?secret)\s*[:=]\s*["']([A-Za-z0-9/+\-_.@]{12,})["']/i,
  // JWT secrets
  /jwt[_-]?secret\s*[:=]\s*["'][^"']{8,}["']/i,
  // Database connection strings with embedded passwords
  /(?:postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]{6,}@/i,
];

const APPSEC_PLACEHOLDER_RX =
  /test|fake|example|dummy|xxx|your[_-]|placeholder|changeme|replace|<[^>]+>|\$\{[^}]+\}|env\(|process\.env|os\.environ|getenv|ENV\[|config\[/i;

const APPSEC_SECRET_IGNORE = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.venv',
  '__pycache__',
  '.next',
  'target',
  'vendor',
  'fixtures',
  'testdata',
  '__tests__',
  'test',
  'tests',
];

export function detectNoHardcodedSecrets(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const files = iterFiles(repoPath, APPSEC_SOURCE_GLOBS, APPSEC_SECRET_IGNORE);
  const hits: Array<{ file: string; line: number; pattern: string }> = [];

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(#|\/\/|\/\*)/.test(line)) continue;
      if (APPSEC_PLACEHOLDER_RX.test(line)) continue;

      for (const pat of APPSEC_SECRET_PATTERNS) {
        if (!pat.test(line)) continue;
        hits.push({
          file: relative(repoPath, filePath),
          line: i + 1,
          pattern: pat.source.slice(0, 40),
        });
        break;
      }
    }

    if (hits.length >= 20) break;
  }

  if (hits.length === 0) {
    return makeResult('PASS', 0, [
      'no hardcoded secret patterns found in source files',
    ]);
  }

  const evidence = hits
    .slice(0, 8)
    .map((h) => `${h.file}:${h.line} possible secret (pattern: ${h.pattern})`);

  if (hits.length <= 2) {
    return makeResult('WARN', hits.length, [
      `${hits.length} possible hardcoded secret(s) found — review manually`,
      ...evidence,
    ]);
  }

  return makeResult('FAIL', hits.length, [
    `${hits.length} possible hardcoded secret(s) found in committed files`,
    ...evidence,
  ]);
}

// ---------------------------------------------------------------------------
// detectAuthOnMutations — category 3005 (AS-06, method: detected)
//
// Detects state-changing HTTP endpoints (POST/PUT/PATCH/DELETE) and checks
// whether authentication decorators/middleware are present in those files.
//
// Heuristic approach: find route-definition files, check if they reference
// auth decorators/middleware alongside mutation-type routes.
//
// PASS if auth decorators/middleware are found alongside mutation routes.
// WARN if mutation routes exist but no auth markers are found.
// SKIP if no route definitions are found.
// ---------------------------------------------------------------------------

const ROUTE_GLOBS = [
  '*.py',
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.go',
  '*.rb',
  '*.java',
  '*.kt',
  '*.php',
];

// Route mutation patterns (framework-agnostic). Bare `.post(`/`.delete(`
// would match unrelated calls (`cache.delete(key)`, `axios.post(url)`), so
// method-call matches require a router-ish receiver before the method.
const MUTATION_ROUTE_RX =
  /(?:@(?:app|router|blueprint|api)\.(?:post|put|patch|delete)|Route\("(?:POST|PUT|PATCH|DELETE)"|\[HttpPost\]|\[HttpPut\]|\[HttpPatch\]|\[HttpDelete\]|\b(?:app|router|server|api|route[rs]?|fastify|express|blueprint)\w*\s*\.\s*(?:post|put|patch|delete)\s*\()/i;

// Auth decorator/middleware patterns
const AUTH_DECORATOR_RX =
  /(?:@(?:login_required|auth_required|requires_auth|authenticated|jwt_required|permission_required|IsAuthenticated|Authorize|AuthGuard|UseGuards|Protected|authenticate|require_login|authenticate_user)|authenticate\s*\(|auth\.required|isAuthenticated|requireAuth|authMiddleware|bearerAuth|apiKeyAuth|jwt\.verify|verifyToken|checkAuth)/i;

export function detectAuthOnMutations(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const filesWithMutations: string[] = [];
  const filesWithAuth: string[] = [];

  const files = iterFiles(repoPath, ROUTE_GLOBS);

  for (const filePath of files) {
    // Skip test files
    const rel = relative(repoPath, filePath);
    if (/test|spec|mock|fixture/i.test(rel.toLowerCase())) continue;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const hasMutation = MUTATION_ROUTE_RX.test(content);
    const fileHasAuth =
      AUTH_DECORATOR_RX.test(content) ||
      FRAMEWORK_AUTH_PATTERNS.some((rx) => rx.test(content));

    if (hasMutation) filesWithMutations.push(rel);
    if (hasMutation && fileHasAuth) filesWithAuth.push(rel);
  }

  if (filesWithMutations.length === 0) {
    return makeResult('SKIP', 0, [
      'no mutation route definitions (POST/PUT/PATCH/DELETE) found — auth-on-mutations check skipped',
    ]);
  }

  const coverage = filesWithAuth.length / filesWithMutations.length;
  // score: continuous auth-coverage ratio clamped to [0,1]
  const score = Math.min(1, Math.max(0, coverage));

  if (coverage >= 0.7) {
    return makeResult(
      'PASS',
      filesWithAuth.length,
      [
        `auth decorators/middleware found in ${filesWithAuth.length}/${filesWithMutations.length} files with mutation routes`,
        ...filesWithAuth.slice(0, 5).map((f) => `auth + mutations: ${f}`),
      ],
      'detected',
      score,
      1.0
    );
  }

  if (coverage >= 0.3) {
    return makeResult(
      'WARN',
      filesWithAuth.length,
      [
        `auth found in only ${filesWithAuth.length}/${filesWithMutations.length} mutation route files — some endpoints may be unprotected`,
        ...filesWithMutations
          .filter((f) => !filesWithAuth.includes(f))
          .slice(0, 5)
          .map((f) => `mutation routes without auth: ${f}`),
      ],
      'detected',
      score,
      1.0
    );
  }

  return makeResult(
    'FAIL',
    filesWithAuth.length,
    [
      `auth decorators/middleware absent from ${filesWithMutations.length - filesWithAuth.length}/${filesWithMutations.length} files with mutation routes`,
      ...filesWithMutations
        .filter((f) => !filesWithAuth.includes(f))
        .slice(0, 8)
        .map((f) => `no auth detected: ${f}`),
    ],
    'detected',
    score,
    1.0
  );
}

// ---------------------------------------------------------------------------
// detectPasswordSessionHygiene — category 3006 (AS-07, method: detected)
//
// PASS if strong password hashing (bcrypt/argon2/scrypt) is referenced.
// WARN if only weaker alternatives (pbkdf2, sha256) are found.
// FAIL if MD5/SHA1 is used for password hashing.
// SKIP if no password-hashing patterns are found at all.
// ---------------------------------------------------------------------------

const AUTH_GLOBS = [
  '*.py',
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.go',
  '*.java',
  '*.kt',
  '*.rb',
  '*.php',
];

const STRONG_HASH_RX = /\b(?:bcrypt|argon2|scrypt|passlib|ph\.hash)\b/i;
const WEAK_HASH_RX =
  /\b(?:pbkdf2|sha256|sha512)\b.{0,40}(?:password|passwd|hash)/i;
// Proximity group is password terms only — a generic `hash` nearby would
// flag innocent prose/code like "compute the md5 hash for the cache key".
const INSECURE_HASH_RX = /\b(?:md5|sha1)\b.{0,40}(?:password|passwd|pwd)/i;
const SESSION_CSPRNG_RX =
  /(?:secrets\.token|os\.urandom|crypto\.randomBytes|SecureRandom|rand\.Read|Random\.new)/i;

export function detectPasswordSessionHygiene(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  let strongHashFound = false;
  let weakHashFound = false;
  let insecureHashFound = false;
  let csprngFound = false;
  const evidence: string[] = [];

  const files = iterFiles(repoPath, AUTH_GLOBS);

  for (const filePath of files) {
    const rel = relative(repoPath, filePath);
    if (/test|spec|mock|fixture/i.test(rel.toLowerCase())) continue;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    if (STRONG_HASH_RX.test(content)) {
      strongHashFound = true;
      evidence.push(`strong hash algorithm: ${rel}`);
    }
    if (WEAK_HASH_RX.test(content)) {
      weakHashFound = true;
      evidence.push(`weaker hash algorithm: ${rel}`);
    }
    if (INSECURE_HASH_RX.test(content)) {
      insecureHashFound = true;
      evidence.push(`insecure hash for password: ${rel}`);
    }
    if (SESSION_CSPRNG_RX.test(content)) {
      csprngFound = true;
      evidence.push(`CSPRNG session token: ${rel}`);
    }
  }

  const hasAnySignal =
    strongHashFound || weakHashFound || insecureHashFound || csprngFound;

  if (!hasAnySignal) {
    return makeResult('SKIP', 0, [
      'no password-hashing or session-token patterns found — hygiene check skipped (may not apply to this project)',
    ]);
  }

  if (insecureHashFound) {
    return makeResult('FAIL', 0, [
      'MD5 or SHA1 used for password hashing — use bcrypt, argon2, or scrypt',
      ...evidence.filter((e) => e.startsWith('insecure')),
    ]);
  }

  if (strongHashFound) {
    return makeResult('PASS', 1, [
      'strong password hashing algorithm (bcrypt/argon2/scrypt) found',
      ...evidence.slice(0, 5),
    ]);
  }

  return makeResult('WARN', 0, [
    'only weaker hashing algorithms found — prefer bcrypt, argon2, or scrypt over pbkdf2/sha256 for passwords',
    ...evidence.slice(0, 5),
  ]);
}

// ---------------------------------------------------------------------------
// detectInputValidation — category 3007 (AS-08, method: detected)
//
// PASS if known input-validation libraries or decorators are referenced.
// WARN if only manual isinstance/type-check validation is found.
// FAIL if no input validation signals are found in HTTP-handler files.
// SKIP if no HTTP handler files are found.
// ---------------------------------------------------------------------------

const HANDLER_GLOBS = [
  '*.py',
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.go',
  '*.java',
  '*.kt',
  '*.rb',
  '*.php',
];

// Decorator alternatives live outside the \b(...)\b group: `\b` before `@`
// can never match (both sides are non-word characters).
const VALIDATION_LIBRARY_RX =
  /\b(?:pydantic|marshmallow|cerberus|voluptuous|wtforms|validator\.js|joi|yup|zod|class-validator|validate\.js|express-validator|javax\.validation|jakarta\.validation|ActiveRecord::Base\.validates|validates\s*:|govalidator|ozzo-validation)\b|@(?:IsString|IsInt|IsEmail|Min|Max|Length|NotNull|Valid|Validated)\b/i;

const MANUAL_VALIDATION_RX =
  /(?:isinstance\s*\(|typeof\s+\w+\s*===|request\.args\.get|request\.form\.get|req\.body\.|params\[|sanitize|escape\s*\()/i;

export function detectInputValidation(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  let libraryFound = false;
  let manualFound = false;
  const evidence: string[] = [];

  const files = iterFiles(repoPath, HANDLER_GLOBS);

  for (const filePath of files) {
    const rel = relative(repoPath, filePath);
    if (/test|spec|mock|fixture/i.test(rel.toLowerCase())) continue;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    if (VALIDATION_LIBRARY_RX.test(content)) {
      libraryFound = true;
      evidence.push(`validation library: ${rel}`);
    } else if (MANUAL_VALIDATION_RX.test(content)) {
      manualFound = true;
    }
  }

  if (!libraryFound && !manualFound) {
    return makeResult('SKIP', 0, [
      'no input-validation patterns found — check skipped (may be handled at infrastructure level)',
    ]);
  }

  if (libraryFound) {
    return makeResult('PASS', 1, [
      'input validation library or decorator found',
      ...evidence.slice(0, 5),
    ]);
  }

  return makeResult('WARN', 0, [
    'only manual input validation signals found — consider using a validation library (Pydantic, Zod, class-validator, etc.)',
  ]);
}

// ---------------------------------------------------------------------------
// detectRateLimiting — category 3008 (AS-09, method: detected)
//
// PASS if rate-limiting library or config is referenced.
// FAIL if no rate-limiting signals are found.
// ---------------------------------------------------------------------------

// Decorator alternatives live outside the \b(...)\b group: `\b` before `@`
// can never match (both sides are non-word characters).
const RATE_LIMIT_RX =
  /\b(?:rate[_-]?limit|throttle|slowDown|express-rate-limit|django[_-]?ratelimit|flask[_-]?limiter|Limiter|ratelimiter|redis[_-]?throttle|Throttling|UserRateThrottle|AnonRateThrottle)\b|@(?:Throttle|RateLimit)\b/i;

const RATE_CONFIG_GLOBS = [
  '*.py',
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.go',
  '*.yaml',
  '*.yml',
  '*.toml',
  '*.conf',
];

export function detectRateLimiting(
  repoPath: string,
  _params?: unknown
): ReturnType<typeof makeResult> {
  const hits = grep(repoPath, RATE_LIMIT_RX, RATE_CONFIG_GLOBS);

  if (hits.length > 0) {
    return makeResult('PASS', hits.length, [
      `rate-limiting configuration found in ${hits.length} location(s)`,
      ...hits.slice(0, 5).map((h) => `${h.file}:${h.line} ${h.text}`),
    ]);
  }

  return makeResult('FAIL', 0, [
    'no rate-limiting library or configuration found — add rate limiting to authentication and public endpoints',
  ]);
}

// ---------------------------------------------------------------------------
// DETECTORS — maps each application-security code to its function.
// Codes 3009 (authorization-correctness) and 3010 (insecure-design) are
// judgment categories — they have no detector (audit-core emits them as
// PENDING_JUDGMENT; the orchestrator's Step 6 judgment patch evaluates them
// via rubric + evidence_required).
// ---------------------------------------------------------------------------

export const DETECTORS: Record<
  number,
  (repoPath: string, params?: unknown) => ReturnType<typeof makeResult>
> = {
  3000: detectTlsEnforced, // AS-01 TLS enforced
  3001: detectSecurityHeaders, // AS-02 security headers present
  3002: detectCorsNotWildcard, // AS-03 CORS not wildcard
  3003: detectParameterizedSql, // AS-04 parameterized SQL
  3004: detectNoHardcodedSecrets, // AS-05 no hardcoded secrets
  3005: detectAuthOnMutations, // AS-06 auth on state-changing endpoints
  3006: detectPasswordSessionHygiene, // AS-07 password/session hygiene
  3007: detectInputValidation, // AS-08 input validation present
  3008: detectRateLimiting, // AS-09 rate limiting
  // 3009: judgment — authorization correctness (no detector)
  // 3010: judgment — insecure design review (no detector)
};
