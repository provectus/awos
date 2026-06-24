---
name: ai-readiness-audit
description: >-
  Run a comprehensive code quality audit across extensible dimensions. Use when
  asked to "audit the code", "run a code audit", "check code quality", "audit
  this project", or when the /awos:ai-readiness-audit command is invoked. Discovers dimension
  files automatically — drop a new .md in dimensions/ to extend. Each dimension
  runs in its own context window for thorough analysis.
disable-model-invocation: true
argument-hint: '[dimension-name] or blank for full audit'
---

# Code Audit — Orchestrator

You are the audit orchestrator. Your job is to coordinate dimension-specific auditors, each running in their own context window, and compile results into a final report.

## Step 0 — Discover Audit Scope (Multi-Repo)

Before discovering dimensions, resolve the repositories that the audit will cover. Follow the discover-first flow defined in `references/data-sources.md`.

### Phase 0a — Auto-discover repositories

Detect the audit scope using three methods (per `data-sources.md`):

1. **Current repo** — always included.
2. **Monorepo build roots** — packages/apps declared in workspace configs (`pnpm-workspace.yaml`, `turbo.json`, etc.; see project-topology TOPO-01).
3. **Git submodules** — paths declared in `.gitmodules`.
4. **Symlinked source directories** — filesystem symlinks inside the repo that point outside the repo root (the AWOS-linked-into-services pattern; see `data-sources.md` "Multi-repo linking").

Also probe connector availability per repo: code host (`gh`/`glab` on PATH or GitHub/GitLab MCP server), CI config files, issue tracker references, docs connectors (Confluence/Coda MCP).

If a `context/audits/sources.toml` file exists, read it — its `[[repos]]` and `[sources]` sections override or extend auto-detection.

### Phase 0b — Confirm scope with a single AskUserQuestion

After auto-discovery completes, present the detected repo set and connectors to the user with a **single `AskUserQuestion`** call. Include:

- The auto-discovered repos with their detected connectors.
- An option to supply a `sources.toml` path or a flat list of additional repo links.
- An option to proceed with the auto-discovered set as-is (the headless default).

**Headless default:** when `AskUserQuestion` receives its default answer (no interactive input, e.g. in CI or `--output-format stream-json` mode), proceed using only the auto-discovered repos and connectors — no interactive entry required. This means the audit is always runnable headlessly without any prompting.

Never prompt mid-run after this step.

### Phase 0c — Determine audit mode

- **Single-repo mode** (one repo detected): proceed directly to Step 1 for that repo.
- **Org mode** (multiple repos detected): fan out the per-repo audit (Steps 1–6) across all repos in parallel. Each repo runs the normal per-dimension flow including `ai-sdlc-adoption`. Collect the per-repo audit result JSONs into `context/audits/YYYY-MM-DD/per-repo/`. After all per-repo audits complete, proceed to the org rollup in Step 6 (org branch).

Contributor counts are always reported in aggregate (never per-person). No money, no PII.

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

### Progress & ETA

Before launching any dimensions, compute the total work count:

```
total = number of dimensions to run (after any $ARGUMENTS filter)
```

Derive this from the dimension set discovered in Step 1 — it equals the number of dimension files that will actually execute (not the raw count in `references/standards.toml`, which holds category records, not dimension files). For a full audit this is typically the count of all `.md` files in `dimensions/`. Record a wall-clock start time (`start_ms = Date.now()`).

The elapsed timer runs in wall-clock seconds **excluding time spent waiting on the user**. Pause and subtract the timer across every `AskUserQuestion` call: capture the timestamp before presenting the question and add `(Date.now() - pause_start) / 1000` to a running `wait_seconds` total. The elapsed you pass to `progress` is always `(Date.now() - start_ms) / 1000 - wait_seconds`.

After each dimension (or phase, when phases complete as a batch) finishes, emit a progress line:

```
node "${CLAUDE_SKILL_DIR}/dist/cli.js" progress <elapsed_seconds> <done> <total>
```

The output is a JSON object with `pct` (fraction 0–1), `eta_seconds`, and `elapsed_seconds`. Print it to the user as a single readable line, for example:

```
[Audit] 4/13 dimensions complete — 31% — ETA ~3 min remaining
```

