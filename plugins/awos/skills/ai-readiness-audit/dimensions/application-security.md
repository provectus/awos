---
name: application-security
title: Application Security (ASVS 5.0.0 L1)
description: Audits application-layer security against a curated OWASP ASVS 5.0.0 Level-1 subset — TLS, security headers, CORS, SQL injection, hardcoded secrets, auth on mutations, password hygiene, input validation, rate limiting, authorization — plus secret-file hygiene (.env gitignored, env templates, sensitive-file ignore coverage)
severity: critical
depends-on: [project-topology]
---

# Application Security (ASVS 5.0.0 L1)

Audits the project's application-layer security posture against a curated subset of the OWASP Application Security Verification Standard (ASVS) version 5.0.0 Level 1. ASVS 5.0.0 L1 represents the minimum baseline for any application handling user data or network traffic; checks in this dimension are deliberately scoped to what can be verified statically from source code and configuration files.

This dimension is distinct from the `security` dimension (which audits agent-safety guardrails — `.env` gitignoring, Claude Code hooks, and secret-scanning of committed files) and the `supply-chain-security` dimension (which audits dependency supply chain controls).

## Checks

### AS-01: TLS enforced — no plain-HTTP fallback

- **What:** No plain `http://` service URLs are configured for non-local origins in config, environment, or YAML files
- **How:** Grep config, env, YAML, TOML, and JSON files for `http://` URLs whose host is not `localhost`, `127.*`, or `0.0.0.0`. Exclude comment lines and obvious placeholders.
- **Pass:** No plain-HTTP service URLs found — all external origins use `https://`
- **Warn:** 1–2 plain-HTTP URLs found — may be legitimate development/proxy entries; review each one
- **Fail:** 3 or more plain-HTTP service URLs found in config files
- **Skip-When:** Topology reports no HTTP API present
- **Severity:** critical
- **Category:** 3000

### AS-02: HTTP security headers configured

- **What:** Common HTTP security headers — `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security` — are configured in source or reverse-proxy configuration
- **How:** Grep source files, config files, Nginx/Caddy/Apache configs, and YAML for the three header names (case-insensitive). If at least 2 of the 3 are referenced, the application surface appears protected.
- **Pass:** At least 2 of the 3 expected security headers are configured
- **Warn:** Exactly 1 header found — the others should be added
- **Fail:** None of the expected security headers are referenced anywhere in the codebase
- **Skip-When:** Topology reports no HTTP API present
- **Severity:** high
- **Category:** 3001

### AS-03: CORS not configured with wildcard origin

- **What:** CORS allowed-origins configuration does not use the wildcard `*` that permits any origin to call the API
- **How:** Grep source and config files for CORS origin assignment patterns. Flag lines where origins is set to `*`. Also look for properly scoped origin lists (`https://...`) as positive evidence.
- **Pass:** No wildcard CORS origin found; either no CORS config exists or origins are explicitly scoped
- **Fail:** An explicit `origins="*"` or equivalent is found in source or config
- **Skip-When:** Topology reports no HTTP API present
- **Severity:** high
- **Category:** 3002

### AS-04: Parameterized SQL — no string-built queries

- **What:** Database queries use parameterized statements or an ORM; no string-concatenated SQL is present in the codebase
- **How:** Grep source files for patterns where a SQL keyword (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `WHERE`) appears inside a string that is then concatenated with a variable (`+`, f-string `{}`, template literal `${}`). Skip test/fixture directories.
- **Pass:** No string-concatenated SQL patterns found — parameterized queries or ORM appear to be used
- **Warn:** 1–2 suspicious patterns found — review for injection risk
- **Fail:** 3 or more string-concatenated SQL patterns found
- **Skip-When:** Topology reports no database present
- **Severity:** critical
- **Category:** 3003

### AS-05: No hardcoded secrets in source

- **What:** No API keys, passwords, tokens, or credentials are committed as literal strings in source files
- **How:** Grep source, config, YAML, and JSON files for patterns matching credential assignments (api_key, secret_key, password, JWT secret, database connection strings with embedded passwords). Skip placeholders (`changeme`, `${...}`, `process.env`, `os.environ`, etc.) and comment lines.
- **Pass:** No hardcoded secret patterns found
- **Warn:** 1–2 suspicious patterns found — review manually (may be false positives)
- **Fail:** 3 or more hardcoded secret patterns found in committed files
- **Skip-When:** Topology reports no secret-handling (not applicable — run always when handles_secrets flag is true)
- **Severity:** critical
- **Category:** 3004

