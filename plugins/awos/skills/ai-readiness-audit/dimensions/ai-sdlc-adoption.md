---
name: ai-sdlc-adoption
title: AI-SDLC Adoption
description: Measures the team's quantitative adoption of AI-augmented delivery practices across tooling depth, flow metrics, CI health, work-mix, and spec coverage
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

3. Run each applicable collector **once**, writing to that directory:

```
node dist/cli.js collect git     <repoPath>  → context/audits/<date>/collected/git.json      # always
node dist/cli.js collect ci      <repoPath>  → context/audits/<date>/collected/ci.json       # if has_ci
node dist/cli.js collect tracker <repoPath>  → context/audits/<date>/collected/tracker.json  # if has_tracker
node dist/cli.js collect docs    <repoPath>  → context/audits/<date>/collected/docs.json     # if has_docs_connector
```

4. For each check below, run `node dist/cli.js metric <id> <repoPath> context/audits/<date>/collected` — the third argument is the pre-populated `collected/` directory (query-once path: no collector re-runs inside the metric command).

5. After all checks complete, compute dimension totals and emit `context/audits/<date>/ai-sdlc-adoption.json` following the schema in `output-format.md`. The `hint` field concatenates: `<definition> · <value-derivation> · <reliability tag (confidence)> · <source (year)> · <method>`.

## Checks

### ADP-G1: AI tooling depth and breadth

- **What:** Repository carries non-trivial AI agent configuration — CLAUDE.md/AGENTS.md, skills, commands, hooks, MCP config, and spec-driven adoption signals
- **How:** `node dist/cli.js metric adp_g1_tooling_depth <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — at least one tooling category was detected
- **Skip:** metric returns `status: "SKIP"` — git source unavailable (rare)
- **Severity:** high
- **Category:** 101, 102, 103, 104, 105, 106

### ADP-G2: Active monthly contributors

- **What:** Distinct commit-author count per trailing 30-day bucket (aggregate only, no per-person data)
- **How:** `node dist/cli.js metric adp_g2_contributors <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — contributor count computed from git log
- **Skip:** metric returns `status: "SKIP"` — git source unavailable
- **Severity:** medium
- **Category:** 201

### ADP-G3: Deployment / merge frequency

- **What:** Merges into the default branch per week (DORA deployment frequency proxy); result is DORA-banded (elite/high/medium/low)
- **How:** `node dist/cli.js metric adp_g3_deploy_frequency <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — merge frequency computed and banded
- **Skip:** metric returns `status: "SKIP"` — git source unavailable
- **Severity:** medium
- **Category:** 301

### ADP-G4: Lead time for change

- **What:** Median time from first commit on a branch to its merge into the default branch; DORA-banded
- **How:** `node dist/cli.js metric adp_g4_lead_time <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — lead time computed and banded
- **Skip:** metric returns `status: "SKIP"` — git source unavailable or no merge records found
- **Severity:** medium
- **Category:** 401

### ADP-G5: PR cycle time

- **What:** Time from PR open to merge; proxied from merge-record timestamps when no code-host connector is available
- **How:** `node dist/cli.js metric adp_g5_pr_cycle_time <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — cycle time computed
- **Skip:** metric returns `status: "SKIP"` — git source unavailable
- **Severity:** medium
- **Category:** 501

### ADP-G6: Code churn and rework

- **What:** Insertions+deletions trend and rework-hotspot file count over the lookback window
- **How:** `node dist/cli.js metric adp_g6_churn <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — churn trend computed
- **Skip:** metric returns `status: "SKIP"` — git source unavailable
- **Severity:** low
- **Category:** 601

### ADP-G7: Change failure rate

- **What:** Share of default-branch merges followed within N days by a revert or hotfix commit; DORA-banded
- **How:** `node dist/cli.js metric adp_g7_change_fail_rate <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — change failure rate computed and banded
- **Skip:** metric returns `status: "SKIP"` — git source unavailable
- **Severity:** high
- **Category:** 701

### ADP-G8: Review rework cycle

- **What:** Review rounds and time-to-resolve review threads per PR; proxied from post-open commits when no code-host data is available
- **How:** `node dist/cli.js metric adp_g8_review_rework <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — review rework computed
- **Skip:** metric returns `status: "SKIP"` — git source unavailable
- **Severity:** low
- **Category:** 801

