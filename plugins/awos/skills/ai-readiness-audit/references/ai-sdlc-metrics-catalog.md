# AI-SDLC Metrics Catalog

This document is the metric index for the `ai-sdlc-adoption` audit dimension. Each metric is computed by a `metrics/*.py` script that reads only from `collectors/*.py` artifacts, and maps to capability categories defined in `references/standards.toml`. The **headline is current-state**: the latest completed monthly (30-day) bucket. Metrics also expose an explicit monthly history up to 2 years back, bounded by the minimal source history available (see `data-sources.md`). Values are never expressed in money or currency. Contributor data surfaces only as aggregate counts — never attributed to named individuals.

---

## Tier G — git-only (minimum reliable baseline; always attempted)

Tier G requires only local git history. It is always attempted because git is the one source every codebase has. DORA research (Accelerate, 2018) established deployment frequency, lead time, change-fail rate, and MTTR as the four delivery keys; three of those keys are git-derivable. Martin Fowler's canonical CI/CD writing reinforces that commit frequency and merge frequency are the cheapest leading indicators of flow health.

| ID     | Metric                                   | What it proves                                                                                                                    | Collector(s)                                   | Category/Band                       | Kind     |
| ------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------- | -------- |
| ADP-G1 | AI tooling depth & breadth               | Company-wide adoption, not lone individuals. Absence ⇒ either individual-only use (bad sign) or "all in management decks" (vapor) | `collectors/git.py`, `collectors/fs.py`        | `tooling-coverage` (standards.toml) | coverage |
| ADP-G2 | Active monthly contributors              | Team-size proxy and adoption breadth, without naming anyone                                                                       | `collectors/git.py`                            | `team-breadth`                      | raw      |
| ADP-G3 | Deployment/merge frequency (DORA)        | Delivery flow                                                                                                                     | `collectors/git.py`                            | `delivery-flow`                     | banded   |
| ADP-G4 | Lead time for change (DORA)              | Speed from first commit to landing                                                                                                | `collectors/git.py`                            | `delivery-flow`                     | banded   |
| ADP-G5 | PR cycle time                            | Review/landing speed                                                                                                              | `collectors/git.py`, `collectors/code_host.py` | `delivery-flow`                     | banded   |
| ADP-G6 | Code churn & rework                      | Whether speed is rewrite-thrash or durable                                                                                        | `collectors/git.py`                            | `code-quality`                      | raw      |
| ADP-G7 | Change failure rate (proxy)              | Stability (DORA stability key)                                                                                                    | `collectors/git.py`                            | `stability`                         | banded   |
| ADP-G8 | Review rework cycle                      | AI typically clears review comments faster than humans                                                                            | `collectors/git.py`, `collectors/code_host.py` | `delivery-flow`                     | banded   |
| ADP-G9 | AI-attributed change share (lower bound) | A cheap floor on real AI usage — actual usage is **≥** this, since attribution is easily disabled                                 | `collectors/git.py`                            | `ai-attribution`                    | coverage |

**Computation notes (Tier G):**

- **ADP-G1** — Reuse `ai-development-tooling` + `spec-driven-development` evidence: presence/coverage of `CLAUDE.md`/`AGENTS.md`, `.claude/{skills,commands,hooks}`, MCP config, and spec signals (spec dirs, spec-referencing hooks/scripts, or docs). Report a coverage ratio across detected layers/linked repos.
- **ADP-G2** — Distinct commit-author count per trailing 30-day bucket. Surface only the count: `git log --since=<bucket> --format=%aN | sort -u | wc -l`.
- **ADP-G3** — Merges into the default branch per week: `git log --first-parent --merges <default> --since=<win>` (fallback: first-parent commits/week).
- **ADP-G4** — Per merged branch, median of (merge-commit date − branch first-commit date).
- **ADP-G5** — If a code-host connector is present, open→merge from host API; else approximate as first-commit→merge and label **low-confidence (git-approximation)**.
- **ADP-G6** — `git log --numstat` aggregate insertions+deletions per commit (trend); rework hotspots = files changed >N times within the window (high re-touch = churn). Report churn rate trend, not raw size.
- **ADP-G7** — Share of default-branch merges followed within N days by a revert/hotfix: count `^Revert"`, `hotfix`, `rollback` first-parent commits ÷ total merges.
- **ADP-G8** — If host review data available: review rounds and time-to-resolve-review-threads per PR; else commits pushed after branch open as a proxy, labeled low-confidence.
- **ADP-G9** — Share of commits/PRs carrying AI markers (`Co-authored-by: Claude`/assistant trailers, agent commit/PR labels): `git log --grep` over trailers ÷ total. Label explicitly as a **minimum**; never present as the true adoption level.

---

## Tier C — CI source (when a CI connector/logs are resolvable)

Tier C activates only when a CI connector or accessible CI logs can be resolved for the repository. Default-branch pipeline data is the relevant signal; feature-branch failures are normal and excluded. Teams may tolerate occasional flaky failures, so CI pass rate is treated as supporting evidence, not a headline metric.

| ID     | Metric                      | What it proves                                                                                                                  | Collector(s)       | Category/Band                      | Kind   |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------- | ------ |
| ADP-C1 | Default-branch CI pass rate | Pipeline health — **default/`main`-style branches only**; feature-branch failures are normal; treat as supporting, not headline | `collectors/ci.py` | `pipeline-health` (standards.toml) | banded |
| ADP-C2 | Pipeline duration trend     | Feedback-loop speed                                                                                                             | `collectors/ci.py` | `delivery-flow`                    | raw    |

---

## Tier I — issue tracker (when a tracker connector is resolvable)

