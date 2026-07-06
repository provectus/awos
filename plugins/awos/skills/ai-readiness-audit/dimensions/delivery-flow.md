---
name: delivery-flow
title: Delivery Flow
description: >-
  DORA-style delivery-flow metrics — deployment frequency, lead time,
  PR cycle time, change-failure rate, review rework, rework rate, and MTTR —
  computed from git history (and connectors when available)
severity: high
depends-on: [project-topology]
---

# Delivery Flow

Measures how fast and how safely change flows from commit to the default branch, using the DORA metric family plus review-rework signals. Everything here is computed by the measurement engine from the git collector artifact (upgraded by code-host/tracker connectors when present); nothing is judged by an LLM.

**SKIP-not-fabricate:** a check SKIPs when none of its required data sources exist. A check never fabricates a value from prose or assumptions. MTTR runs from git as a proxy (merge/revert/hotfix cadence) with `reliability_default = "not-reliable"`; its reliability upgrades automatically when a real incident source artifact is present.

## Checks

### DF-01: Deployment / merge frequency

- **What:** Merge events into the default branch per week — 2-parent merge commits plus squash/rebase-merged PRs (subject carries a PR ref), so squash-merge repos measure correctly; DORA-banded (elite/high/medium/low)
- **How:** `node "<engine cli path>" metric merge_frequency <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — merge frequency computed and banded
- **Skip:** metric returns `status: "SKIP"` — git source unavailable
- **Severity:** medium
- **Category:** 301

### DF-02: Lead time for change

- **What:** Median time from first commit on a branch to its merge into the default branch; DORA-banded
- **How:** `node "<engine cli path>" metric lead_time_for_change <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — lead time computed and banded
- **Skip:** metric returns `status: "SKIP"` — git source unavailable, no merge records found, or the repo squash-merges (no branch merge records exist in git; a code-host connector is needed)
- **Severity:** medium
- **Category:** 401

### DF-03: PR cycle time

- **What:** Time from PR open to merge; proxied from merge-record timestamps when no code-host connector is available
- **How:** `node "<engine cli path>" metric pr_cycle_time <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — cycle time computed
- **Skip:** metric returns `status: "SKIP"` — git source unavailable, or the repo squash-merges (no merge-record proxy; needs a code-host connector)
- **Severity:** medium
- **Category:** 501

### DF-04: Change failure rate

- **What:** Share of default-branch merges followed within N days by a revert or hotfix commit; DORA-banded
- **How:** `node "<engine cli path>" metric change_failure_rate <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — change failure rate computed and banded
- **Skip:** metric returns `status: "SKIP"` — git source unavailable
- **Severity:** high
- **Category:** 701

### DF-05: Review rework cycle

- **What:** Review rounds and time-to-resolve review threads per PR; proxied from post-open commits when no code-host data is available
- **How:** `node "<engine cli path>" metric review_rework <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — review rework computed
- **Skip:** metric returns `status: "SKIP"` — git source unavailable, or the repo squash-merges (no merge-record proxy; needs a code-host connector)
- **Severity:** low
- **Category:** 801

### DF-06: Deployment rework rate

- **What:** DORA deployment rework rate — share of deployments that are unplanned fix work triggered by incidents (DORA's fifth metric, introduced 2024). Proxied from git: first-parent merges in the audit window (`[meta].max_lookback_days`) whose subject matches fix/bugfix/hotfix/patch/defect/regression keywords. Bands are AWOS heuristics (DORA publishes no numeric thresholds).
- **How:** `node "<engine cli path>" metric rework_rate <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — rework rate computed and banded
- **Skip:** metric returns `status: "SKIP"` — git source unavailable or no merges in window
- **Severity:** high
- **Category:** 1401

### DF-07: Mean time to recovery

- **What:** Mean time to recovery from incidents; computed from git as a proxy by default (merge/revert/hotfix cadence), upgraded when a real incident source is present in the tracker artifact. Always included — never omitted from the artifact. SKIP only if even git is unavailable.
- **How:** `node "<engine cli path>" metric mttr <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — MTTR computed (git-proxy or real source)
- **Skip:** metric returns `status: "SKIP"` — git source unavailable (the only valid SKIP condition)
- **Severity:** high
- **Category:** 1103
