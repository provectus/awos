---
name: spec-driven-development
title: Spec-Driven Development
description: Checks that the project practises spec-driven development by a recognized convention and that its specs, architecture, and task assignments are healthy
severity: critical
depends-on: [project-topology]
---

# Spec-Driven Development

Audits whether the project practises spec-driven development by any recognized convention — AWOS, Kiro, Agent-OS, GitHub Spec Kit, or an ADR/design-doc practice — and whether its specs, architecture, and task assignments stay healthy over the project's life. Each convention provides its own structured workflow for designing work before it is built and recording that design where the next person or agent will find it; AWOS's version runs product definition, roadmap, architecture, functional specs, technical considerations, task breakdown with agent assignments, implementation, and verification. The checks below credit whichever convention a project actually uses, not AWOS specifically.

## Checks

### SDD-01: A spec-driven practice is adopted

- **What:** The project practises spec-driven development through a recognized convention, with real records — not just an empty marker directory
- **How:**
  1. Check for AWOS first: `.awos/commands/*.md` (5+ command files) present, and either `context/product/` or `context/spec/` present
  2. AWOS counts as only partially adopted when just one half is present — the `.awos/` framework without a populated `context/product`/`context/spec`, or the reverse
  3. If no AWOS marker is found, check the other recognized conventions: Kiro (`.kiro/specs/`), Agent-OS (`.agent-os/specs/`), GitHub Spec Kit (`.specify` or `specs/`), or an ADR/design-doc practice (`docs/adr/`, `doc/adr/`, `docs/decisions/`, `docs/rfcs/`, `design-docs/`). The ADR practice must clear a minimum of 3 records under its root to count as adopted — a single stray decision file is not a practice.
  4. For whichever convention's marker is found, check whether its spec root actually holds records, not just the marker
- **Pass:** AWOS is fully set up (framework installed and at least one of `context/product`/`context/spec` populated), OR another recognized convention is in use and holds real records
- **Warn:** AWOS is partially set up (only the framework or only the context directories present), OR another convention's marker is present but its spec root holds no records yet
- **Fail:** No spec-driven practice found under any recognized convention
- **Severity:** critical
- **Category:** 2800

### SDD-02: Product context documents are complete

- **What:** The project records its product definition, roadmap, and architecture — under AWOS's filenames or a conventional equivalent
- **How:**
  1. For each of the three foundational documents, check the first substantive match among its candidates:
     - Product definition: `context/product/product-definition.md`, `context/product/product.md`, `docs/product.md`, `docs/product-definition.md`, `PRODUCT.md`, `docs/vision.md`
     - Roadmap: `context/product/roadmap.md`, `docs/roadmap.md`, `ROADMAP.md`, `docs/milestones.md`
     - Architecture record: `context/architecture/architecture.md`, `context/product/architecture.md`, `docs/architecture.md`, `ARCHITECTURE.md`, `docs/adr/README.md`, `docs/adr/index.md`, `docs/decisions/README.md`
  2. A document only counts if it is substantive — more than 5 non-blank lines
  3. For monorepos: also check service-level `*/context/product/` directories if detected in the topology artifact
- **Pass:** All three documents are present with substantive content
- **Warn:** Two of the three are present with substantive content
- **Fail:** Fewer than two are present with substantive content
- **Severity:** high
- **Category:** 2801

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
- **Skip-When:** `context/product/architecture.md` does not exist (covered by SDD-02)
- **Severity:** high
- **Category:** 2802

### SDD-04: Features are implemented through specs

- **What:** Significant features are built through a spec workflow (spec → tech → tasks → implement, or the equivalent stages of whichever convention is in use), not by ad-hoc prompting. Feature branches should show spec activity — tasks checked off, status updates — as evidence that specs drove the work.
- **How:** Computed deterministically over the trunk's audit window (`[meta].max_lookback_days`, 90 by default). The denominator is merged feature work — first-parent merge commits plus squash/rebase-merged PRs (forge PR ref on the subject) — so repos whose CI deletes branches after merge still count all delivered work, not just currently-open branches. An event counts as spec-driven when its first-parent diff touched a recognised spec directory (`context/spec/`, `specs/`, `.kiro/specs/`, `.agent-os/specs/`, `docs/specs/`). Repos with no merge/PR workflow fall back to evaluating live feature branches against the trunk.
- **Pass:** 70%+ of feature branches touched spec files (tasks checked off, status updated)
- **Warn:** 30-69% of feature branches touched spec files
- **Fail:** Fewer than 30% of feature branches touched spec files, OR zero spec directories exist despite active development
- **Severity:** critical
- **Category:** 2803

### SDD-05: Spec or decision records are structurally complete

- **What:** Every spec/decision record under a recognized convention contains the file set — or, for a single-file ADR, the sections — that convention requires to be complete
- **How:**
  1. Enumerate every record under every recognized convention in use: AWOS's numbered `context/spec/NNN-*/` directories, Kiro's `.kiro/specs/*/`, Agent-OS's `.agent-os/specs/*/`, GitHub Spec Kit's `specs/*/`, or individual markdown files under an ADR root
  2. For a multi-file convention, check for its required record files:
     - AWOS: `functional-spec.md`, `technical-considerations.md`, `tasks.md`
     - Kiro: `requirements.md`, `design.md`, `tasks.md`
     - Agent-OS: `spec.md`, `tasks.md`
     - GitHub Spec Kit: `spec.md`, `plan.md`, `tasks.md`
  3. For the single-file ADR convention, check for the required headings instead: `Status`, `Context`, `Decision`, `Consequences`
  4. Each record earns fractional credit — elements present divided by elements required — rather than a binary complete/incomplete verdict. Average that credit across every record in the repo; a single spec missing only one file must not swing an otherwise-healthy repo to a hard FAIL.