Tier I activates when a Jira, Linear, or equivalent issue-tracker connector is resolvable. Work-mix data here follows the Jellyfish AI Impact model: effort is expressed in team-FTE share, never in money.

| ID     | Metric                                         | What it proves                                                                                                                    | Collector(s)                                      | Category/Band               | Kind   |
| ------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------- | ------ |
| ADP-I1 | Work-mix allocation                            | Freed capacity shifts toward Growth, away from KTLO/Support — in **team-FTE share, never money** (Jellyfish FTE-allocation model) | `collectors/tracker.py`                           | `work-mix` (standards.toml) | banded |
| ADP-I2 | Delivered-issue throughput & backlog burn-down | Output and debt-clearing                                                                                                          | `collectors/tracker.py`                           | `delivery-flow`             | raw    |
| ADP-I3 | MTTR                                           | Recovery speed — **SKIP unless a real incident source is provided**; do not infer from re-fixes of the same issue ID              | `collectors/tracker.py`, `collectors/incident.py` | `stability`                 | banded |

---

## Tier D — docs/wiki source (Atlassian/Confluence, Coda, etc.)

Tier D activates when a docs connector (Confluence, Coda, Notion, or similar) is resolvable. Its single metric strengthens the spec-signal from ADP-G1 by confirming that specs exist and are kept current outside the repository as well as inside it.

| ID     | Metric                                 | What it proves                                                                                | Collector(s)         | Category/Band                       | Kind     |
| ------ | -------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------- | -------- |
| ADP-D1 | External spec/doc coverage & freshness | Spec-driven adoption even when specs live outside the repo — strengthens ADP-G1's spec signal | `collectors/docs.py` | `tooling-coverage` (standards.toml) | coverage |

---

## Cross-cutting rules

**Record shape.** Each metric emitted by a `metrics/*.py` script carries the following fields:

```
value            – the current-state scalar or ratio
kind             – "coverage" | "banded" | "raw"
band?            – band name from standards.toml (present when kind is "banded")
categories_awarded – list of standards.toml category codes this value satisfies
reliability      – { tag: "high"|"medium"|"low-confidence", confidence: 0–1, note: str }
sources_used     – list of collector artifacts consumed
sources_missing  – list of collectors that would improve reliability but were absent
status           – "ok" | "skip" | "partial"
```

**ADP-G9 is always a lower bound.** AI-attributed change share is cheap to compute but represents only commits and PRs that carry an explicit AI marker (`Co-authored-by:` trailer, agent label, etc.). Real AI usage is **≥** this figure because attribution trailers and labels are easily turned off or never enabled. Tooling depth (ADP-G1) remains the primary adoption signal; ADP-G9 only corroborates it. Never present ADP-G9 as the true adoption level.

**Repository granularity only.** All metrics are scoped to individual repositories. Contributor counts are aggregates (distinct author counts); no data is attributed to named individuals. This satisfies the no-PII constraint.

**Never express any metric in money or currency.** Work-mix allocation (ADP-I1) uses team-FTE share. Pipeline cost, developer-hour cost, and any other monetary framing are out of scope for every tier.

**MTTR (ADP-I3) is SKIP-by-default.** Do not compute MTTR unless a real incident source (PagerDuty, OpsGenie, incident.io, or equivalent) is explicitly provided and resolvable. Never infer MTTR from re-fixes of the same issue ID in the issue tracker.

**Current-state + explicit history.** The headline value for each metric is the current-state: the most recent completed monthly (30-day) bucket. Alongside the headline, every metric exposes a monthly lookback series — one data point per 30-day bucket — up to a maximum of 24 months (2 years). The lookback window is bounded by the minimal source history across the metric's collectors (e.g., if git history starts 8 months ago, the monthly series has at most 8 points). Producing the series is the metric's job; comparison and interpretation are out of scope for the catalog layer.

**Reliability is per-metric and computed.** Each metric script assigns a reliability tag (`high` / `medium` / `low-confidence`) based on the collectors that were available. When a fallback path is taken (e.g., ADP-G5 approximated from git rather than the code-host API), the reliability tag is `low-confidence` and a note is included. The `reliability` field is always present — never omitted.

**Vendor-neutral measurement frame.** The delivery measurement frame follows the DORA four keys (deployment frequency, lead time for change, change failure rate, MTTR). The only AI-direction claim cited here is the DORA/Google stability finding: AI-assisted teams show improved stability metrics. No AI throughput direction is asserted. Work-mix framing follows the Jellyfish AI Impact model (FTE allocation). Spec-driven adoption framing follows Provectus Agentic SDLC practices (tokens expressed as share, not money). CI/CD feedback-loop framing follows Martin Fowler's canonical CI/CD writing.

---

## Citations

- **DORA four keys** — Forsgren, Humble, Kim, _Accelerate_ (2018) and the annual DORA State of DevOps reports. Deployment frequency, lead time for change, change failure rate, and MTTR define the delivery measurement frame used by Tier G and Tier I metrics.
- **DORA/Google stability finding re: AI** — DORA State of DevOps 2024: teams using AI assistance show improved stability (change failure rate, MTTR). This is the only AI-direction claim in this catalog; no throughput direction is asserted.
- **Martin Fowler on CI/CD** — Fowler's canonical articles on Continuous Integration and Continuous Delivery establish commit frequency and merge frequency as leading indicators of flow health, underpinning ADP-G2 and ADP-G3.
- **Provectus Agentic SDLC** — Provectus internal board metric framing: adoption signals expressed as tooling coverage ratios and spec-linkage ratios; token consumption expressed as a share ratio, never in dollar terms.
- **Jellyfish AI Impact** — Jellyfish engineering analytics research on AI impact measurement: FTE-allocation model for work-mix (Growth / KTLO / Support). Underpins ADP-I1.
