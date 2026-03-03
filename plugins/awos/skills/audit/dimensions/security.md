---
name: security
title: Security Guardrails
description: Checks that sensitive files are protected from accidental exposure and AI agents are restricted from reading secrets
severity: critical
depends-on: [project-topology]
---

# Security Guardrails

Audits whether the project protects sensitive data (secrets, credentials, environment files) from accidental exposure — both to version control and to AI agents. This dimension focuses on guardrails and preventive controls, not application-level security (SQL injection, XSS, etc. are covered in software-best-practices).

## Checks

### SEC-01: .env files are gitignored

- **What:** Environment files containing secrets are excluded from version control
- **How:** Check `.gitignore` for `.env` patterns. Verify that `.env`, `.env.local`, `.env.production`, `.env.*.local` are gitignored. Also check that no `.env` files with actual secrets are tracked in git (`git ls-files '*.env*'`).
- **Pass:** `.env` patterns are in `.gitignore` AND no `.env` files with secrets are tracked
- **Warn:** `.gitignore` covers `.env` but some `.env.example` or `.env.template` files exist (acceptable if they contain only placeholders)
- **Fail:** `.env` files with actual values are tracked in git, OR `.env` is not gitignored
- **Severity:** critical

### SEC-02: AI agent hooks restrict access to sensitive files

- **What:** Claude Code hooks are configured to prevent AI agents from reading sensitive files (.env, credentials, private keys, etc.)
- **How:** Read `.claude/settings.json` and check for `hooks` configuration. Look for `PreToolUse` hooks on `Read`, `Glob`, or `Bash` tools that block access to sensitive file patterns. Expected patterns to block include: `.env`, `*.pem`, `*.key`, `credentials*`, `secrets*`, `*secret*`, `*.p12`, `*.pfx`. The hooks should exist and actively deny reads to these patterns.
- **Pass:** Hooks exist in `.claude/settings.json` that explicitly block AI agent access to sensitive file patterns
- **Warn:** Some hooks exist but coverage is incomplete (e.g., `.env` is blocked but private keys are not)
- **Fail:** No hooks restricting agent access to sensitive files, OR `.claude/settings.json` does not exist
- **Severity:** critical

### SEC-03: .env.example or template exists

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

### SEC-04: No secrets in committed files

- **What:** No hardcoded secrets, API keys, or credentials are committed to the repository
- **How:** Grep for common secret patterns in source files (exclude test fixtures, mocks, and example files):
  - API key patterns: `api[_-]?key\s*[:=]`, `apikey\s*[:=]`
  - Secret patterns: `secret\s*[:=]\s*["'][^"']+["']`, `password\s*[:=]\s*["'][^"']+["']`
  - Token patterns: `token\s*[:=]\s*["'][A-Za-z0-9+/=]{20,}["']`
  - Private key headers: `-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----`
  - AWS patterns: `AKIA[0-9A-Z]{16}`
  Check results against context — connection strings to `localhost` and placeholder values like `changeme`, `TODO`, `xxx` are not real secrets.
- **Pass:** No hardcoded secrets found in committed files
- **Warn:** Suspicious patterns found but appear to be placeholders or test values
- **Fail:** Real secrets or credentials found in committed source code
- **Severity:** critical

### SEC-05: Sensitive files in .gitignore coverage

- **What:** Sensitive file types relevant to this project's stack are covered by .gitignore
- **How:**
  1. Read the topology summary to understand the project's languages, frameworks, and infrastructure
  2. Based on the detected stack, determine which sensitive file types are relevant (e.g., `*.jks` for Java, `*.pfx` for .NET, `service-account*.json` for GCP projects). Always include OS files (`.DS_Store`, `Thumbs.db`) as universally relevant.
  3. Check `.gitignore` for coverage of only the relevant patterns
  4. Do NOT flag missing patterns for file types unrelated to the project's stack
- **Pass:** `.gitignore` covers all sensitive file types relevant to the detected stack
- **Warn:** Some relevant categories are covered but others are missing
- **Fail:** `.gitignore` is missing or has minimal coverage of sensitive file types relevant to this stack
- **Skip-When:** Project topology could not be determined (no topology artifact available)
- **Severity:** high
