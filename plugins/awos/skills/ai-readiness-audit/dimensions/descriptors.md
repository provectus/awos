---
name: descriptors
title: Descriptors
description: >-
  Informational size and activity signals — contributors, churn, complexity,
  scale, and dependency counts. Reported for context only; carries no weight
  in the audit total, because bigger or smaller is not better or worse.
severity: low
depends-on: [project-topology]
---

# Descriptors

Size and activity signals that describe the repository without judging it. A one-person 7-LOC repo and a 400-kLOC monolith can both be healthy; these numbers contextualise the scored dimensions (a 2% test ratio means something different at 100 files than at 10,000) but are themselves neither good nor bad, so every check here carries **weight 0** and is excluded from the audit total and coverage.

The headline "Merges/active" and "LOC/active" delivery-throughput figures shown in the report overview belong to this family too — they are echoed on this dimension's page.

## Checks

### DESC-01: Active monthly contributors

- **What:** Distinct commit-author count per trailing 30-day bucket (aggregate only, no per-person data)
- **How:** `node "<engine cli path>" metric active_contributors <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — contributor count computed from git log
- **Skip:** metric returns `status: "SKIP"` — git source unavailable
- **Severity:** medium
- **Category:** 201
- **Scored:** No — informational descriptor (weight 0); reported for context, excluded from the audit total

### DESC-02: Code churn and rework

- **What:** Insertions+deletions trend and rework-hotspot file count over the lookback window
- **How:** `node "<engine cli path>" metric code_churn <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — churn trend computed
- **Skip:** metric returns `status: "SKIP"` — git source unavailable
- **Severity:** low
- **Category:** 601
- **Scored:** No — informational descriptor (weight 0); reported for context, excluded from the audit total

### DESC-03: Cyclomatic complexity

- **What:** Average and maximum McCabe cyclomatic complexity (CCN) per function across the repository, computed by parsing source files with tree-sitter grammars. Bands: elite ≤5, high ≤10, medium ≤15, low >15.
- **How:** `node "<engine cli path>" metric cyclomatic_complexity <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — complexity computed for at least one function in a supported language (JS/TS/TSX/JSX/Python/Go/Java/Ruby/C#/C/C++/Rust/PHP/Kotlin)
- **Skip:** metric returns `status: "SKIP"` — no source files in supported languages found
- **Severity:** medium
- **Category:** 1301
- **Scored:** No — informational descriptor (weight 0); reported for context, excluded from the audit total

### DESC-04: Codebase scale (LOC)

- **What:** Lines of code (non-blank) by language across the repository, excluding generated/vendor directories. Provides scale context for other metrics.
- **How:** `node "<engine cli path>" metric loc_scale <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — LOC counted for at least one recognized source file
- **Skip:** metric returns `status: "SKIP"` — no recognized source files found
- **Severity:** low
- **Category:** 1302
- **Scored:** No — informational descriptor (weight 0); reported for context, excluded from the audit total

### DESC-05: Dependency manifest counts

- **What:** Count of direct dependencies declared in manifest files (package.json, pyproject.toml, go.mod, Cargo.toml, requirements.txt) up to three directory levels deep.
- **How:** `node "<engine cli path>" metric dependency_count <repoPath> context/audits/<date>/collected`
- **Pass (OK):** metric returns `status: "OK"` — at least one manifest found
- **Skip:** metric returns `status: "SKIP"` — no recognised manifest file found
- **Severity:** low
- **Category:** 1303
- **Scored:** No — informational descriptor (weight 0); reported for context, excluded from the audit total