### ADP-G9: AI-attributed change share

- **What:** Share of commits or PRs carrying AI markers (Co-authored-by: trailer, agent label). Always a lower bound — true usage >= shown.
- **How:** `node dist/cli.js metric adp_g9_ai_attribution <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — AI attribution share computed
- **Skip:** metric returns `status: "SKIP"` — git source unavailable
- **Severity:** high
- **Category:** 901

### ADP-C1: CI pass rate

- **What:** Default-branch CI pass rate over the lookback window; feature-branch failures excluded
- **How:** `node dist/cli.js metric adp_c1_ci_pass_rate <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — CI pass rate computed
- **Skip-When:** `has_ci` is false (CI source not detected or CI collector artifact absent)
- **Severity:** high
- **Category:** 1001

### ADP-C2: Pipeline duration trend

- **What:** Feedback-loop speed: CI pipeline duration trend over the lookback window
- **How:** `node dist/cli.js metric adp_c2_pipeline_duration <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — pipeline duration trend computed
- **Skip-When:** `has_ci` is false
- **Severity:** medium
- **Category:** 1002

### ADP-D1: External spec and doc coverage

- **What:** External spec/doc coverage and freshness in Confluence, Coda, Notion, or equivalent; strengthens the ADP-G1 spec signal
- **How:** `node dist/cli.js metric adp_d1_spec_coverage <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — external spec coverage computed
- **Skip-When:** `has_docs_connector` is false (no docs source detected)
- **Severity:** medium
- **Category:** 1201

### ADP-I1: Work-mix allocation

- **What:** Team-FTE share across Growth / KTLO / Support issue types (Jellyfish FTE-allocation model; never money, never per-person)
- **How:** `node dist/cli.js metric adp_i1_work_mix <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — work-mix computed from tracker artifact
- **Skip-When:** `has_tracker` is false (no issue tracker source detected)
- **Severity:** medium
- **Category:** 1101

### ADP-I2: Issue throughput

- **What:** Delivered-issue count and backlog burn-down rate per monthly bucket
- **How:** `node dist/cli.js metric adp_i2_throughput <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — throughput computed from tracker artifact
- **Skip-When:** `has_tracker` is false
- **Severity:** medium
- **Category:** 1102

### ADP-I3: Mean time to recovery

- **What:** Mean time to recovery from incidents; computed from git as a proxy by default (merge/revert/hotfix cadence), upgraded when a real incident source is present in the tracker artifact. Always included — never omitted from the artifact. SKIP only if even git is unavailable.
- **How:** `node dist/cli.js metric adp_i3_mttr <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — MTTR computed (git-proxy or real source)
- **Skip:** metric returns `status: "SKIP"` — git source unavailable (the only valid SKIP condition)
- **Severity:** high
- **Category:** 1103

### ADP-G10: Cyclomatic complexity

- **What:** Average and maximum McCabe cyclomatic complexity (CCN) per function across the repository, computed by parsing source files with tree-sitter grammars. Bands: elite ≤5, high ≤10, medium ≤15, low >15.
- **How:** `node dist/cli.js metric adp_g10_complexity <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — complexity computed for at least one function in a supported language (JS/TS/TSX/JSX/Python/Go/Java/Ruby/C#/C/C++/Rust/PHP/Kotlin)
- **Skip:** metric returns `status: "SKIP"` — no source files in supported languages found
- **Severity:** medium
- **Category:** 1301

### ADP-G11: Codebase scale (LOC)

- **What:** Lines of code (non-blank) by language across the repository, excluding generated/vendor directories. Provides scale context for other metrics.
- **How:** `node dist/cli.js metric adp_g11_scale <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — LOC counted for at least one recognized source file
- **Skip:** metric returns `status: "SKIP"` — no recognized source files found
- **Severity:** low
- **Category:** 1302

### ADP-G12: Dependency manifest counts

- **What:** Count of direct dependencies declared in manifest files (package.json, pyproject.toml, go.mod, Cargo.toml, requirements.txt) up to three directory levels deep.
- **How:** `node dist/cli.js metric adp_g12_deps <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — at least one manifest found
- **Skip:** metric returns `status: "SKIP"` — no recognised manifest file found
- **Severity:** low
- **Category:** 1303
