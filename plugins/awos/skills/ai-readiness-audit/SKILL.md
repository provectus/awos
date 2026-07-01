---
name: ai-readiness-audit
description: >-
  Command-invoked AI-SDLC readiness audit. Runs the deterministic scoring
  engine across all dimensions in one pass and compiles a report. Invoked by
  the /awos:ai-readiness-audit command; not auto-triggered. Dimensions are
  discovered automatically from dimensions/ — drop a new .md to extend.
disable-model-invocation: true
argument-hint: '[dimension] — omit for a full audit'
---

# Code Audit — Orchestrator

You run the AI-SDLC readiness audit. Deterministic scoring is a single engine command — `audit-core` (Step 5) — which reads `references/standards.toml` and every `dimensions/*.md`, evaluates the project-topology flags, and scores every category across all dimensions in one pass. Your job is to run that command, fill the small slice the engine cannot compute (the 5 judgment checks and the tracker/docs connector metrics), and render the report from the resulting JSON.

There is no per-dimension auditor and no subagent fan-out. You do not read the codebase to hand-write findings, and you do not emit A–F or 0–100 grades — scoring is additive weighted points produced by the engine. Auditing here is running one command and filling one gap.

## Load-time pre-run — the engine has already scored the current repo

The deterministic pass runs automatically as this skill loads, so its result is present before you reason about anything. The output below is the real weighted score for the current repo; the artifacts (`audit.json`, per-dimension `<dimension>.json`, `collected/`) already exist under `context/audits/<today>/`. Treat scoring as done: do not re-derive it, do not spawn per-dimension work, do not grade by hand. Proceed to Step 0 (confirm scope), then Step 6 (fill the LLM-only gap and render). In org mode the repos are scored the same way — one `audit-core` call each into `per-repo/<repo>/`, dispatched together in the Step 6 org branch.

!`command -v node >/dev/null 2>&1 && { R="${CLAUDE_PROJECT_DIR}"; [ -n "$R" ] || R="$(pwd)"; D="$(date +%F)"; echo "[audit-core] one-pass deterministic engine → context/audits/$D (current repo: $R)"; node "${CLAUDE_SKILL_DIR}/dist/cli.js" audit-core "$R" "$R/context/audits/$D" 2>&1; } || echo "[audit-core] NOT run (no node on PATH, or engine errored). Deterministic scoring is the single audit-core command in Step 5 — run it before proceeding; never fan out per-dimension auditors or hand-write scores."`

## Step 0 — Discover Audit Scope (Multi-Repo)

Before discovering dimensions, resolve the repositories that the audit will cover. Follow the discover-first flow defined in `references/data-sources.md`.

### Phase 0a — Resolve the audit boundary

The audit boundary is always the target folder or a GitHub org — never a manifest file. Resolve it from what the skill is pointed at (per `data-sources.md`):

1. **A git repo** (target folder has `.git`) → **single-repo mode** over that repo. A monorepo is this case — one repo, audited whole.
2. **A non-git folder** → **org mode**. Enumerate every immediate top-level subdirectory that is a git repo (has `.git`) and audit each one. List any top-level subdirectories skipped for not being git repos so the scope is transparent.
3. **A GitHub org name** → **org mode** over the org's repos, enumerated with `gh repo list <org>` (or the GitHub MCP if present).

Also probe connector availability per repo: code host (`gh`/`glab` on PATH or GitHub/GitLab MCP server), CI config files, issue tracker references, docs connectors (Confluence/Coda MCP). Connectors are auto-detected per run — there is no config file to read.

**Preflight:** the engine needs `node` on PATH (checked in Step 5); GitHub-org enumeration additionally needs `gh` on PATH (or the GitHub MCP). If a needed tool is absent, tell the user what to install rather than silently narrowing scope.

### Phase 0b — Confirm scope with a single AskUserQuestion

After discovery completes, present the resolved boundary to the user with a **single `AskUserQuestion`** call. Include:

- The resolved repo set with each repo's detected connectors — in org mode, also the non-git subdirectories that were skipped.
- An option to proceed with the auto-discovered set as-is (the headless default).

**Headless default:** when `AskUserQuestion` receives its default answer (no interactive input, e.g. in CI or `--output-format stream-json` mode), proceed using only the auto-discovered repos and connectors — no interactive entry required. This means the audit is always runnable headlessly without any prompting.

Never prompt mid-run after this step.

### Phase 0c — Determine audit mode

- **Single-repo mode** (one git repo): proceed directly to Step 1 for that repo.
- **Org mode** (a non-git folder of repos, or a GitHub org): the per-repo audits and the portfolio rollup are all run in the **Step 6 org branch** — that is the single place org fan-out happens. Do not dispatch per-repo work here; just carry the resolved repo list forward.

Contributor counts are always reported in aggregate (never per-person). No money, no PII.

Dispatch this discovery work with a fast model (Haiku) — it is mechanical file/PATH probing.

## Step 1 — Dimensions are the engine's job, not yours

The set of dimensions, every category in them, the topology flags that gate them, and the order they run in **all live inside the `audit-core` command** (Step 5). It reads `references/standards.toml` and the `dimensions/*.md` files itself, evaluates project-topology first, and scores every dimension in one deterministic pass.

So you do **not**: enumerate the dimension files, parse `depends-on`, build a dependency DAG, group work into "Phase 1 / Phase 2", or spawn a subagent per dimension. There is no per-dimension auditor. Auditing a codebase here means **running one command** (Step 5) and then filling a small gap (Step 6) — it does not mean reading the repo and writing findings by hand.

If `$ARGUMENTS` names a single dimension, still run the full `audit-core` pass (it is fast and topology-gated) and present only that dimension's section. If `$ARGUMENTS` matches no dimension, list the available dimensions and stop.

## Step 3 — Prepare Artifacts Directory

```
context/audits/YYYY-MM-DD/
```

`audit-core` (Step 5) creates this directory. If it already exists, results are overwritten.

## Step 4 — Check for Previous Audit

1. Scan `context/audits/` for previous audit directories (date-named folders other than today)
2. If a previous audit exists, read its `report.md` to extract per-dimension scores for delta comparison later

## Step 5 — Compute Deterministic Scores (one engine pass)

All deterministic scoring — every `detected` and `computed` category across all dimensions, plus the project-topology flags that gate them — runs in a single engine command. There is **no per-dimension subagent fan-out**: delegating ~100 engine calls across many subagents is exactly what an unsupervised run drops, so the engine does the whole deterministic pass itself, in one process, in seconds.

**Engine preflight:** confirm a `node` runtime is on PATH (`command -v node`). If `node` is absent, stop and tell the user to install Node — the audit cannot compute deterministic metrics without it. The bundle runs under any `node` on PATH.

The load-time pre-run already executed this pass for the current repo, so its artifacts exist before you get here. Re-run the command below only if `context/audits/YYYY-MM-DD/audit.json` is missing, or once per additional repo in org mode. It creates the artifacts directory and writes every `context/audits/YYYY-MM-DD/<dimension>.json`, the aggregated `context/audits/YYYY-MM-DD/audit.json`, and the `collected/<source>.json` artifacts:

```bash
node "${CLAUDE_SKILL_DIR}/dist/cli.js" audit-core "<repoPath>" "context/audits/YYYY-MM-DD"
```

It prints a one-line summary (`audit_total`, counts of `detected`/`computed`/`judgment_pending`/`skipped`, `duration_ms`). Two slices are deliberately left for Step 6 — and **only** these two:

- the 5 `judgment` checks, emitted with `status: "PENDING_JUDGMENT"`;
- the tracker/docs **connector** metrics, emitted `SKIP` when no connector is reachable.

