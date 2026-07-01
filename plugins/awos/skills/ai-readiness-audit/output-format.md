# Audit Report Format

Use this template when presenting audit results. Replace placeholders with actual values.

---

### Per-Dimension Artifact Format

Each dimension artifact is a **JSON file** (`{name}.json`). The `audit-core` engine pass writes it; `node dist/cli.js render <audit.json> --format md` and `node dist/cli.js render <audit.json> --format html` render the aggregated audit JSON to `report.md` / `report.html` respectively. The engine never writes Markdown or HTML — JSON is the source of truth.

Top-level schema:

```json
{
  "dimension": "<dimension name slug>",
  "date": "YYYY-MM-DD",
  "score": <number>,
  "coverage": <number between 0.0 and 1.0>,
  "checks": [<per-check records — see below>]
}
```

Field notes:

- **`score`** — Σ awarded category weights (uncapped, additive).
- **`coverage`** — `score ÷ Σ weights of applicable categories` (categories whose `applies_when` evaluated to false are excluded from both numerator and denominator).
- **`checks`** — one record per check block in the dimension file. Nothing is dropped; this JSON is the source of truth.

Per-check record schema (all fields required unless explicitly marked optional):

```json
{
  "check_id": "CODE-NN",
  "code": [<numeric category code(s)>],
  "method": "detected|computed|judgment",
  "status": "PASS|WARN|FAIL|SKIP",
  "value": "<string | number | null>",
  "evidence": ["<one evidence item per string>"],
  "weight_awarded": <number>,
  "weight_max": <number>,
  "applies": true|false,
  "reliability": {
    "tag": "maximal|minimal|not-reliable",
    "confidence": "high|medium|low",
    "note": "<source description or 'bounded-by-rubric' for judgment>"
  },
  "source": "<source name from standards.toml>",
  "definition": "<category definition from standards.toml>",
  "hint": "<definition> · <value-derivation> · <reliability tag (confidence)> · <source (year)> · <method>",
  "plain": "<one-sentence non-technical explanation of what this check verifies>"
}
```

Field notes:

- **`check_id`** — taken verbatim from the dimension check heading id: the `XXX-NN` token from the `### XXX-NN:` heading (e.g. `SEC-02`, `ARCH-06`, `SDD-04`).
- **`code`** — array of numeric category codes from the check's `**Category:**` line (resolved against `standards.toml`).
- **`method`** — read from `standards.toml` for the category code. One of `computed`, `detected`, or `judgment`.
- **`status`** — for `computed`/`detected` checks this comes verbatim from the detector output (`node dist/cli.js detect <code> <repoPath>`); for `judgment` checks it is the auditor's evaluation of the category's `rubric` against its `evidence_required` items.
- **`value`** — `string | number | null`. Detectors may return a numeric value (e.g. file sizes, counts, ratios); judgment checks return a string conclusion. Use `null` only if the value is genuinely unavailable.
- **`evidence`** — array of evidence strings (file paths, counts, snippets). For computed/detected, taken verbatim from the detector output.
- **`weight_awarded`** — equals `weight_max` on PASS; 0 otherwise (WARN, FAIL, SKIP).
- **`weight_max`** — the `weight` for this category in `standards.toml`, always — even when the check is SKIP (`applies: false`). `applies: false` is the sole signal to exclude a category from the coverage denominator; `weight_max` is never 0 solely because of SKIP.
- **`applies`** — `true` unless the category's `applies_when` expression evaluated to false for this project.
- **`reliability.tag`** — starts at the category's `reliability_default` (`maximal`, `minimal`, or `not-reliable`). For judgment checks, the note must include `bounded-by-rubric`.
- **`reliability.confidence`** — `"high"` for `computed`/`detected` checks (detector output is deterministic); `"medium"` for `judgment` checks (bounded by rubric quality).
- **`source`** / **`definition`** — copied verbatim from the matching `[category.*]` table in `standards.toml`.
- **`hint`** — five-part human-readable summary; shown as small print inside the HTML tooltip (the specialist detail).
- **`plain`** — one plain-language sentence a non-technical stakeholder understands ("Blocks AI agents from opening secret files like `.env` before they run a command."). The HTML tooltip leads with this, demoting `hint` to small print below it. Optional but recommended on every check; when absent the renderer falls back to `definition`.

Any dimension-specific summary data consumed by downstream dimensions (e.g. the topology output used by later dimensions via `depends-on`) must be included as an additional top-level key in the JSON object alongside `dimension`, `date`, `score`, `coverage`, and `checks`.

---