ETA is a wall-clock UX estimate, not a scored or deterministic metric. When `done === 0` the ETA is not yet available; when `done === total` it reports 0.

**Headless mode (`--output-format stream-json`):** emit the same progress JSON as a stream-json line after each phase completes, so CI pipelines and automation can track progress without a terminal. If stream access is not available, an equivalent artifact-count fallback is always observable: count the `.json` files written to `context/audits/YYYY-MM-DD/` and compare against `total` — each completed dimension writes exactly one `.json` artifact, so `ls context/audits/YYYY-MM-DD/*.json | wc -l` gives `done`.

Before launching any dimension agents, resolve the absolute engine path once so it can be passed to each agent (agents do not inherit `${CLAUDE_SKILL_DIR}`):

```
ENGINE="${CLAUDE_SKILL_DIR}/dist/cli.js"
```

For each execution phase, launch all dimensions in the phase **in parallel** using the Agent tool with the `dimension-auditor` agent.

For each dimension, provide the agent with:

1. **The full dimension file content** (read from `dimensions/{name}.md`)
2. **The output format** (read from `output-format.md` in this skill directory — the "Per-Dimension Artifact Format" section)
3. **The scoring rules** (read from `scoring.md` in this skill directory)
4. **The output path:** `context/audits/YYYY-MM-DD/{name}.json`
5. **The standards file:** `references/standards.toml` (and the user override path from `sources.toml`, if any) — the dimension-auditor reads category weights and period parameters from this file
6. **Engine CLI path:** the absolute path `$ENGINE` resolved above — tell the agent to invoke the engine as `node "<engine cli path>"` (e.g. `node "/path/to/dist/cli.js" standards ...`). The agent must use this path for all engine calls (`standards`, `detect`, `metric`, `collect`) — never a bare `node dist/cli.js`.
7. **Topology summary** (for Phase 2+ dimensions): read from `context/audits/YYYY-MM-DD/project-topology.md` — the "Topology Summary" section written by the topology auditor

Wait for all dimensions in a phase to complete before starting the next phase.

### Important

- Launch each dimension as a separate Agent call with `subagent_type: "dimension-auditor"` so each gets its own context window
- Within a phase, launch all Agent calls in a single message (parallel execution)
- The dimension-auditor agent does not modify project source files; its only write is the per-dimension artifact at the path you provide

## Step 6 — Compile Report

After all dimensions complete:

1. Read all per-dimension JSON artifacts from `context/audits/YYYY-MM-DD/<dimension>.json`.
2. Aggregate them into a single `context/audits/YYYY-MM-DD/audit.json` file with this top-level structure:
   - `date` — the audit date (YYYY-MM-DD)
   - `project` — the repo name or directory being audited
   - `audit_total` — Σ awarded category weights across all dimensions (uncapped)
   - `coverage` — total awarded weight ÷ total applicable-defined weight across all dimensions (the audit-level coverage ratio, labeled "relative to today's standard" from `references/standards.toml`). Do not compute a grade or a 0–100 score.
   - `dimensions` — array of the per-dimension JSON objects (one per dimension file)
3. If a previous audit was found in Step 4, add per-dimension deltas (point and coverage-ratio deltas, not grade deltas) inside each dimension object.

**The orchestrator never hand-writes `report.md` or `report.html`** — those files are always produced by the renderer. This is the data-loss guarantee: JSON is the source of truth; markdown and HTML are derived outputs.

4. Render the report from the JSON source of truth — **always produce BOTH `report.md` and the self-contained `report.html`** here. The HTML is the headline deliverable; it is generated unconditionally in this step, never gated on Step 7 or on interactivity, so headless runs always produce it:

   ```
   node "${CLAUDE_SKILL_DIR}/dist/cli.js" render context/audits/YYYY-MM-DD/audit.json --format md   > context/audits/YYYY-MM-DD/report.md
   node "${CLAUDE_SKILL_DIR}/dist/cli.js" render context/audits/YYYY-MM-DD/audit.json --format html > context/audits/YYYY-MM-DD/report.html
   ```

5. Write prioritized recommendations to `context/audits/YYYY-MM-DD/recommendations.md`.
6. Present the full report to the user by reading and displaying `context/audits/YYYY-MM-DD/report.md`.

### Step 6 org branch — Portfolio rollup (org mode only)

