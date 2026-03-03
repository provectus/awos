---
name: spec-driven-development
title: Spec-Driven Development
description: Checks readiness for specification-driven development workflows
severity: critical
depends-on: [project-topology]
---

# Spec-Driven Development

Audits whether the project is set up for spec-driven development (SDD) — a workflow where features are defined as specifications before code is written. This checks for any SDD approach (AWOS, ADRs, RFCs, custom specs, etc.).

All checks in this dimension are static (file existence and content checks).

## Checks

### SDD-01: Product definition exists

- **What:** A product definition document describes what the project is, who it's for, and why
- **How:** Check for product definition at common paths: `context/product/product.md`, `context/product/product-definition.md`, `docs/product.md`, `docs/product-definition.md`, or similar. Also check service-level `context/product/` directories detected from the topology artifact.
- **Pass:** Product definition exists with clear problem statement and target audience
- **Warn:** Product definition exists but is incomplete or vague
- **Fail:** No product definition found
- **Severity:** critical

### SDD-02: Roadmap document exists

- **What:** A roadmap outlines planned features and priorities
- **How:** Check for roadmap files at: `context/product/roadmap.md`, `docs/roadmap.md`, `ROADMAP.md`, or similar. Verify it lists at least 3 features or milestones.
- **Pass:** Roadmap exists with prioritized features
- **Warn:** Roadmap exists but has fewer than 3 items or no prioritization
- **Fail:** No roadmap document found
- **Severity:** high

### SDD-03: Architecture documentation exists

- **What:** System architecture is documented before implementation
- **How:** Check for architecture docs at: `context/product/architecture.md`, `docs/architecture.md`, `docs/adr/`, `ARCHITECTURE.md`, or similar. Verify it describes the tech stack, major components, and their interactions.
- **Pass:** Architecture doc exists and covers stack, components, and data flow
- **Warn:** Architecture doc exists but is incomplete
- **Fail:** No architecture documentation found
- **Severity:** high

### SDD-04: SDD tooling or workflow is configured

- **What:** An SDD tool or workflow is configured for the project (AWOS, ADRs, RFCs, custom spec templates, etc.)
- **How:** Check for SDD tooling indicators: custom slash commands for spec workflows (Glob `.claude/commands/**/*.md` and check for spec/task/implement-related commands), ADR directories (`docs/adr/`, `docs/decisions/`), RFC directories (`docs/rfc/`), spec templates, or references to SDD tools in CLAUDE.md or package.json.
- **Pass:** SDD tooling or workflow is configured with commands or templates
- **Warn:** Partial SDD setup (some structure exists but no clear workflow)
- **Fail:** No SDD tooling or workflow found
- **Severity:** critical

### SDD-05: Specification directory structure exists

- **What:** The project has a designated place for feature specifications
- **How:** Check for spec directories at root and/or service levels: `context/specs/`, `docs/specs/`, `docs/rfc/`, `docs/adr/`, or similar. Look for at least one spec file.
- **Pass:** Specs directory exists with at least one completed spec
- **Warn:** Specs directory exists but is empty
- **Fail:** No specs directory found
- **Severity:** high

### SDD-06: CLAUDE.md references SDD workflow

- **What:** The root CLAUDE.md documents the SDD workflow so all contributors (human and AI) follow it
- **How:** Read the root `CLAUDE.md` and check for references to a spec-driven workflow — any structured development flow section that mandates specifications before code (AWOS, ADRs, RFCs, or custom spec workflow).
- **Pass:** CLAUDE.md explicitly documents the SDD workflow with steps
- **Warn:** CLAUDE.md mentions specs or a development workflow but without clear steps
- **Fail:** CLAUDE.md does not reference any SDD workflow
- **Severity:** high

### SDD-07: Specs link to implementation

- **What:** Specifications reference or link to their implementation (branches, PRs, or code paths)
- **How:** Read 2-3 spec files from the detected specs directory. Check whether they contain references to implementation branches, PR links, or file paths.
- **Pass:** Specs contain implementation references (branch names, PR links, or file paths)
- **Warn:** Some specs have references, others don't
- **Fail:** No specs reference their implementation, or no specs exist to check
- **Severity:** medium