### Report blocks (authored into `audit.json`)

The renderer is deterministic and contains no LLM. The plain-language narrative a CEO reads is authored by the **orchestrator** (SKILL.md Step 6.4) and stored as three optional top-level keys in `audit.json` (and `org-portfolio.json`). All are optional — the renderer degrades to the capability headline + a mechanical FAIL/WARN recommendation list when they are absent.

```json
{
  "headline": {
    "delivery": [
      {
        "label": "Merges",
        "display_value": "3.2 / active contributor"
      },
      {
        "label": "Deployment frequency",
        "display_value": "1.9 / wk",
        "band": "High",
        "check_id": "ADP-08"
      },
      {
        "label": "Cycle time (Jira In-Progress→Done)",
        "gated": "tracker"
      }
    ],
    "scale": [
      {
        "label": "Source size",
        "display_value": "30,058 LOC · Python",
        "check_id": "ADP-G11"
      }
    ],
    "reach": {
      "ai_tooling": "AI agent config present (partial)",
      "contributors": "4 active contributors (90d)"
    }
  },
  "insights": [
    {
      "theme": "Secrets & supply-chain hygiene",
      "severity": "high|medium|low",
      "weak_areas": ["Security", "Supply Chain Security"],
      "so_what": "Plain 'what this means' for a non-technical reader.",
      "improves": "Plain 'what gets better if fixed'."
    }
  ],
  "recommendations": [
    {
      "id": 1,
      "priority": "P0|P1|P2",
      "title": "Plain-language fix title",
      "dimension": "Security",
      "check_id": "SEC-02",
      "effort": "Low|Medium|High",
      "detail": "Plain-language paragraph: what to do and why."
    }
  ]
}
```

Authoring integrity: `headline` numbers and `recommendations` are **transcribed verbatim** from real checks (cite the `check_id`); DORA `band` values are read from the check's `hint` ("DORA-banded (high)"). Git-only display values (merges per contributor, LOC per contributor) are read from `collected/git.json` → `raw.window_stats` and carry no `band` or `check_id`. Gated rows (`gated: "tracker"` for cycle time, `gated: "incident"` for MTTR) omit `display_value` when no connector is reachable, causing the renderer to print the appropriate "needs … connector" placeholder. The orchestrator never invents numbers — it selects and phrases. `recommendations[]` here and the long-form `recommendations.md` come from one authoring pass and must stay in sync.

### Org rollup output (`org-portfolio.json`)

In org mode the engine reads each repo's FULL audit — `context/audits/YYYY-MM-DD/per-repo/<repo>/audit.json` plus its `collected/git.json` — via `node dist/cli.js rollup <per-repo-dir>` and emits an `OrgRollupResult`. It carries the three portfolio cards, an org **headline** (the delivery matrix averaged across repos and re-banded), and an enriched **per_repo** row per repo so the org report's per-repo table can render every column.

```json
{
  "portfolio_metrics": [
    {
      "metric": "org_ai_tooling_coverage",
      "value": 0.62,
      "description": "…",
      "contributor_weighted": true,
      "repos_counted": 8
    },
    {
      "metric": "org_capability_score",
      "value": 41.3,
      "description": "…",
      "contributor_weighted": false,
      "repos_counted": 8
    },
    {
      "metric": "org_measurement_coverage",
      "value": 0.88,
      "description": "…",
      "contributor_weighted": true,
      "repos_counted": 8
    }
  ],
  "headline": {
    "delivery": [
      {
        "label": "Merges",
        "display_value": "3 / active contributor",
        "repos_counted": 8
      },
      {
        "label": "LOC",
        "display_value": "150 / active contributor",
        "repos_counted": 8
      },
      {
        "label": "Deployment frequency",
        "display_value": "7 / wk",
        "band": "elite",
        "check_id": "ADP-08",
        "repos_counted": 8
      },
      {
        "label": "Rework rate (DORA)",
        "display_value": "15%",
        "band": "watch",
        "check_id": "ADP-24",
        "repos_counted": 6
      },
      {
        "label": "Lead time for change",
        "display_value": "24 h",
        "band": "high",
        "check_id": "ADP-09",
        "repos_counted": 8
      },
      {
        "label": "Change-failure rate",
        "display_value": "5%",
        "band": "high",
        "check_id": "ADP-12",
        "repos_counted": 8
      }
    ]
  },
  "per_repo": [
    {
      "repo": "org/service-a",
      "contributors": 8,
      "awarded_weight": 50,
      "sources_reachable": ["git", "ci"],
      "has_ai_tooling": true,
      "audit_total": 50,
      "coverage": 0.5,
      "merges_per_active": 4,
      "loc_per_active": 200,
      "deploy_freq": 8,
      "rework_rate": 0.1,
      "lead_time": 12,
      "change_fail": 0.04
    }
  ]
}
```

