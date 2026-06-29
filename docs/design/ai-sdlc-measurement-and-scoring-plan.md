# AI-SDLC Measurement + Weighted-Category Audit Re-Architecture — implementation spec

> **Status:** approved design, not yet implemented. Self-contained — written for an engineer/agent with **zero prior context**.
>
> **How to run this (fresh Claude Code session):** open the awos repo on branch `feat/ai-sdlc-metrics` (worktree `.worktrees/feat-ai-sdlc-metrics`), then say: _"Execute `docs/design/ai-sdlc-measurement-and-scoring-plan.md` using the superpowers:subagent-driven-development skill."_ That skill runs a fresh subagent per task with a spec+quality review between tasks and a durable ledger at `.superpowers/sdd/progress.md`. For a parallel/headless run use `superpowers:executing-plans` instead. Phase 0 first rewrites the per-task TDD breakdown; this file is the authority on **what** and **why**.

## Context

What began as "add AI-SDLC adoption metrics to the `/awos:ai-readiness-audit` plugin" became, through review, a **re-architecture of the audit's scoring model** plus a new measurement engine and an org-level mode. The plugin is a prompt/markdown product — it is never executed inside this repo; at audit runtime the `dimension-auditor`/collector subagents read the markdown + a TOML data file. `python3` 3.14 + stdlib `tomllib` are available to subagents but **not** to the `SKILL.md` orchestrator. Grep-style lint in `tests/lint-prompts.test.js` guards structure. Work is on `feat/ai-sdlc-metrics` off `origin/main`. Three reference docs were committed under earlier (now-superseded) framing and must be revised/replaced. Large change to working code → **phased**, each phase independently shippable/reviewable.

## Locked decisions