### AS-06: Authentication required on state-changing endpoints

- **What:** Handlers for state-changing HTTP methods (POST, PUT, PATCH, DELETE) carry authentication decorators or reference an auth middleware/guard
- **How:** Find route-definition files and check whether files containing mutation route definitions (`@app.post`, `router.put`, `[HttpDelete]`, etc.) also reference auth decorators or middleware (`@login_required`, `@jwt_required`, `@UseGuards(AuthGuard)`, `authenticate(`, `isAuthenticated`, etc.). Coverage: files with auth / files with mutations ≥ 70% → PASS; 30–70% → WARN; < 30% → FAIL.
- **Pass:** Auth decorators or middleware found alongside mutation routes in ≥ 70% of route files
- **Warn:** Auth found in 30–70% of mutation route files — some endpoints may be unprotected
- **Fail:** Auth absent from ≥ 70% of files that define mutation routes
- **Skip-When:** Topology reports no auth (`uses_auth` false) or no mutation route definitions are found
- **Severity:** critical
- **Category:** 3005

### AS-07: Password / session hygiene

- **What:** Passwords are hashed using a strong algorithm (bcrypt, argon2, scrypt); session tokens are generated with a CSPRNG
- **How:** Grep source files for known password-hashing library references (`bcrypt`, `argon2`, `scrypt`, `passlib`) and CSPRNG session-token patterns (`secrets.token`, `os.urandom`, `crypto.randomBytes`, `SecureRandom`). Also flag insecure patterns (`md5`/`sha1` paired with "password" within 40 chars).
- **Pass:** Strong password hashing algorithm (bcrypt/argon2/scrypt) found
- **Warn:** Only weaker algorithms (pbkdf2, sha256) found — migrate to bcrypt/argon2/scrypt
- **Fail:** MD5 or SHA1 used for password hashing — immediately insecure
- **Skip-When:** No password-hashing or session-token patterns found anywhere — not applicable to this project
- **Severity:** high
- **Category:** 3006

### AS-08: Input validation present

- **What:** Request input is validated or sanitized before processing; a known validation library or decorator is referenced
- **How:** Grep source files for known validation library references (`pydantic`, `marshmallow`, `joi`, `zod`, `class-validator`, `@IsString`, `@Valid`, `javax.validation`, etc.) or manual validation patterns (isinstance, request.args.get, etc.).
- **Pass:** A validation library or decorator is referenced in source files
- **Warn:** Only manual validation patterns found — consider adopting a structured validation library
- **Skip-When:** No validation patterns found at all — may be handled at the gateway/infrastructure level
- **Severity:** high
- **Category:** 3007

### AS-09: Rate limiting on authentication and public endpoints

- **What:** Rate limiting or throttling is configured for authentication and public API endpoints to reduce brute-force exposure
- **How:** Grep source, config, and YAML files for rate-limiting library references (`rate_limit`, `throttle`, `slowDown`, `flask-limiter`, `django-ratelimit`, `express-rate-limit`, `@Throttle`, `@RateLimit`, `UserRateThrottle`, etc.).
- **Pass:** Rate-limiting configuration found
- **Fail:** No rate-limiting references found in source or config
- **Skip-When:** Topology reports no auth (`uses_auth` false)
- **Severity:** medium
- **Category:** 3008

### AS-10: Authorization correctness

- **What:** Authorization checks are applied consistently to all protected resources — no privilege-escalation paths or IDOR (Insecure Direct Object Reference) vulnerabilities are evident from code review
- **How:** This is a judgment check. Read the route/controller handlers and evaluate: (a) do all state-changing endpoints verify the caller's identity AND role/ownership before acting? (b) are there direct-object-reference patterns (accessing DB records by raw user-supplied ID) without ownership verification? (c) are admin-only actions reachable by unprivileged roles?
- **Pass:** All reviewed endpoints enforce authorization consistently; no obvious privilege-escalation paths
- **Warn:** Minor gaps found — isolated endpoints missing ownership checks; low impact
- **Fail:** Systematic authorization gaps — multiple endpoints reachable without correct role/ownership verification
- **Skip-When:** Topology reports no auth (`uses_auth` false)
- **Severity:** critical
- **Category:** 3009

