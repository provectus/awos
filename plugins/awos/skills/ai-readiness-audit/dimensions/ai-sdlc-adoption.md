---
name: ai-sdlc-adoption
title: AI-SDLC Adoption
description: Measures the team's quantitative adoption of AI-augmented delivery practices — tooling depth, AI attribution, CI health, ticket work-mix, and spec coverage
severity: high
depends-on: [project-topology, ai-development-tooling, spec-driven-development]
---

# AI-SDLC Adoption

Orchestrates the full ADP measurement engine against the audited repository. Unlike other dimensions — which run deterministic detectors over source files — this dimension drives the collector and metric pipeline declared in `references/standards.toml` and emits a standard per-dimension JSON artifact carrying every ADP metric result.

**SKIP-not-fabricate:** a check SKIPs when none of its required data sources exist. A check never fabricates a value from prose or assumptions. MTTR is a normal tiered metric: it runs from git as a proxy (merge/revert/hotfix cadence) with `reliability_default = "not-reliable"` and note "git-proxy, true value may differ"; its reliability upgrades automatically when a real incident source artifact is present. No special-casing or manual skipping for MTTR.

## Before running checks — query-once setup

Run this setup once before executing any check below. All checks in this dimension read from the same shared collected directory.

1. Read the `project-topology` dimension artifact to determine which sources apply. Extract: `has_ci`, `has_tracker`, `has_incident_source`, `has_docs_connector`, `repo_path` (fall back to current working directory). Set `auditDate` to today's YYYY-MM-DD.

2. Create directory `context/audits/<date>/collected/`.

3. Run each applicable collector **once**, writing to that directory. Use the engine CLI path passed by the orchestrator (`<engine cli path>`):

```
node "<engine cli path>" collect git     <repoPath>  → context/audits/<date>/collected/git.json      # always
node "<engine cli path>" collect ci      <repoPath>  → context/audits/<date>/collected/ci.json       # if has_ci
node "<engine cli path>" collect tracker <repoPath>  → context/audits/<date>/collected/tracker.json  # if has_tracker
node "<engine cli path>" collect docs    <repoPath>  → context/audits/<date>/collected/docs.json     # if has_docs_connector
```

4. For each check below, run `node "<engine cli path>" metric <id> <repoPath> context/audits/<date>/collected` — the third argument is the pre-populated `collected/` directory (query-once path: no collector re-runs inside the metric command).

5. After all checks complete, compute dimension totals and emit `context/audits/<date>/ai-sdlc-adoption.json` following the schema in `output-format.md`. The `hint` field concatenates: `<definition> · <value-derivation> · <reliability tag (confidence)> · <source (year)> · <method>`.

## Checks

Checks ADP-01 through ADP-06 are all scored by one `tooling_depth` metric run — a single invocation scores codes 101–106, awarding each independently.

### ADP-01: Agent instruction file

- **What:** Repo has a non-trivial agent instruction file (CLAUDE.md / AGENTS.md / GEMINI.md / .cursorrules / .github/copilot-instructions.md or equivalent) providing AI agent context
- **How:** `node "<engine cli path>" metric tooling_depth <repoPath> context/audits/<date>/collected` — one run scores all six tooling checks
- **Pass (OK):** the shared metric run returns `status: "OK"` and scores code 101 as present
- **Skip:** metric returns `status: "SKIP"` — git source unavailable (rare)
- **Severity:** high
- **Category:** 101

### ADP-02: Agent skill files

- **What:** Repo defines agent skill files (e.g. `.claude/skills/*/SKILL.md` or equivalent for other AI coding tools)
- **How:** same single `tooling_depth` run as ADP-01
- **Pass (OK):** the shared metric run returns `status: "OK"` and scores code 102 as present
- **Skip:** metric returns `status: "SKIP"` — git source unavailable (rare)
- **Severity:** medium
- **Category:** 102

### ADP-03: Agent commands and rule files

- **What:** Repo defines custom commands or rule files for an agentic coding tool (e.g. `.claude/commands/`, `.cursor/rules/`, `.gemini/commands/`)
- **How:** same single `tooling_depth` run as ADP-01
- **Pass (OK):** the shared metric run returns `status: "OK"` and scores code 103 as present
- **Skip:** metric returns `status: "SKIP"` — git source unavailable (rare)
- **Severity:** medium
- **Category:** 103

### ADP-04: Agent lifecycle hooks

- **What:** Repo defines lifecycle hooks for an agentic coding tool (e.g. `.claude/hooks/`, `.kiro/hooks/`)
- **How:** same single `tooling_depth` run as ADP-01
- **Pass (OK):** the shared metric run returns `status: "OK"` and scores code 104 as present
- **Skip:** metric returns `status: "SKIP"` — git source unavailable (rare)
- **Severity:** medium
- **Category:** 104

### ADP-05: MCP server config

- **What:** Repo carries an MCP server config (`.mcp.json` or equivalent)
- **How:** same single `tooling_depth` run as ADP-01
- **Pass (OK):** the shared metric run returns `status: "OK"` and scores code 105 as present
- **Skip:** metric returns `status: "SKIP"` — git source unavailable (rare)
- **Severity:** medium
- **Category:** 105