- **Pass:** Average credit across all records is 90%+
- **Warn:** Average credit is 50-89%
- **Fail:** Average credit is below 50%
- **Skip-When:** No spec or decision records exist under any recognized convention (covered by SDD-04)
- **Severity:** high
- **Category:** 2804

### SDD-06: No stale or abandoned specs

- **What:** Records that have progressed past their convention's initial statuses are still actively being worked on, not abandoned mid-workflow. Staleness is judged against each convention's own status vocabulary, not AWOS's.
- **How:**
  1. Read each record's declared status from its status-bearing file — the first triad file for a multi-file convention (`functional-spec.md` for AWOS), or the record itself for a single-file ADR
  2. Classify the status against the owning convention's own vocabulary:
     - AWOS: active = Draft, In Review, Approved; terminal = Completed
     - Kiro / Agent-OS / GitHub Spec Kit: active = Draft, In Progress; terminal = Done, Completed
     - ADR: active = Proposed, Draft; terminal = Accepted, Superseded, Deprecated, Rejected
  3. A record whose declared status matches neither list by exact equality — including an unedited status placeholder, such as AWOS's shipped template menu `Draft | In Review | Approved | Completed` — declares no recognized status and is excluded from the ratio rather than counted either way
  4. A terminal record is settled and is never stale. An active record alone is not abandonment — a spec opened five minutes ago is also "active" — so it only counts as stale when the convention's task-bearing record file (the `recordTriad` member whose name looks like a task list, e.g. `tasks.md`) both exists and shows zero task items (no `- [ ]` / `- [x]` lines at all). A record whose task file hasn't been authored yet is not counted stale — there is no progress artifact yet to call "no progress" against. A convention with no task-bearing file at all (a single-file ADR has none) can never contribute a stale record; that PASS is the honest outcome for a practice this check has no progress signal for, not a gap in the check
  5. Count how many judged records are both active and stuck at zero task progress
- **Pass:** None of the judged records are still active
- **Warn:** A minority of judged records are active (at most 2, and at most half of the judged records)
- **Fail:** Otherwise — active records are not a minority
- **Skip-When:** No spec or decision records exist under any recognized convention, or none of them declares a status this check recognizes
- **Severity:** medium
- **Category:** 2805

### SDD-07: Tasks have meaningful agent assignments

- **What:** Tasks nested under slice headers in tasks.md files are annotated with agent assignments using the AWOS format `**[Agent: agent-name]**`, and the majority of assignments are meaningful — specialist agents for implementation work, QA/tester agents for verification steps
- **How:**
  1. Glob for all `context/spec/*/tasks.md` files
  2. For each tasks.md, grep for the pattern `\*\*\[Agent:.*\]\*\*` to find agent assignments
  3. Count: total task lines (indented checkbox lines `- \[ \]` / `- \[x\]` nested under a slice header) vs task lines with agent annotations. Older specs may use the legacy `Sub-task:` label — treat those identically.
  4. Calculate the annotation ratio: annotated tasks / total tasks
  5. Extract all unique agent names. Occasional `general-purpose` assignments are fine for small utility tasks (commits, running linters, config tweaks) — only flag if the majority of implementation tasks use `general-purpose`.
  6. Check for domain mix-ups: frontend agents assigned to backend/database tasks or vice versa. Use keywords in the task description to detect domain (e.g., "migration", "database", "API endpoint" → backend; "component", "UI", "page", "styling" → frontend).
  7. Check QA agent coverage using whichever tasks model the spec follows:
     - **New model:** if the spec ends with a slice titled "Feature Testing & Regression", verify its tasks are assigned to a QA-coded agent. Any agent whose role or skill set covers acceptance/regression testing counts — `testing-expert`, a project-specific tester (e.g. `react-testing`, `pytest-tester`), or a `general-purpose` assignment if the Recommendations table also flags missing QA tooling. Implementation slices do not need per-slice QA assignments in this model.
     - **Legacy model:** if no Feature Testing & Regression slice is found, each implementation slice should have at least one Verify task assigned to a QA-coded agent (e.g. `manual-qa-expert`, `testing-expert`, or similar) — not to the agent that implemented the slice.
- **Applies when:** the project uses AWOS (`topology.uses_awos`). Non-AWOS projects SKIP — the `**[Agent: name]**` notation has no equivalent in other conventions, and failing a project for not using it would measure vendor adoption rather than capability.
- **Pass:** Majority of tasks have agent assignments with no systematic domain mix-ups; AND either (new model) a Feature Testing & Regression slice carries QA-coded assignments, or (legacy model) per-slice Verify tasks are assigned to QA-coded agents
- **Warn:** Many tasks lack annotations, OR most implementation tasks use `general-purpose`, OR verification tasks lack a QA-coded agent; OR (new model) the Feature Testing & Regression slice is present but its tasks are unassigned
- **Fail:** No agent annotations at all, OR systematic domain mix-ups across multiple specs
- **Skip-When:** No tasks.md files exist (covered by SDD-05)
- **Severity:** medium
- **Category:** 2806

## SDD Summary

When writing the dimension artifact, include this structured summary for downstream dimensions:

```
- **Spec practice:** [recognized conventions in use, or none]
- **Product context:** [which of product-definition / roadmap / architecture exist]
- **Spec count:** N directories (N complete, N partial, N skeleton)
- **Spec status distribution:** N Draft, N In Review, N Approved, N Completed
- **Stale specs:** N stale (list directory names)
- **Spec-to-branch ratio:** N% of recent feature branches correlate with spec activity
- **Agent coverage:** N% of tasks have meaningful agent assignments
```