The deterministic org `headline.delivery[]` has **6 rows** — the 2 git per-active rows (merges/active, LOC/active) plus the 4 git-sourced DORA metrics (deployment frequency, rework rate, lead time, change-failure rate). Cycle-time and MTTR are connector-gated (tracker / incident) and never deterministically computed, so the deterministic org headline omits them entirely. Each `display_value` is the per-metric **mean** across repos and each `band` is the mean re-banded through the same TS band functions (`doraDeployBand`, `reworkBand`, `doraLeadTimeBand`, `doraChangeFailBand`). Row 1 (capability Points + Coverage) stays the `org_capability_score` card and is not duplicated here. A metric is averaged over only the repos that supply a value; `repos_counted` notes that coverage; a metric absent in every repo is omitted. Delivery values are pulled from each repo's audit checks by `check_id` (`ADP-08`/`ADP-24`/`ADP-09`/`ADP-12`); `merges_per_active`/`loc_per_active` come from each repo's `collected/git.json` → `raw.window_stats`. The legacy `per_repo` fields are derived from the audit itself — `awarded_weight`/`audit_total` from `audit_total`, `has_ai_tooling` from any awarded AI-tooling code (101–106), `sources_reachable` from the available collector sources, `contributors` from the `ADP-07` check value — so no flat `<repo>.json` summary is required.

---

## Report Template

Write the full report to `context/audits/YYYY-MM-DD/report.md` and also display it to the user.

```markdown
# Code Audit Report

**Date:** YYYY-MM-DD
**Scope:** [all dimensions | single dimension name]
**Audit Total:** N pts
**Coverage Ratio:** XX% rel. today's standard
**Previous Audit:** [YYYY-MM-DD — N pts, XX% | none]

## Summary

| #   | Dimension | Points | Coverage | Delta | Critical | High | Medium | Low |
| --- | --------- | ------ | -------- | ----- | -------- | ---- | ------ | --- |
| 1   | Name      | N      | XX%      | +/-N  | 0        | 0    | 0      | 0   |
| …   | …         | …      | …        | …     | …        | …    | …      | …   |

## Dimension: [Name]

**Score:** N pts (coverage XX% rel. today's standard)
**Reliability:** {tag} ({confidence}) — {note}

| #   | Check                   | Category | Weight | Status | Reliability                 | Evidence       |
| --- | ----------------------- | -------- | ------ | ------ | --------------------------- | -------------- |
| 1   | What the check verifies | 3        | 4      | PASS   | maximal (high) — git native | one-line proof |
| 2   | What the check verifies | 1        | 6      | FAIL   | minimal (low) — proxy \*    | what's missing |
| 3   | What the check verifies | 2        | 3      | WARN   | not-reliable — no data      | partial issue  |
| 4   | What the check verifies | none     | —      | SKIP   | —                           | not applicable |

`*` marks a lower-bound measurement (reliability tag: `minimal`).

(Repeat the dimension section for each dimension that was executed.)

## Top Recommendations

| #   | Priority | Effort | Dimension | Recommendation      |
| --- | -------- | ------ | --------- | ------------------- |
| 1   | P0       | Low    | Name      | What to fix and why |
| 2   | P0       | Medium | Name      | What to fix and why |
| 3   | P1       | Low    | Name      | What to fix and why |
| 4   | P1       | High   | Name      | What to fix and why |
| 5   | P2       | Low    | Name      | What to fix and why |

Sort by priority (P0 first), then by effort (Low first).
Limit to the top 10 most impactful recommendations.
```

---

## Recommendations File

Write actionable recommendations to `context/audits/YYYY-MM-DD/recommendations.md`:

```markdown
# Audit Recommendations — YYYY-MM-DD

## P0 — Fix Immediately

### 1. [Short title]

- **Dimension:** [Name]
- **Check:** [CHECK-ID]
- **Effort:** Low | Medium | High
- **Details:** What exactly needs to be done, with file paths or commands where possible

## P1 — Fix Soon

### 2. [Short title]

…

## P2 — Improve When Possible

### 3. [Short title]

…
```

Priority mapping:

- **P0:** Critical severity FAILs
- **P1:** High severity FAILs + Critical WARNs
- **P2:** Medium/Low FAILs + High/Medium WARNs