### ADP-06: Spec-driven adoption signals

- **What:** Repo has spec-driven adoption signals: spec directories, spec-referencing hooks/scripts, or spec docs
- **How:** same single `tooling_depth` run as ADP-01
- **Pass (OK):** the shared metric run returns `status: "OK"` and scores code 106 as present
- **Skip:** metric returns `status: "SKIP"` — git source unavailable (rare)
- **Severity:** high
- **Category:** 106

### ADP-07: AI-attributed change share

- **What:** Share of commits or PRs carrying AI markers (Co-authored-by: trailer, agent label). Always a lower bound — true usage >= shown.
- **How:** `node "<engine cli path>" metric ai_attribution <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — AI attribution share computed
- **Skip:** metric returns `status: "SKIP"` — git source unavailable
- **Severity:** high
- **Category:** 901

### ADP-08: CI pass rate

- **What:** Default-branch CI pass rate over the lookback window; feature-branch failures excluded
- **How:** `node "<engine cli path>" metric ci_pass_rate <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — CI pass rate computed
- **Skip-When:** `has_ci` is false (CI source not detected or CI collector artifact absent)
- **Severity:** high
- **Category:** 1001

### ADP-09: Pipeline duration trend

- **What:** Feedback-loop speed: CI pipeline duration trend over the lookback window
- **How:** `node "<engine cli path>" metric pipeline_duration <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — pipeline duration trend computed
- **Skip-When:** `has_ci` is false
- **Severity:** medium
- **Category:** 1002

### ADP-10: Work-mix allocation

- **What:** Team-FTE share across Growth / KTLO / Support issue types (DX Core 4 FTE-allocation model; never money, never per-person)
- **How:** `node "<engine cli path>" metric work_mix_allocation <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — work-mix computed from tracker artifact
- **Skip-When:** `has_tracker` is false (no issue tracker source detected)
- **Severity:** medium
- **Category:** 1101

### ADP-11: Issue throughput

- **What:** Delivered-issue count and backlog burn-down rate per monthly bucket
- **How:** `node "<engine cli path>" metric issue_throughput <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — throughput computed from tracker artifact
- **Skip-When:** `has_tracker` is false
- **Severity:** medium
- **Category:** 1102

### ADP-12: Ticket sub-task split ratio

- **What:** Average number of direct sub-tasks per parent ticket; high averages signal AI-driven over-splitting that fragments work, raises coordination cost, and departs from INVEST "Small" right-sizing. Bands are AWOS heuristics (≤3 good, ≤6 watch, >6 concerning) — INVEST and DORA publish no numeric threshold.
- **How:** `node "<engine cli path>" metric ticket_subtask_split <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — at least one parent ticket with `subtask_count > 0` found in the tracker artifact
- **Skip-When:** `has_tracker` is false, or tracker artifact has `available=false`, or no ticket in the window carries a numeric `subtask_count > 0`
- **Severity:** medium
- **Category:** 1104

### ADP-13: Ticket description quality

- **What:** Share of tickets with a non-trivial description (≥50 characters) AND acceptance criteria; thin tickets ("fix bug") starve both humans and AI agents of context needed to understand scope, intent, and done-criteria. A ticket counts as well-described only when both signals are present. The 50-char threshold is an AWOS heuristic — Agile Alliance's Definition of Ready specifies descriptive acceptance criteria but publishes no numeric character-count threshold. Size/structure signals only; no raw description text is stored.
- **How:** `node "<engine cli path>" metric ticket_description_quality <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — at least one ticket with a numeric `description_length` found in the tracker artifact
- **Skip-When:** `has_tracker` is false, or tracker artifact has `available=false`, or no ticket in the window carries a numeric `description_length`
- **Severity:** medium
- **Category:** 1105

### ADP-14: External spec and doc coverage

- **What:** External spec/doc coverage and freshness in Confluence, Coda, Notion, or equivalent; strengthens the ADP-06 spec signal
- **How:** `node "<engine cli path>" metric external_spec_coverage <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — external spec coverage computed
- **Skip-When:** `has_docs_connector` is false (no docs source detected)
- **Severity:** medium
- **Category:** 1201

### ADP-15: Onboarding ease (DX Core 4 time-to-10th-PR proxy)

- **What:** Onboarding enabler presence as a filesystem-derived proxy for the DX Core 4 "Time to 10th PR" outcome. Four boolean signals: (1) README contains setup/install/getting-started/usage/quickstart heading or a recognizable bootstrap command; (2) agent context file (CLAUDE.md/AGENTS.md); (3) .env example file; (4) one-command bootstrap file (Makefile, justfile, Taskfile, docker-compose.yml, setup.sh, or package.json with setup/bootstrap/dev script). value = present_count/4. Bands are AWOS heuristics. Ramp-time not measured (see lead_time_for_change/review_rework).
- **How:** `node "<engine cli path>" metric onboarding_ease <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — always OK when repoPath exists (0 enablers → value 0 / band "concerning", not SKIP)
- **Skip:** metric returns `status: "SKIP"` — repoPath does not exist
- **Severity:** medium
- **Category:** 1501
