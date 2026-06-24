# Audit Report Format

Use this template when presenting audit results. Replace placeholders with actual values.

---

### Per-Dimension Artifact Format

Each dimension artifact (`{name}.md`) contains:

```markdown
# {Dimension Title} — Audit Results

**Date:** YYYY-MM-DD
**Score:** N pts (coverage XX% rel. today's standard)
**Reliability:** {tag} ({confidence}) — {note}

## Results

| #   | Check | Category | Weight | Status | Reliability                 | Evidence |
| --- | ----- | -------- | ------ | ------ | --------------------------- | -------- |
| 1   | What  | 3        | 4      | PASS   | maximal (high) — git native | proof    |

## {Dimension-Specific Summary}

(Structured data for downstream dimensions to consume.
E.g., Topology Summary with detected layers, languages, structure type.)
```

Column notes:

- **Category** — numeric code from `standards.toml` (e.g. `3`); `none` for unscored topology checks.
- **Weight** — the `weight` value for this category in `standards.toml`; `—` for unscored checks.
- **Status** — `PASS`, `WARN`, `FAIL`, or `SKIP`.
- **Reliability** — `{tag} ({confidence}) — {note}`, where tag is one of `minimal`, `maximal`, or `not-reliable`. Rows where tag is `minimal` carry a `*` marker (lower-bound measurement).

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