### AS-11: Insecure design review

- **What:** The overall HTTP API design does not exhibit systemic insecure-design patterns (mass assignment, missing object-level access control, sensitive data in error responses, no security design intent)
- **How:** This is a judgment check. Examine the API surface for: (a) mass assignment — binding all request fields to model without an explicit allowlist; (b) sensitive data returned in error responses (stack traces, DB schema, internal paths); (c) missing security context — no mention of threat model, security requirements, or defense-in-depth in any documentation.
- **Pass:** No systemic insecure-design issues evident
- **Warn:** One systemic insecure-design pattern found
- **Fail:** Two or more systemic insecure-design patterns evident
- **Skip-When:** Topology reports no HTTP API present
- **Severity:** high
- **Category:** 3010

### AS-12: .env files are gitignored

- **What:** Environment files containing secrets are excluded from version control
- **How:** Check `.gitignore` for `.env` patterns. Verify that `.env`, `.env.local`, `.env.production`, `.env.*.local` are gitignored. Also check that no `.env` files with actual secrets are tracked in git (`git ls-files '*.env*'`).
- **Pass:** `.env` patterns are in `.gitignore` AND no `.env` files with secrets are tracked
- **Warn:** `.gitignore` covers `.env` but some `.env.example` or `.env.template` files exist (acceptable if they contain only placeholders)
- **Fail:** `.env` files with actual values are tracked in git, OR `.env` is not gitignored
- **Severity:** critical
- **Category:** 2600

### AS-13: .env.example or template exists

- **What:** A template environment file exists so developers know which variables to configure
- **How:**
  1. First, detect whether the project actually uses environment variables. Grep source files for env var access patterns:
     - Node.js/JS/TS: `process\.env`, `import.*dotenv`, `require.*dotenv`, `config()` from dotenv
     - Python: `os\.environ`, `os\.getenv`, `dotenv`, `load_dotenv`
     - Java/Kotlin: `System\.getenv`, `@Value.*\$\{`, `environment\.getProperty`
     - Go: `os\.Getenv`, `godotenv`
     - Ruby: `ENV\[`, `dotenv`
     - General: `.env` references in `docker-compose.yml`, `docker-compose.yaml`, or `Dockerfile` (`env_file:`, `--env-file`)
  2. If no env var usage is detected, mark this check as **SKIP**
  3. If env var usage is found, check for `.env.example`, `.env.template`, `.env.sample`, or equivalent at the repo root and in each detected service directory that uses env vars
  4. Verify that template files contain only placeholder values (no real secrets)
     For monorepos: only flag services that use env vars but lack a template. Services with no env var usage should be ignored.
- **Pass:** Template env file exists with placeholder values at root and/or in service directories that use env vars
- **Warn:** Template exists but only at root level (missing for individual services that use env vars in a monorepo)
- **Fail:** Project uses environment variables but no template env file found anywhere
- **Skip-When:** No environment variable usage detected in the project source code or configuration
- **Severity:** high
- **Category:** 2602

### AS-14: Sensitive files in .gitignore coverage

- **What:** Sensitive file types relevant to this project's stack are covered by .gitignore
- **How:**
  1. Read the topology summary to understand the project's languages, frameworks, and infrastructure
  2. Based on the detected stack, determine which sensitive file types are relevant (e.g., `*.jks` for Java, `*.pfx` for .NET, `service-account*.json` for GCP projects). Always include OS files (`.DS_Store`, `Thumbs.db`) as universally relevant.
  3. Check `.gitignore` for coverage of only the relevant patterns
  4. Do NOT flag missing patterns for file types unrelated to the project's stack
- **Pass:** `.gitignore` covers all sensitive file types relevant to the detected stack
- **Warn:** Some relevant categories are covered but others are missing
- **Fail:** `.gitignore` is missing or has minimal coverage of sensitive file types relevant to this stack
- **Skip-When:** Project topology could not be determined (no topology artifact available), or no sensitive file types relevant to the stack are present (nothing to cover)
- **Severity:** high
- **Category:** 2604
