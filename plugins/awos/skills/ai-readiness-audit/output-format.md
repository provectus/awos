# Audit Report Format

Use this template when presenting audit results. Replace placeholders with actual values.

---

### Per-Dimension Artifact Format

Each dimension artifact is a **JSON file** (`{name}.json`). The `dimension-auditor` agent writes it; `node dist/cli.js render` (a later task) renders it to `report.md` / `report.html`. The auditor never writes markdown.

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

Per-check record schema (all fields required):

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
  "hint": "<definition> · <value-derivation> · <reliability tag (confidence)> · <source (year)> · <method>"
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
- **`hint`** — five-part human-readable summary for hover tooltips in the HTML report.

Any dimension-specific summary data consumed by downstream dimensions (e.g. the topology output used by later dimensions via `depends-on`) must be included as an additional top-level key in the JSON object alongside `dimension`, `date`, `score`, `coverage`, and `checks`.

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
