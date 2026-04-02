---
name: spec-driven-development
title: Spec-Driven Development
description: Checks that the project uses AWOS for spec-driven development and that specs, architecture, and task assignments are healthy
severity: critical
depends-on: [project-topology]
---

# Spec-Driven Development

Audits whether the project uses AWOS for spec-driven development. AWOS provides a structured workflow: product definition, roadmap, architecture, functional specs, technical considerations, task breakdown with agent assignments, implementation, and verification. SDD-01 is a gatekeeper check — if AWOS is not installed, all subsequent checks SKIP automatically.

## Checks

### SDD-01: AWOS is installed and set up

- **What:** AWOS framework is installed in the project, providing the spec-driven development workflow
- **How:**
  1. Check for AWOS core directory: Glob for `.awos/commands/*.md` — expect at least 5 command files (product, roadmap, architecture, spec, tech, tasks, implement, verify)
  2. Check for Claude Code wrapper commands: Glob for `.claude/commands/awos/*.md`
  3. Check for AWOS context directories: verify `context/product/` and `context/spec/` directories exist
  4. Minimum to pass: `.awos/commands/` has 5+ command files AND `.claude/commands/awos/` has wrapper files AND both `context/product/` and `context/spec/` directories exist
- **Pass:** All AWOS directories present with command files, templates, and context structure
- **Warn:** AWOS partially installed — some directories or command files missing (e.g., `.awos/` exists but `.claude/commands/awos/` is missing, or fewer than 5 commands found)
- **Fail:** AWOS not installed — `.awos/commands/` directory does not exist or contains no `.md` files
- **Severity:** critical

### SDD-02: Product context documents are complete

- **What:** The three foundational AWOS documents exist and contain substantive content: product definition, roadmap, and architecture
- **How:**
  1. Check for `context/product/product-definition.md` (or `context/product/product.md`). Read the file and verify it contains at least a project name, vision/purpose, and target audience (the core sections from the AWOS product-definition template)
  2. Check for `context/product/roadmap.md`. Read and verify it contains at least one phase with checklist items (`- [ ]` or `- [x]`)
  3. Check for `context/product/architecture.md`. Read and verify it contains at least two architectural area sections with technology choice entries
  4. For monorepos: also check service-level `*/context/product/` directories if detected in the topology artifact
- **Pass:** All three documents exist with substantive content matching their AWOS template structure
- **Warn:** All three documents exist but one or more is skeletal (fewer than 20 lines, or missing key sections like target audience in product-definition, phases in roadmap, or technology choices in architecture)
- **Fail:** One or more of the three foundational documents is missing entirely
- **Skip-When:** SDD-01 is FAIL (AWOS not installed)
- **Severity:** high

### SDD-03: Architecture document reflects codebase reality

- **What:** Technology choices declared in `context/product/architecture.md` match what is actually used in the codebase
- **How:**
  1. Read `context/product/architecture.md` and extract all technology choices (look for `**Component Name:** Technology Choice` entries or similar structured technology declarations across all architectural areas)
  2. Read the topology summary from the topology artifact. Extract detected frameworks, languages, storage systems, and infrastructure tools
  3. Cross-reference: for each technology in architecture.md, check if it appears in the topology summary OR in package manifests (`package.json` dependencies, `build.gradle.kts` dependencies, `pyproject.toml` dependencies, `go.mod` requires, `Cargo.toml` dependencies — check whichever are relevant per the topology)
  4. Flag two types of drift:
     - **Phantom technologies**: declared in architecture.md but not detected in code or dependencies (e.g., "Redis" listed but no Redis client dependency and no Redis in docker-compose)
     - **Undocumented technologies**: detected in topology or package manifests but not mentioned in architecture.md (e.g., Elasticsearch client in dependencies but not in architecture doc). Only flag significant technologies (frameworks, databases, infrastructure), not utility libraries.
  5. Tolerance: 1-2 minor discrepancies are acceptable (WARN). Focus on major stack components, not every utility library.
- **Pass:** All major technology choices in architecture.md are confirmed in the codebase, and no significant undocumented technologies found
- **Warn:** 1-2 minor discrepancies (a small utility missing from the doc, or a planned-but-not-yet-used technology listed)
- **Fail:** Major drift — a core technology (primary database, main framework, cloud provider) is listed but not used, OR a core technology in use is entirely absent from the architecture document
- **Skip-When:** SDD-01 is FAIL (AWOS not installed), or `context/product/architecture.md` does not exist (covered by SDD-02)
- **Severity:** high

### SDD-04: Features are implemented through specs

- **What:** Significant features are built through the AWOS spec workflow (spec → tech → tasks → implement), not by ad-hoc prompting. Feature branches should show spec activity — tasks checked off, status updates — as evidence that specs drove the work.
- **How:**
  1. If zero spec directories exist under `context/spec/`, this is an immediate FAIL (no specs means no spec-driven development)
  2. Analyze recent git history (last 3 months): use `git log --all --oneline --since="3 months ago"` to find feature branches. Identify branches with `feat/`, `feature/` prefixes — skip `fix/`, `chore/`, `docs/`, `ci/`, `refactor/` prefixes as these represent small work that doesn't require specs.
  3. For each feature branch, check if it modified any files under `context/spec/` using `git diff --name-only`. Look for changes to `tasks.md` (checked-off items `[x]`) or `functional-spec.md` (status updates).
  4. Calculate ratio: feature branches with spec activity / total feature branches. Only evaluate the feature branches that exist — do not flag branching strategy or the number of branches.