When the audit ran in org mode (multiple repos, per `references/data-sources.md`), after all per-repo audits are complete, produce the org-level portfolio summary:

1. Each per-repo audit must have written a result JSON to `context/audits/YYYY-MM-DD/per-repo/<repo-name>.json`. Each file must include `repo`, `contributors` (aggregate count, no PII), `awarded_weight` (Σ awarded category weights from that repo), `sources_reachable` (list of collector sources that returned `available=true`), and `has_ai_tooling` (boolean).

2. Invoke the org rollup via the CLI:

   ```
   node "${CLAUDE_SKILL_DIR}/dist/cli.js" rollup context/audits/YYYY-MM-DD/per-repo/
   ```

   This computes **exactly three (≤3) portfolio metrics** — never the full per-repo metric set:
   - **`org_ai_tooling_coverage`** — fraction of portfolio repos with any AI tooling present (contributor-weighted).
   - **`org_capability_score`** — average awarded category-weight score across portfolio repos (Σ weight / repo count).
   - **`org_measurement_coverage`** — fraction of portfolio repos with ≥1 reachable data-source collector (contributor-weighted).

3. Build the org audit JSON by merging the rollup output with a minimal audit envelope and write it to:

   ```
   context/audits/YYYY-MM-DD/org-portfolio.json
   ```

   The JSON structure must contain `portfolio_metrics`, `per_repo`, `date`, `project`, `audit_total` (average awarded weight across repos), `coverage` (average coverage ratio), and `dimensions` (aggregated dimension data from all per-repo audits). This shape satisfies the renderer's `AuditJson` schema so the renderer can produce both org markdown and HTML from this single file.

4. Render the org report from the org audit JSON — **always produce BOTH `report.md` and `report.html`** (unconditional, never gated on Step 7):

   ```
   node "${CLAUDE_SKILL_DIR}/dist/cli.js" render context/audits/YYYY-MM-DD/org-portfolio.json --format md   > context/audits/YYYY-MM-DD/report.md
   node "${CLAUDE_SKILL_DIR}/dist/cli.js" render context/audits/YYYY-MM-DD/org-portfolio.json --format html > context/audits/YYYY-MM-DD/report.html
   ```

5. Present the three portfolio metrics to the user with a brief interpretation:
   - AI-tooling coverage across the portfolio (fraction of repos, contributor-weighted).
   - Portfolio capability score (average awarded weight, reflects depth of AI-SDLC adoption).
   - Measurement coverage (fraction of repos with reachable data sources).
     Then present the per-repo breakdown table from `per_repo`.

Contributor counts in the org report are always aggregate — no per-person data. No money figures appear in any org output.

## Step 7 — What's Next?

After presenting the report, check the project context and offer next steps using `AskUserQuestion` with `multiSelect: true`.

### Headless mode (no interactive input)

When `AskUserQuestion` receives its default answer (non-interactive, e.g. CI or `--output-format stream-json`), automatically generate the HTML report — never skip it:

```
node "${CLAUDE_SKILL_DIR}/dist/cli.js" render context/audits/YYYY-MM-DD/audit.json --format html > context/audits/YYYY-MM-DD/report.html
```

`report.html` is always produced in headless runs. The orchestrator never hand-writes it; the renderer produces it from `audit.json`.

### Interactive mode

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

- **HTML report:** Render from the JSON source of truth using the CLI: `node "${CLAUDE_SKILL_DIR}/dist/cli.js" render context/audits/YYYY-MM-DD/audit.json --format html > context/audits/YYYY-MM-DD/report.html`. The renderer reads the HTML report specification from `report-template.md`. The output is a single self-contained HTML file (inline CSS, no external dependencies) including: audit total (points) + coverage ratio, per-dimension summary table, detailed checklists, recommendations, issue-only filter toggle.
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

| Field         | Required | Description                                                                         |
| ------------- | -------- | ----------------------------------------------------------------------------------- |
| `name`        | yes      | Unique identifier, used for CLI filtering (`/awos:ai-readiness-audit my-dimension`) |
| `title`       | yes      | Human-readable display name                                                         |
| `description` | yes      | One-line purpose                                                                    |
| `severity`    | yes      | Default severity for all checks. Individual checks can override.                    |
| `depends-on`  | no       | Dimension `name`s that must complete first. Omit if no dependencies.                |