Every other check is final and engine-computed. Do not re-score, re-grade, or "verify" a `detected`/`computed` check by hand — the detector verdict is authoritative.

### Progress & ETA

Report coarse progress for the user across the run. The deterministic Step 5 pass is the bulk of the scoring and finishes in seconds; Step 6's judgment + narrative authoring is the longer tail. Emit progress with the bundled helper:

```bash
node "${CLAUDE_SKILL_DIR}/dist/cli.js" progress <elapsed_seconds> <done> <total>
```

It returns `pct` (fraction 0–1 complete) and `eta_seconds`; print a single readable line such as `[Audit] scoring complete — 70% — ETA ~1 min remaining`. ETA is a wall-clock UX estimate, not a scored or deterministic metric. Exclude time spent waiting on the user from the elapsed timer — pause it across every `AskUserQuestion` call (Step 0 scope confirmation, Step 7 next-steps) and subtract that wait before passing `elapsed_seconds`. In headless mode (`--output-format stream-json`) emit the same JSON as a stream line; the artifact-count fallback is always observable too (`ls context/audits/YYYY-MM-DD/*.json | wc -l`).

## Step 6 — Patch the LLM-only slice, then render

Use a mid-tier model (Sonnet) for the judgment checks and narrative authoring — moderate reasoning, single pass.

`audit.json` already holds the full deterministic result. Fill only what the engine cannot, then render. Never re-score a `detected`/`computed` check, and never hand-write `report.md`/`report.html`.

**Keep the engine invocation count minimal.** Each engine call is a separate model turn, and in single-repo mode wall time is dominated by the number of serial turns, not by engine compute (the deterministic pass is a couple of seconds). The whole flow needs only the load-time `audit-core` inject already done, then **one** `enrich`, **one** `aggregate`, and **one** `render` — do not spawn a `metric <id>` per connector, do not re-run `audit-core`, and do not loop `aggregate`. The large wall-time wins come from org-mode fan-out (repos audited concurrently, Step 6 org branch); a single-repo run is bounded by its turn count, so the levers are batching connector fetches and not adding extra engine turns.

