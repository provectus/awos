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

- **What:** API endpoints are documented via OpenAPI/Swagger specs or equivalent, proportional to API surface and exposure
- **How:**
  1. Read the topology summary to detect API layers (REST controllers, route handlers, GraphQL schemas, API gateway config)
  2. Estimate the API surface by counting route/endpoint definitions across the codebase
  3. Determine API exposure:
     - **Public/external**: API gateway, public-facing services, APIs consumed by third parties or unknown clients
     - **Internal/closed**: co-located server and client in the same repo, internal microservices, few endpoints
  4. Glob for `**/swagger/**/*.yaml`, `**/swagger/**/*.yml`, `**/openapi.yaml`, `**/openapi.json`, or equivalent (GraphQL schema files, generated API docs)
  5. Scale the assessment based on API surface and exposure (see criteria below)
- **Pass:** OpenAPI/Swagger specs exist and cover the project's API surface
- **Warn:** Large or public-facing API has no formal spec, OR specs exist but appear incomplete
- **Fail:** Large public API (many endpoints, external consumers) with no API documentation at all
- **Skip-When:** Project has no API layer, or has a small closed API (few endpoints with a co-located client)
- **Severity:** high for large/public APIs, medium for moderate internal APIs

### DOC-04: No stale documentation

- **What:** Documentation references match current code reality
- **How:** Sample 3-5 specific claims from READMEs and CLAUDE.md files (e.g., referenced commands, file paths, tool names). Verify each claim against the actual codebase using Glob and Grep.
- **Pass:** All sampled claims are accurate
- **Warn:** 1-2 sampled claims are inaccurate or outdated
- **Fail:** 3+ sampled claims are inaccurate
- **Severity:** medium
