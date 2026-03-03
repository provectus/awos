---
name: documentation
title: Documentation Quality
description: Verifies that project documentation is accurate, complete, and maintainable
severity: critical
depends-on: [project-topology]
---

# Documentation Quality

Audits documentation coverage across the repository. Well-documented projects are faster to onboard, easier to maintain, and produce fewer knowledge-silo bugs.

## Checks

### DOC-01: Root README exists and is useful

- **What:** The repository has a top-level README.md with setup instructions
- **How:** Read `README.md` at the repo root. Check that it contains: project name, description, setup/install steps, and how to run the project.
- **Pass:** README.md exists and contains setup instructions a new developer could follow
- **Warn:** README.md exists but is missing setup steps or is clearly outdated
- **Fail:** README.md is missing or is an empty placeholder
- **Severity:** critical

### DOC-02: Service-level READMEs exist

- **What:** Each major service directory has its own README.md
- **How:** Read the topology artifact to get the list of service directories. For each detected service directory, check for a README.md
- **Pass:** Every service directory has a README.md with build/run instructions
- **Warn:** Some service directories are missing READMEs
- **Fail:** No service-level READMEs exist
- **Severity:** high

### DOC-03: API documentation is available

- **What:** API endpoints are documented via OpenAPI/Swagger specs or equivalent
- **How:** Glob for `**/swagger/**/*.yaml`, `**/swagger/**/*.yml`, `**/openapi.yaml`, `**/openapi.json`. Also check for generated API docs or Swagger UI configuration.
- **Pass:** OpenAPI specs exist and cover the project's API surface
- **Warn:** Specs exist but appear incomplete (few paths defined relative to the number of controllers)
- **Fail:** No API documentation found
- **Severity:** high

### DOC-04: No stale documentation

- **What:** Documentation references match current code reality
- **How:** Sample 3-5 specific claims from READMEs and CLAUDE.md files (e.g., referenced commands, file paths, tool names). Verify each claim against the actual codebase using Glob and Grep.
- **Pass:** All sampled claims are accurate
- **Warn:** 1-2 sampled claims are inaccurate or outdated
- **Fail:** 3+ sampled claims are inaccurate
- **Severity:** medium