1. **Connector metrics — fetch all reachable sources, then re-score in one `enrich` pass.** A reachable tracker/docs/incident MCP or integration (Jira, Confluence, Linear, Coda, GitHub Issues, …) is a normal data source for the audit: when one is reachable, fetching and mapping it is part of doing the audit, not an optional extra. Reachability is decided by attempting the call, not by any config file. The 730-day window is handled by the engine's bucketing; a bounded recent query is enough, so enrichment is low-effort, not out of scope. `references/connector-shapes.md` has a turnkey recipe. For every such non-git source:

   - **Attempt to fetch.** Making the MCP call or API request _is_ the reachability check — make it. Do not pre-decide a source is out of scope from Step 0 discovery and skip the call; only conclude a source is unreachable from an actual failure response.
   - **Fetch the independent sources in a single message.** Tracker, docs, and incident are independent — no data flows between them, so issue their initial fetches as parallel tool calls in one message, not one after another. Each serial turn is a full model round-trip, so batching the first-page fetches is the main single-repo wall-time lever. Only pagination _within_ a source is sequential (each Jira page needs the prior page's `startAt`/`nextPageToken` cursor) — that tail is the only part that must be serial.
   - **On success** — map the returned records into the exact connector shape in `references/connector-shapes.md` and write the artifact to `context/audits/YYYY-MM-DD/collected/<source>.json`. Mapping reachable data into the documented shape is not fabrication. Also record the actual window used and a human label in the artifact's `period` block so the Sources column in the report reflects what truly happened: set `period.lookback_days` (e.g. 180 for a 6-month Jira query) and `period.source_label` (e.g. `"Jira via Atlassian MCP"` or `"Confluence via Atlassian MCP"`). The default tracker lookback is 180 days ("6 months"); use whatever window you actually queried. For Jira, paginate to completion before writing the artifact: each request is server-capped at ~100 results; loop on `startAt` (classic JQL) or `nextPageToken` (cloud) until a short/empty page or `isLast: true`, accumulate all results into one `tickets[]` capped at ~2000 tickets, then write `collected/tracker.json` once. When mapping Jira issues, also capture parent/subtask links: set `subtask_count` to `issue.fields.subtasks.length` (omit when 0 or absent) and `parent` to `issue.fields.parent?.key` (omit when null) — these feed the ADP-I4 sub-task split metric. Also capture description size/structure signals (no raw text): set `description_length` to `issue.fields.description?.length` and `has_acceptance_criteria` to whether the description matches `/acceptance.criteria/i` — these feed the ADP-I5 description quality metric.
   - **On failure or unclear mapping** (auth error, unfamiliar schema, broken dependency, empty result, closed port) — do not silently skip. In interactive mode, use `AskUserQuestion` with three options: mark unavailable (record the reason) / retry with guidance / show how to fix (link to `references/connector-shapes.md`). **In headless `claude -p` runs** (no interactive user), default to marking the source unavailable and record the _actual_ failure reason plus a remediation hint in the report's `missed_sources` list — record the real cause (e.g. "Jira MCP returned 401"), never "no connector provided" when an MCP was in fact reachable.

   A reachable source that was not fetched is a gap, not a SKIP: enrich it. Never drop a reachable source without a recorded reason. With no connector reachable at all, leave the check `SKIP` — that is correct, not a failure.

   Once every reachable source's artifact is written, re-score the whole audit in **one** pass — this replaces re-running a metric per source:

   ```bash
   node "${CLAUDE_SKILL_DIR}/dist/cli.js" enrich "<repoPath>" "context/audits/YYYY-MM-DD"
   ```

   `enrich` reuses the `collected/` artifacts you just wrote (it never re-collects, so it never overwrites them), flips the connector topology flags, and rewrites every per-dimension JSON + `audit.json` with the connector metrics now scored. Run it **once, after all fetches** — never once per source, and never a separate `metric <id>` spawn per connector metric. If no connector was reachable, skip `enrich` entirely (nothing changed).

2. **Judgment checks (5).** Run this **after** `enrich` — `enrich` re-emits judgment checks as `PENDING_JUDGMENT`, so patching them earlier would be undone. Gather the evidence for all five in one pass: for each check with `status: "PENDING_JUDGMENT"`, read its category rubric and `evidence_required` from `references/standards.toml` and the dimension file, gather the evidence from the repo, decide `PASS`/`WARN`/`FAIL`, and edit that check record in its `context/audits/YYYY-MM-DD/<dimension>.json` (set `status`, `value`, `evidence`, and `weight_awarded` = the category weight on PASS, else 0). Apply all five edits together rather than looping one check at a time.

3. **Re-aggregate** so `audit.json` reflects the patches (recomputes every dimension score + the audit totals from the per-dimension files; preserves report blocks):

```bash
node "${CLAUDE_SKILL_DIR}/dist/cli.js" aggregate "context/audits/YYYY-MM-DD"
```

4. **Author the plain-language report blocks into `audit.json`.** The renderer is deterministic and contains no LLM — the narrative a CEO reads is authored _here_, by you, and stored in the JSON so the renderer only formats it. Add three optional top-level fields (schema in `output-format.md` → "Report blocks"):

   - `headline` — the executive band. Transcribe values **verbatim** from the dimension checks (cite the `check_id`); never invent numbers. Row 1 of the headline (capability Points + Coverage cap-score block) is emitted by the renderer directly from `audit_total`/`coverage` — do not add it as a `delivery[]` entry. `delivery[]` carries rows 2–9, each a `DeliveryMetric` object `{label, display_value?, band?, gated?, check_id?}`. Author them in this order, reading DORA bands from each check's `hint` field ("DORA-banded (high)"), and transcribing all values verbatim — never invent numbers:
     1. **Merges** — put the unit in the value, not the label: `label: "Merges"`, `display_value` from `collected/git.json` → `raw.window_stats.merges_per_active` rendered as `"<n> / active contributor"` (e.g. `"3.2 / active contributor"`); no `band`; no `check_id`; source: git artifact. If the value is null (zero active contributors), omit `display_value`.
     2. **LOC** — `label: "LOC"`, `display_value` from `raw.window_stats.loc_per_active` as `"<n> / active contributor"`; same rules.
     3. **Deployment frequency** — check `ADP-08`; band from hint; `check_id: "ADP-08"`.
     4. **Rework rate (DORA)** — check `ADP-24`; band from hint; `check_id: "ADP-24"`.
     5. **Lead time for change** — check `ADP-09`; band from hint; `check_id: "ADP-09"`.
     6. **Change-failure rate** — check `ADP-12`; band from hint; `check_id: "ADP-12"`.
     7. **Cycle time (In-Progress→Done)** — set `gated: "tracker"`; no git `check_id`. Sourced only from the tracker connector, whichever ticketing system it is (Jira, Linear, GitHub Projects, Asana, …): when one is present, transcribe the median in-progress→done duration as `display_value`; when no tracker connector, omit `display_value` so the renderer prints "— (needs ticketing connector)". Keep the label system-neutral ("In-Progress→Done") — do not hard-code a vendor name; each system's own state names map onto the canonical in-progress/done states (see `references/connector-shapes.md`).
     8. **MTTR** — set `gated: "incident"`; no git `check_id`. MTTR cannot be derived from git; it comes only from an incident connector. When an incident connector is present, transcribe its recovery value as `display_value`; when no incident connector, omit `display_value` so the renderer prints "— (needs incident connector)". (`adp_i3_mttr` still scores separately as a git-proxy category, but it does not feed this headline row.)

     `scale[]` = code size & complexity — author **exactly these three rows**, each a `{label, display_value, check_id}` transcribed from its check (do **not** put commits, contributors, or merges here — those are activity, not scale/complexity):
     1. **Source size** — `check_id: "ADP-22"` — LOC + file count (e.g. `"234k LOC · 1,203 files"`).
     2. **Cyclomatic complexity** — `check_id: "ADP-21"` — average / max CCN (e.g. `"avg 4.2 · max 38"`).
     3. **Direct dependencies** — `check_id: "ADP-23"` — direct dependency count (e.g. `"142 direct deps"`).

     `reach` = `{contributors, spec_coverage, ai_tooling}` — author exactly these three string fields (the renderer reads these keys by name):
     1. **`contributors`** (rendered label "Active Contributors") — the active-contributor count with the total-in-window in parens, e.g. `"4 active (of 7 in window, 90d)"`. The active count is check `ADP-07` / `adp_g2_contributors`; the total-in-window is `raw.window_stats.authors_total` from `collected/git.json`. Do not append a privacy disclaimer such as "counts are aggregate; no per-person data" — the no-PII rule governs what you collect, not the report copy.
     2. **`spec_coverage`** — the branch→spec coverage from check `SDD-04`, e.g. `"3/5 feature branches touched specs (60%)"`. Transcribe the SDD-04 check value and its evidence string; do not confuse it with the docs-freshness spec coverage (ADP-20).
     3. **`ai_tooling`** — base this on tooling **depth**, checks `ADP-01..06` / `adp_g1_tooling_depth` (which agent tools, instruction files, skills, commands, hooks, and MCP config are present). Do **not** cite the AI-commit-marker attribution percentage (ADP-14 / `adp_g9_ai_attribution`) — that metric is unreliable, so no "AI commit markers ~N% of commits" phrasing.

   - `insights[]` — 3–6 thematic cards, the "READ": `{theme, severity, weak_areas[], so_what, improves}`. Plain language for a non-technical stakeholder — name the weak areas and say what improves if they are fixed.
   - `recommendations[]` — the prioritized fixes as `{id, priority (P0/P1/P2), title, dimension, check_id, effort, detail}`. `detail` is a plain-language paragraph. Transcribe each from a real FAIL/WARN check.

**The orchestrator never hand-writes `report.md` or `report.html`** — those files are always produced by the renderer. This is the data-loss guarantee: JSON is the source of truth; markdown and HTML are derived outputs.

5. Render the report from the JSON source of truth — **always produce BOTH `report.md` and the self-contained `report.html`** here. The HTML is the headline deliverable; it is generated unconditionally in this step, never gated on Step 7 or on interactivity, so headless runs always produce it:

   ```bash
   node "${CLAUDE_SKILL_DIR}/dist/cli.js" render context/audits/YYYY-MM-DD/audit.json --format both --out-dir context/audits/YYYY-MM-DD
   ```

   `--format both` writes `report.md` and `report.html` in one invocation (one process, not two).

6. Write `context/audits/YYYY-MM-DD/recommendations.md` — the same prioritized recommendations you authored into `audit.recommendations` in step 4, in long-form Markdown (this file is the input `/awos:roadmap` consumes). Keep the two in sync; they come from one authoring pass.
7. Present the full report to the user by reading and displaying `context/audits/YYYY-MM-DD/report.md`.

### Step 6 org branch — Portfolio rollup (org mode only)

When the audit ran in org mode (multiple repos, per `references/data-sources.md`), after all per-repo audits are complete, produce the org-level portfolio summary:

1. **Dispatch one `awos:repo-auditor` Agent per repo in a single message — this is the only place per-repo audits are launched, and issuing them together is what makes them run concurrently.** All the Agent tool calls go in one message; org-mode wall time is won here, because the repos audit simultaneously rather than one after another. Give each subagent its `<repoPath>`, its output subdir `context/audits/YYYY-MM-DD/per-repo/<repo-name>`, the engine path `${CLAUDE_SKILL_DIR}/dist/cli.js`, and the skill dir `${CLAUDE_SKILL_DIR}`. Each subagent runs the full single-repo flow — Step 5 `audit-core` → Step 6 connector `enrich` + judgment + `aggregate` → `render --format both` — into its own subdir, so per-repo outputs never collide (each repo's `audit-core`/`enrich`/`render` uses `context/audits/YYYY-MM-DD/per-repo/<repo-name>` as its artifacts/output dir, never the shared `context/audits/YYYY-MM-DD/`). For a large portfolio, cap the fan-out to a handful of concurrent subagents at a time.

   **Wait for all subagents to finish** — each must have written `context/audits/YYYY-MM-DD/per-repo/<repo-name>/audit.json` — before the rollup. The rollup scans the `per-repo/` directory and silently omits any repo whose audit is not yet written, so the barrier matters.

   Each `per-repo/<repo-name>/` directory ends up with the full `audit.json`, `report.md`, `report.html`, and `collected/` artifacts for that repo. A later task will add links from the org report to each `per-repo/<repo-name>/report.html`.

2. Invoke the org rollup via the CLI:

   ```bash
   node "${CLAUDE_SKILL_DIR}/dist/cli.js" rollup context/audits/YYYY-MM-DD/per-repo/
   ```

   The rollup reads each `per-repo/<repo-name>/audit.json` (the full per-repo audit written by step 1) and derives `awarded_weight`, `contributors`, `sources_reachable`, and `has_ai_tooling` from it. It computes **exactly three (≤3) portfolio metrics** — never the full per-repo metric set:
   - **`org_ai_tooling_coverage`** — fraction of portfolio repos with any AI tooling present (contributor-weighted).
   - **`org_capability_score`** — average awarded category-weight score across portfolio repos (Σ weight / repo count).
   - **`org_measurement_coverage`** — fraction of portfolio repos with ≥1 reachable data-source collector (contributor-weighted).

3. Build the org audit JSON by merging the rollup output with a minimal audit envelope and write it to:

   ```text
   context/audits/YYYY-MM-DD/org-portfolio.json
   ```

   The JSON structure must contain `portfolio_metrics`, `per_repo`, `date`, `project`, `audit_total` (average awarded weight across repos), `coverage` (average coverage ratio), and `dimensions` (aggregated dimension data from all per-repo audits). This shape satisfies the renderer's `AuditJson` schema so the renderer can produce both org markdown and HTML from this single file.

   Also author the plain-language report blocks (`headline`, `insights[]`, `recommendations[]`) into `org-portfolio.json` exactly as in single-repo Step 6.4 — at portfolio altitude: `headline.reach` summarises tooling coverage across repos, `insights[]` are portfolio-level themes (e.g. the AI-dark repos, the connector gaps), and `recommendations[]` name the repos/checks driving them. The renderer formats them; it does not synthesize them.

   **Authoring `insights[]` and `recommendations[]` from the `org_gaps` seed.** The rollup output already contains a deterministic `org_gaps` array — the cross-repo capability gaps computed by the engine. Use it as the source of truth for counts; never invent numbers. Turn each entry into a plain-language portfolio card: for `insights[]`, phrase each gap as "`<fail_repos>`/`<total_repos>` repos fail `<definition>` (`<dimension>`)"; for `recommendations[]`, name the check, cite the count, and describe what fixing it improves. Start from the highest-`fail_repos` entries (they are already sorted). Pick the 3–5 most impactful to surface rather than listing every gap. Gaps with `fail_repos === total_repos` (all repos failing) warrant a P0 priority; gaps in roughly half the repos warrant P1; isolated gaps (1 repo) warrant P2 unless the check is critical.

4. Render the org report from the org audit JSON — **always produce BOTH `report.md` and `report.html`** (unconditional, never gated on Step 7):

   ```bash
   node "${CLAUDE_SKILL_DIR}/dist/cli.js" render context/audits/YYYY-MM-DD/org-portfolio.json --format both --out-dir context/audits/YYYY-MM-DD
   ```

5. Present the three portfolio metrics to the user with a brief interpretation:
   - AI-tooling coverage across the portfolio (fraction of repos, contributor-weighted).
   - Portfolio capability score (average awarded weight, reflects depth of AI-SDLC adoption).
   - Measurement coverage (fraction of repos with reachable data sources).
     Then present the per-repo breakdown table from `per_repo`.

Contributor counts in the org report are always aggregate — no per-person data. No money figures appear in any org output.

## Step 7 — What's Next?

After presenting the report, offer follow-up next steps. Both `report.md` and `report.html` were already produced in Step 6 — Step 7 never (re-)generates the report; it only offers what to do next.

### Headless mode (no interactive input)

When `AskUserQuestion` receives its default answer (non-interactive, e.g. CI or `--output-format stream-json`), there is nothing to ask and nothing to render — the reports already exist from Step 6. Finish by pointing the user at `context/audits/YYYY-MM-DD/report.html` and `recommendations.md`. Never hand-write or re-render a report.

### Interactive mode

Offer next steps using `AskUserQuestion` with `multiSelect: true`. The HTML report already exists (Step 6), so it is not an option here — offer only roadmap follow-ups.

### Detect context

- **AWOS installed:** `.awos/commands/` directory exists
- **Roadmap exists:** `context/product/roadmap.md` file exists

### Build options

**If AWOS installed + roadmap exists:**

- "Update roadmap with audit findings" — incorporate recommendations into the existing product roadmap

**If AWOS installed + no roadmap:**

- "Create a roadmap informed by audit findings" — start a new roadmap using audit results as input

**If AWOS is NOT installed**, append this note after the question:

> Tip: install AWOS (`npx @provectusinc/awos`) — the best way to make your repo AI-friendly and act on these findings.

### Execute selected options

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
