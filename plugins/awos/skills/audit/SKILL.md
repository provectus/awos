---
name: audit
description: >-
  Run a comprehensive code quality audit across extensible dimensions. Use when
  asked to "audit the code", "run a code audit", "check code quality", "audit
  this project", or when the /awos:audit command is invoked. Discovers dimension
  files automatically — drop a new .md in dimensions/ to extend. Each dimension
  runs in its own context window for thorough analysis.
disable-model-invocation: true
argument-hint: "[dimension-name] or blank for full audit"
---

# Code Audit — Orchestrator

You are the audit orchestrator. Your job is to coordinate dimension-specific auditors, each running in their own context window, and compile results into a final report.

## Step 1 — Discover Dimensions

1. Read all `*.md` files from the `dimensions/` directory (relative to this SKILL.md)
2. Parse YAML frontmatter from each file to extract: `name`, `title`, `severity`, `depends-on`
3. If `$ARGUMENTS` is provided and non-empty, filter to only the dimension whose `name` matches `$ARGUMENTS`. If no match, list available dimensions and stop.

## Step 2 — Build Dependency DAG

1. Build a dependency graph from the `depends-on` fields
2. Group dimensions into execution phases:
   - **Phase 1:** Dimensions with no `depends-on` (roots of the DAG)
   - **Phase N:** Dimensions whose `depends-on` are all completed in prior phases
3. Phases are computed dynamically — adding or removing dimension files automatically updates the DAG

## Step 3 — Prepare Artifacts Directory

```
context/audits/YYYY-MM-DD/
```

Create this directory. If it already exists, results will be overwritten.

## Step 4 — Check for Previous Audit

1. Scan `context/audits/` for previous audit directories (date-named folders other than today)
2. If a previous audit exists, read its `report.md` to extract per-dimension scores for delta comparison later

## Step 5 — Execute Dimensions

For each execution phase, launch all dimensions in the phase **in parallel** using the Task tool with the `dimension-auditor` agent.

For each dimension, provide the agent with:

1. **The full dimension file content** (read from `dimensions/{name}.md`)
2. **The output format** (read from `output-format.md` in this skill directory — the "Per-Dimension Artifact Format" section)
3. **The scoring rules** (read from `scoring.md` in this skill directory)
4. **The output path:** `context/audits/YYYY-MM-DD/{name}.md`
5. **Topology summary** (for Phase 2+ dimensions): read from `context/audits/YYYY-MM-DD/project-topology.md` — the "Topology Summary" section written by the topology auditor

Wait for all dimensions in a phase to complete before starting the next phase.

### Important

- Launch each dimension as a **separate Task** with `subagent_type: "dimension-auditor"` so each gets its own context window
- Within a phase, launch all Tasks in a **single message** (parallel execution)
- The dimension-auditor agent is read-only — it will not modify project files

## Step 6 — Compile Report

After all dimensions complete:

1. Read all per-dimension artifacts from `context/audits/YYYY-MM-DD/`
2. Compute the overall score: average of all dimension percentages (using the scoring algorithm from `scoring.md`)
3. If a previous audit was found in Step 4, compute per-dimension deltas
4. Compile the full report using the report template from `output-format.md`
5. Write the report to `context/audits/YYYY-MM-DD/report.md`
6. Write prioritized recommendations to `context/audits/YYYY-MM-DD/recommendations.md`
7. Present the full report to the user

## Step 7 — What's Next?

After presenting the report, check the project context and offer next steps using `AskUserQuestion` with `multiSelect: true`.

### Detect context

- **AWOS installed:** `.awos/commands/` directory exists
- **Roadmap exists:** `context/product/roadmap.md` file exists

### Build options

**Always include:**
- "Generate HTML report" — create a standalone HTML version of the audit report

**If AWOS installed + roadmap exists, also include:**
- "Update roadmap with audit findings" — incorporate recommendations into the existing product roadmap

**If AWOS installed + no roadmap, also include:**
- "Create a roadmap informed by audit findings" — start a new roadmap using audit results as input

**If AWOS is NOT installed**, append this note after the question:
> Tip: install AWOS (`npx @provectusinc/awos`) — the best way to make your repo AI-friendly and act on these findings.

### Execute selected options

- **HTML report:** Read the HTML report specification from `report-template.md` in this skill directory. Generate `context/audits/YYYY-MM-DD/report.html` — a single self-contained HTML file (inline CSS, no external dependencies). Include: overall score/grade, per-dimension summary table, detailed checklists, recommendations, issue-only filter toggle.
- **Roadmap (update or create):** Tell the user to run `/awos:roadmap` and reference the audit recommendations at `context/audits/YYYY-MM-DD/recommendations.md` as input.

## Adding New Dimensions

Drop a `.md` file in `dimensions/` with this structure:

```markdown
---
name: my-dimension
title: My Dimension
description: What this dimension measures
severity: high
depends-on: [project-topology]
---

# My Dimension

Brief description.

## Checks

### CHECK-01: Short name

- **What:** What to verify
- **How:** Glob/Grep/Read instructions to evaluate
- **Pass:** Criteria for PASS
- **Fail:** Criteria for FAIL
- **Warn:** (optional) Partial compliance
- **Skip-When:** (optional) Condition to auto-skip
- **Severity:** critical | high | medium | low
```

### Frontmatter Fields

| Field        | Required | Description                                                               |
| ------------ | -------- | ------------------------------------------------------------------------- |
| `name`       | yes      | Unique identifier, used for CLI filtering (`/awos:audit my-dimension`)    |
| `title`      | yes      | Human-readable display name                                               |
| `description`| yes      | One-line purpose                                                          |
| `severity`   | yes      | Default severity for all checks. Individual checks can override.          |
| `depends-on` | no       | Dimension `name`s that must complete first. Omit if no dependencies.      |
