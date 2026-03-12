---
name: end-to-end-delivery
title: End-to-End Delivery
description: Evaluates the project's ability to deliver complete vertical slices across all layers
severity: high
depends-on:
  [
    project-topology,
    documentation,
    security,
    ai-development-tooling,
    spec-driven-development,
    code-architecture,
    software-best-practices,
  ]
---

# End-to-End Delivery

Audits whether the project delivers complete features as vertical slices that span all relevant layers (API, UI, database, infrastructure) rather than horizontal slabs. Reads all prior dimension artifacts to cross-reference findings.

For single-layer projects, most checks will auto-SKIP since cross-layer delivery is not applicable.

## Checks

### E2E-01: Cross-layer feature branches

- **What:** Feature branches touch multiple layers in a single branch, indicating vertical delivery
- **How:** Analyze recent git history (last 20 merged branches or last 3 months). For each branch, check which top-level directories were modified. In a monorepo, look for branches that touch 2+ service directories. Use `git log --all --oneline --since="3 months ago"` and `git diff --name-only` to analyze.
- **Pass:** 50%+ of feature branches touch multiple layers
- **Warn:** 25-49% of feature branches touch multiple layers
- **Fail:** <25% of feature branches are cross-layer (most are single-layer)
- **Skip-When:** Topology artifact shows single-service repo (not a monorepo)
- **Severity:** high

### E2E-02: No layer-split branching pattern

- **What:** Branches are not split by layer (e.g., no `feature-X-backend` / `feature-X-frontend` pairs)
- **How:** Check recent branch names in git history for patterns like `*-backend`, `*-frontend`, `*-api`, `*-ui` suffixes on what appears to be the same feature. Use `git branch -a --list` and look for paired branch names.
- **Pass:** No layer-split branch pairs found
- **Warn:** 1-2 instances of layer-split branches found
- **Fail:** Systematic pattern of layer-split branches (3+ pairs)
- **Skip-When:** Topology artifact shows single-service repo
- **Severity:** medium

### E2E-03: Spec-to-delivery traceability

- **What:** Specifications link to implementation and implementation references specs
- **How:** Read the spec-driven-development artifact. If SDD-04 (features are implemented through specs) is PASS or WARN, check a sample of 2-3 recent feature branches to see if commit messages or PR descriptions reference spec documents. Also check if spec files' tasks.md have checked-off items that correlate with the branch's changes.
- **Pass:** Bidirectional tracing exists: specs → branches and branches → specs
- **Warn:** One-directional tracing only (specs reference branches OR branches reference specs, but not both)
- **Fail:** No traceability between specifications and implementation
- **Skip-When:** Spec-driven-development artifact shows SDD-04 as FAIL (no specs or no spec-driven development)
- **Severity:** high

### E2E-04: No orphaned artifacts

- **What:** API definitions have corresponding UI consumers, database schemas have corresponding API layers
- **How:** Read the topology artifact. For each detected layer pair (API↔UI, DB↔API), verify the other layer exists and uses it. For example: if OpenAPI specs define endpoints, check that the frontend has corresponding API client calls. If database migrations define tables, check that backend code references those tables.
- **Pass:** No orphaned artifacts found — all layers are connected
- **Warn:** 1-2 minor orphans (e.g., unused API endpoint, defined but unreferenced table)
- **Fail:** Significant orphaned artifacts (entire API surface with no UI consumer, or schema with no API)
- **Skip-When:** Topology artifact shows only one layer detected
- **Severity:** medium

### E2E-05: Shared ownership enablers

- **What:** The project has cross-layer tooling that enables developers to work across the full stack
- **How:** Check for root-level tooling that spans layers: shared `Makefile` or `Taskfile` with commands for both backend and frontend, root `docker-compose.yml` that starts the full stack, shared CI/CD pipeline that builds and tests all layers, root-level `package.json` scripts or task runner.
- **Pass:** Root-level cross-layer tooling exists (unified dev start, shared CI, etc.)
- **Warn:** Some cross-layer tooling but incomplete (e.g., docker-compose but no unified task runner)
- **Fail:** No shared tooling — each layer is completely independent with no unified entry point
- **Skip-When:** Topology artifact shows single-service repo
- **Severity:** medium