1. **No fixed-ceiling score.** Drop A–F and the 0–100 index everywhere — a capped scale can't honestly answer "what is 100 / how it shifts over time."
2. **Additive, weighted capability categories (whole audit).** Each metric defines **categories** ("what exists / doesn't / % covered"), **additive** (B can exist without A, or with it) so present categories **sum**; each has a **weight** (higher-value capability ⇒ higher weight). Dimension/metric score = Σ present-and-applicable category weights; audit total = Σ all. **Uncapped** — grows as categories are added to the standards file (that's how the bar rises over time). A secondary **coverage ratio** (present ÷ currently-defined applicable weight) is shown for intuition, labeled as relative to today's standard.
3. **Standards in a data file.** `references/standards.toml` holds, per category: numeric code, definition, weight, applicability condition, reference bands, measurement cadence + lookback, source citation + year. A thin `references/standards.md` documents it. User-overridable via a file named in `sources.toml`. Parsed at runtime by subagents via `python3` + `tomllib`. Invisible to prettier → guarded by a dedicated lint test.
4. **Current-state + explicit history.** Point-in-time status is the headline. Rate metrics compute **monthly (30-day) values up to 2 years back**, bounded by the **minimal available history among the sources feeding that metric**. The 30-day bucket + 2-year cap live in `standards.toml`. Before/after _interpretation_ stays a separate concern; produce the series, not an editorialized delta.
5. **Reliability per metric — mutable, computed per run.** Tag _minimal_ (true ≥ shown) / _maximal_ (true ≤ shown) / _not-reliable_ (proxy) + confidence (HIGH/MED/LOW) + a "where it may deviate" note. The tag is **not constant**: `standards.toml` defines the baseline tag + degradation rules, and the emitted reliability is computed at runtime from which sources were available and which expected values were present (a partial/missing source downgrades confidence and appends a note like "computed from partial sources — CI missing"). Surfaced as HTML hover hints (`title=`, plain inline text so it survives print); the clean board shows a visible asterisk only on lower-bound metrics.
6. **Money out of scope, convertible.** No cost source assumed ⇒ no currency rendered; metrics defined to be convertible given a rate source (future extension). Don't preclude conversion.
7. **No per-person attribution.** Repository (and, by design, org) granularity; people only as aggregate active-contributor counts.
8. **Tiered sources, SKIP-not-fabricate.** Tier G (git, always) / C (CI) / I (issue tracker) / D (docs). Absent source ⇒ SKIP with a reason. **MTTR: provide only with a real incident source; never compute from git.**
9. **Source resolution — discover first, always ask.** Always auto-detect links first (current repo + monorepo roots, `.gitmodules`, symlinks — the AWOS-into-services pattern; **parallel collector agents across multiple repos**). Then on **every run**, report what was found and **ask for extra sources** via `AskUserQuestion`. Many-repos = ask for a file/link-list and map repos→links empirically. `context/audits/sources.toml` overrides/extends.
10. **Two-layer engine: collectors + metrics.** `collectors/` — one per source (git/topology, CI, tracker, docs) — each queries its source **once** and writes a shared raw-data artifact. `metrics/` — one per metric — compute **purely from collected artifacts**, never touching sources directly, and map to categories/weights in `standards.toml`. A metric is computed if **at least one** of its sources is available; a present-but-incomplete source yields a partial value (not zero) and a downgraded reliability tag (decision 5). A metric SKIPs **only when none** of its sources exist. No redundant fetches; metrics individually addressable/overridable.
11. **`project-topology` kept, unscored.** Recon only — a structure collector feeding applicability (which categories apply), coverage denominators (layers/services), and link detection. It earns no weight.
12. **Org-level: built now, ≤3 top metrics.** A **scope/mode** of the measurement (multi-repo collection → per-repo metrics → portfolio rollup → org report tabs), not a separate skill. Do **not** aggregate the full per-repo metric set — define **at most 3 top-level org metrics** (e.g. portfolio AI-tooling coverage, portfolio capability score, portfolio confidence/coverage-of-measurement). Per-repo detail stays in the drill-down tab.
13. **Non-SWE: nothing now.** The weighted-category + standards model already generalizes; no separate non-SWE design work.
14. **All compute in Python.** Collectors and metric computations are deterministic **Python scripts** (subagents have `python3` + `tomllib`), invoked by the orchestrating subagent — not LLM-improvised bash/awk. The `.md` files orchestrate/document; the `.py` files compute. Python scripts are unit-tested with pytest. (Adds a Python toolchain to a JS/markdown repo — see Scope & risk.)

## How the weighted-category model maps onto the existing audit

- Existing dimensions keep their `How:` investigation steps; the **category + weight + definition** move to `standards.toml`, and each check maps to category code(s). `Severity` stays for **recommendation priority only** — it no longer drives points.
- **Additivity handles gates/skips for free:** weight is earned only when a category is _present and applicable_. `SDD-01` (AWOS installed), `PAI` (AI agents present), binary `SEC-02`/`SCS-06`, topology-gated `QA-09/10`/`E2E`, conditional `DOC-03` need no special cascade — an absent prerequisite simply means dependent categories aren't earned; per-category applicability conditions in `standards.toml` also drop inapplicable categories from the coverage denominator.
- **Auditor/collector compute; orchestrator sums.** Subagents (Bash + `python3` + `tomllib`) parse `standards.toml` and emit weighted points + reliability into artifacts; `SKILL.md` (no Bash) only reads and sums those numbers.

## File structure (`plugins/awos/skills/ai-readiness-audit/`)

New:

- `references/standards.toml` — central data: categories, codes, weights, applicability, bands, cadence (30d) + lookback (2yr), source + year. (+ `references/standards.md` doc.)
- `collectors/` — one **Python script** per source (`git.py` incl. churn/attribution/topology feed, `ci.py`, `tracker.py`, `docs.py`), each querying its source once and writing a shared raw-data JSON artifact; SKIPs ("source absent") when unavailable. `collectors/README.md` documents the artifact contract.
- `metrics/` — one **Python script** per metric (coverage / banded / raw), computing purely from collector artifacts, emitting value + dynamic reliability + `standards.toml` category mapping. Covers Tier G/C/I/D incl. complexity/scale (ADP-G10–G12, reuse logic from the repository's existing complexity-scan implementation). `metrics/README.md` documents the contract.
- `tests/` (Python) — pytest over collectors/metrics (fixtures over sample collector artifacts; assert partial-source → downgraded reliability, no-source → SKIP, weighted-category math).
- `dimensions/ai-sdlc-adoption.md` — orchestrates: run applicable collectors → run metrics → emit weighted categories + reliability. `depends-on: [project-topology, ai-development-tooling, spec-driven-development]`.
- `docs/design/ai-sdlc-exec-deliverable.md` — CEO/CTO sample outputs (already drafted; revise to coverage+banded+weighted, no composite/grade).

Revise: `references/ai-sdlc-metrics-catalog.md` (metric index → references collectors/metrics/standards), `references/data-sources.md` (discover-first + always-ask, period/history params, linking). **Delete** `references/adoption-index.md`.

Modify: `scoring.md` (additive weighted-category + coverage ratio; severity = priority only), `agents/dimension-auditor.md` (parse `standards.toml`; emit weighted points + reliability), `SKILL.md` (Step 0 discover+ask; Step 5 pass standards; Step 6 sum points, no grade; org multi-repo + aggregation), `output-format.md` + `report-template.md` (weighted points + coverage ratio + reliability hover + Repositories & Connections; org report = Board / Head-of-Eng / Drill-down tabs; drop A–F + grade CSS), all 11 `dimensions/*.md` (add `Category:` mappings), `tests/lint-prompts.test.js` (revise the 3 reference tests; add standards.toml + scoring-model + collectors/metrics + new-dimension + org-report tests), `plugins/awos/.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` (2.1.0→2.2.0 together; →2.3.0 if the `feat/sdlc-automation-audit` branch lands first).

There is **no** non-SWE design doc and **no** separate `ai-sdlc-org-audit.md`; org behavior is specified inline in `SKILL.md` + report templates.

## standards.toml — schema sketch

```toml
[meta]
monthly_bucket_days = 30      # cadence (decision 4)
max_lookback_days = 730       # 2-year cap
# users override by pointing sources.toml at their own standards file

[category.ai_tooling_claude_md]   # one table per capability category
code = 101                        # numeric code (decision 2)
metric = "adp_g1_tooling_depth"   # which metric awards it
weight = 10                       # higher-value capability ⇒ higher weight
definition = "Repo has a non-trivial CLAUDE.md/AGENTS.md providing agent context"
applies_when = "always"           # or e.g. "topology.is_monorepo", "topology.has_ml"
sources = ["git"]                 # contributing collectors
reliability_default = "maximal"   # presence ≠ active use
source = "AWOS conventions"
source_year = 2026

[band.lead_time_for_change]       # reference bands for banded metrics
metric = "adp_g4_lead_time"
source = "DORA State of DevOps"
source_year = 2024
elite = "< 1 day"
high  = "< 1 week"
medium = "< 1 month"
low   = ">= 1 month"
```

## Contracts

- **Collector output** (`collectors/<source>.py` → JSON): `{ source, available: bool, reason_if_absent, period: {bucket_days, lookback_days, history_available_days}, raw: {...} }`. One file per source under `context/audits/<date>/collected/`.
- **Metric output** (`metrics/<metric>.py`, reads collector artifacts): `{ metric, value, kind: coverage|banded|raw, band?, categories_awarded: [codes], reliability: {tag, confidence, note}, sources_used, sources_missing, status: OK|SKIP }`. Reliability is **computed**: start from `reliability_default`, downgrade confidence + append a note per missing/partial source; `status=SKIP` only when `sources_used` is empty.
- **Weighted score** (orchestrator sums from artifacts): per dimension = Σ weights of awarded categories; coverage ratio = awarded ÷ applicable-defined weight; audit total = Σ dimensions. No grade, no cap.

## Phased task list (subagent-driven; each TDD-guarded; gates `bun test tests/` + `bunx prettier . --check` + `pytest`)

**Phase 0 — rebaseline.** Author the per-task TDD breakdown for this spec; revise committed `ai-sdlc-metrics-catalog.md` + `data-sources.md` and their lint tests to this design; delete `adoption-index.md` + its lint test. (Tasks 1–3 committed earlier under the OLD design are NOT done for this design — re-do them.)

**Phase A — weighted-category scoring (existing audit).** `standards.toml` schema + seed categories/weights for the 11 dimensions (+ `standards.md` + lint); rewrite `scoring.md`; update `dimension-auditor.md` (parse TOML, emit weighted points); add `Category:` mappings to the 11 dimensions; update `SKILL.md` Step 5/6 + `output-format.md`/`report-template.md` (drop A–F/grade). Ship as its own PR.

**Phase B — measurement engine.** Python `collectors/*.py` + shared JSON artifact contract + pytest; Python `metrics/*.py` (Tier G/C/I/D, current-state, dynamic reliability) → `standards.toml` categories + pytest; `dimensions/ai-sdlc-adoption.md` orchestrator; revise `ai-sdlc-metrics-catalog.md` + `data-sources.md`.

**Phase C — history.** Monthly (30d) buckets, max 2yr, min-source-history rule, in collectors + metrics + `standards.toml` params.

**Phase D — complexity/scale.** ADP-G10–G12 collectors/metrics + `standards.toml` thresholds (lizard w/ SKIP; pygount + fallback; manifests).

**Phase E — org-level.** `SKILL.md`: multi-repo discovery (parallel collector agents), per-repo metrics, portfolio rollup into ≤3 top-level org metrics (contributor-weighted, no money/PII); `report-template.md`: Board / Head-of-Eng / Drill-down tabs + Repositories & Connections.

**Phase F — polish.** Finalize report board (coverage % + banded + reliability hover); revise `docs/design/ai-sdlc-exec-deliverable.md`; version bump.

## Decision log (the WHY — preserve across sessions)

- **Started** as "add AI-SDLC adoption metrics + a CEO/Head-of-Eng deliverable" (inspired by Jellyfish AI Impact + Provectus Agentic SDLC board metrics).
- **AI-attribution demoted to a lower bound** (trailers are easily disabled → undercount); tooling depth is the reliable adoption anchor. Kept because cheap.
- **Before/after comparison dropped → current-state**: a clean baseline needs an adoption date + clean windows = fragile; comparison ruled out of scope (future "time dimension").
- **0–100 composite index dropped**: a fixed ceiling is unsound — "what is 100 / how it shifts" can't be answered. Replaced by coverage %s (real denominators) + banded metrics.
- **Whole-audit A–F grading replaced** with additive, weighted, file-defined categories: same fixed-ceiling problem; additive categories sum, are individually weighted, and the bar rises by editing `standards.toml`.
- **Standards externalized to TOML** (multi-metric, not DORA-only; commented w/ source+year; user-overridable) because hardcoded thresholds go stale and don't fit narrow domains.
- **History reintroduced carefully** (monthly/2yr, min-source-history) because rate metrics are meaningless without a window — but params are configurable data and comparison interpretation stays separate.
- **Reliability made mutable**: a present source may lack some values; compute from ≥1 source and degrade the tag rather than SKIP.
- **Collectors/metrics split** to avoid re-querying the same source per metric and because available sources are unpredictable.
- **Org-level promoted to in-scope** (≤3 top metrics). **Non-SWE dropped** — the model already generalizes.
- **All compute in Python** — deterministic, cheap, unit-testable.

## Scope & risk

Rewrites the scoring model every existing dimension shares + adds a Python collector/metric engine + org mode — substantially larger than the original feature, touching working/reviewed code. **A Python toolchain enters a JS/markdown repo**: Python scripts need pytest + a lint/format choice (ruff/black) + a CI step; prettier ignores `.py`/`.toml`, so their structural lint must be explicit content-assertions. Mitigations: Phase A lands and is reviewed before B–F; the additive model maps existing checks→categories without behavior loss; `standards.toml` centralizes weights so later tuning is data-only; Python collectors make measurement deterministic, cheap, unit-testable, and decouple expensive source access from metric logic. History (C) and org aggregation (E) are least certain — kept later.

## Verification

Per task: `bun test tests/` (frontmatter/DAG auto-cover the new dimension; new lint guards `standards.toml`, scoring model, collectors/metrics docs, org report) + `bunx prettier . --check` (run `--write`; `.py`/`.toml` not prettier-covered) + `pytest` over collectors/metrics. Phase A end-to-end: confirm a subagent parses `standards.toml` via `python3` and emits weighted points; orchestrator sums them with no grade. Final: whole-branch review + manual read of report/exec deliverable — no A–F/composite remains; board shows coverage % + banded metrics with reliability hover; org report renders the three tabs with ≤3 top metrics.

---

_Companion artifacts in this repo:_ `docs/design/ai-sdlc-exec-deliverable.md` (CEO/CTO sample outputs). The stale pre-pivot breakdown at `docs/superpowers/plans/2026-06-23-ai-sdlc-adoption-measurement.md` is **superseded by this file** (and is git-ignored anyway) — ignore it.