- **Pass:** 70%+ of feature branches touched spec files (tasks checked off, status updated)
- **Warn:** 30-69% of feature branches touched spec files
- **Fail:** Fewer than 30% of feature branches touched spec files, OR zero spec directories exist despite active development
- **Skip-When:** SDD-01 is FAIL (AWOS not installed)
- **Severity:** critical

### SDD-05: Spec directories are structurally complete

- **What:** Each spec directory contains the full AWOS spec triad: functional-spec.md, technical-considerations.md, and tasks.md
- **How:**
  1. Glob for all spec directories: `context/spec/*/`
  2. For each directory, check for the existence of:
     - `functional-spec.md` (created by `/awos:spec`)
     - `technical-considerations.md` (created by `/awos:tech`)
     - `tasks.md` (created by `/awos:tasks`)
  3. Classify each spec directory:
     - **Complete**: all three files present
     - **Partial**: functional-spec.md exists but one or both of the other files are missing
     - **Skeleton**: directory exists but functional-spec.md is missing or empty
  4. Calculate completeness ratio: complete directories / total spec directories
- **Pass:** All spec directories (or 90%+) contain the full triad of documents
- **Warn:** 50-89% of spec directories are complete; the rest are partial (functional spec exists but tech or tasks missing — indicating the workflow was started but not finished)
- **Fail:** Fewer than 50% of spec directories are complete, OR most directories are skeletons
- **Skip-When:** SDD-01 is FAIL (AWOS not installed), or no spec directories exist (covered by SDD-04)
- **Severity:** high

### SDD-06: No stale or abandoned specs

- **What:** Specs that have progressed past Draft are actively being worked on, not abandoned mid-workflow
- **How:**
  1. Read all `context/spec/*/functional-spec.md` files and extract the `Status:` field
  2. For each spec with Status "Approved" or "In Review":
     - Check if `tasks.md` exists in the same directory. If not, this spec is stale (approved but never broken into tasks).
     - If `tasks.md` exists, count `[x]` vs `[ ]` items. If zero items are checked, the spec may be stale (tasks created but never started).
  3. For each spec with Status "Draft":
     - Check if the functional-spec.md is substantive (more than template boilerplate — at least 30 lines with actual content beyond placeholders). A Draft with real content that has sat untouched is a softer staleness signal.
  4. Count stale specs (Approved/In Review with no tasks.md, or with zero-progress tasks.md)
- **Pass:** No stale specs found — all Approved/In Review specs have tasks.md with at least some progress
- **Warn:** 1-2 stale specs found (Approved but no tasks, or tasks exist with zero progress)
- **Fail:** 3+ stale specs, OR more than half of non-Draft specs show no task progress
- **Skip-When:** SDD-01 is FAIL (AWOS not installed), or no spec directories exist, or all specs are Draft (too early to detect staleness)
- **Severity:** medium

### SDD-07: Tasks have meaningful agent assignments

- **What:** Sub-tasks in tasks.md files are annotated with agent assignments using the AWOS format `**[Agent: agent-name]**`, and the majority of assignments are meaningful — specialist agents for implementation work, QA/tester agents for verification steps
- **How:**
  1. Glob for all `context/spec/*/tasks.md` files
  2. For each tasks.md, grep for the pattern `\*\*\[Agent:.*\]\*\*` to find agent assignments
  3. Count: total sub-task lines (lines matching `- \[ \]` or `- \[x\]` at indented level) vs sub-task lines with agent annotations
  4. Calculate the annotation ratio: annotated sub-tasks / total sub-tasks
  5. Extract all unique agent names. Occasional `general-purpose` assignments are fine for small utility tasks (commits, running linters, config tweaks) — only flag if the majority of implementation sub-tasks use `general-purpose`.
  6. Check for domain mix-ups: frontend agents assigned to backend/database tasks or vice versa. Use keywords in the sub-task description to detect domain (e.g., "migration", "database", "API endpoint" → backend; "component", "UI", "page", "styling" → frontend).
  7. Check that each slice's verification/testing sub-task is assigned to a QA/tester agent (e.g., `manual-qa-expert`, `testing-expert`, or similar) — not to the same agent that implemented the slice.
- **Pass:** Majority of sub-tasks have agent assignments with no systematic domain mix-ups and verification tasks are assigned to QA/tester agents
- **Warn:** Many sub-tasks lack annotations, OR most implementation tasks use `general-purpose`, OR verification tasks lack dedicated QA agent
- **Fail:** No agent annotations at all, OR systematic domain mix-ups across multiple specs
- **Skip-When:** SDD-01 is FAIL (AWOS not installed), or no tasks.md files exist (covered by SDD-05)
- **Severity:** medium

## SDD Summary

When writing the dimension artifact, include this structured summary for downstream dimensions (especially end-to-end-delivery):

```
- **AWOS installed:** yes | no
- **Product context:** [which of product-definition / roadmap / architecture exist]
- **Spec count:** N directories (N complete, N partial, N skeleton)
- **Spec status distribution:** N Draft, N In Review, N Approved, N Completed
- **Stale specs:** N stale (list directory names)
- **Spec-to-branch ratio:** N% of recent feature branches correlate with spec activity
- **Agent coverage:** N% of sub-tasks have meaningful agent assignments
```
