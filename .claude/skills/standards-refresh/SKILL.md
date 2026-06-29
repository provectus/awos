---
name: standards-refresh
description: >-
  Maintainer skill for re-verifying the source links and re-evaluating the
  weights in plugins/awos/skills/ai-readiness-audit/references/standards.toml.
  Runs two passes (link verification + weight rescale) and emits a cited
  proposal document plus a ready-to-paste sources patch.
---

# Standards Refresh

A periodic maintainer task to keep `standards.toml` honest: source links must resolve and weights must reflect current (not original) importance. Run this once per major AWOS release or whenever a cited external standard publishes a new edition.

## How to run

Invoke this skill in a Claude Code session from the repo root:

```
/standards-refresh
```

No arguments needed. The skill is self-contained: it reads `standards.toml`, runs both passes, and writes its output to a scratchpad you specify (or a default under `tmp/`).

Before starting, confirm you have network access — Pass 1 issues live WebFetch calls.

## What it outputs

The skill writes two files:

| File | Contents |
|------|----------|
| `standards-refresh-proposal.md` | Full two-pass report: per-category url/date/last_verified table with HTTP status and verified dates, weights table with proposed changes and citations, "considered but not proposed" table, and a "left unchanged" rationale summary. |
| `standards-refresh-patch.toml` | Ready-to-paste per-category field updates (`url`, `date`, `last_verified`) for every category whose URL resolved successfully. Categories with dead or unverified links are excluded and flagged in the proposal instead. |

After reviewing the proposal, apply it manually:

1. For each category in `standards-refresh-patch.toml`, update the matching `[category.*]` block in `standards.toml` with the refreshed `url`, `date`, and `last_verified` fields.
2. Apply the weight delta table from the proposal.
3. Run `node scripts/standards-linkcheck.mjs` to confirm all per-category URLs resolve.
4. Open a PR with label `patch` (or `minor` if weights change materially).

## Methodology

### Pass 1 — Per-category link verification

Each `[category.*]` block in `standards.toml` carries its own `url`, `date`, and `last_verified` fields. Pass 1 verifies each unique URL independently and stamps per-category results:

For each distinct `url` found across all `[category.*]` blocks:

1. Run a WebSearch to locate the authoritative current URL — the canonical report or specification page, not blog summaries or secondary references.
2. Issue a WebFetch against the candidate URL to confirm HTTP resolution and capture the precise publication or last-revised date.
3. Record: `category slug`, `source name`, `proposed_url`, `final_url_after_redirect`, `http_status`, `date`, `last_verified` (today's date).

When multiple categories share the same URL (e.g. all DORA categories pointing to the DORA report), verify the URL once and apply the result to all sharing categories. Each category's `last_verified` is stamped independently with the run date.

Rules:
- For DOI references, use the doi.org URL as the canonical form (stable even when the landing page is paywalled). A 302 redirect from doi.org to a paywalled page (HTTP 403) is **not** a dead link — flag it as REACHABLE-AUTH and keep the DOI URL.
- **Never fabricate a URL.** If WebFetch fails or returns 404/5xx, flag the link as DEAD and propose no replacement until a confirmed URL is found. A missing or stale link is far less harmful than a plausible-but-wrong one.
- For living documents (GitHub repositories, framework websites), record the date of the latest release or last commit visible on the page, not the original publication date.
- Where a category's `date` does not match the verified publication date, flag it as a metadata correction in the proposal.

After running Pass 1, run `node scripts/standards-linkcheck.mjs <path>` against the updated `standards.toml` to programmatically confirm all per-category URLs return HTTP 200 or REACHABLE-AUTH.

### Pass 2 — Weight rescale

Evaluate each category against two criteria:

**1. 2026 importance in an AI-assisted SDLC context.** Consult the most recent editions of the primary source documents (DORA, DX Core 4, OWASP ASVS, etc.) and any 2025–2026 industry evidence. A check whose diagnostic value has diminished (e.g. because the language feature it detects no longer exists in production codebases) should have its weight reduced, not kept for historical continuity.

**2. Cross-language/framework breadth.** Checks gated by a narrow topology flag (e.g. `topology.has_python`, `topology.is_monorepo`) cannot outweigh broadly-applicable checks with `applies_when = "always"`. Compare: if a narrow check's `weight` equals or exceeds a comparable broad check's `weight`, that is a breadth violation.

Propose a change only when the evidence is clear. Most weights are calibrated correctly — do not churn them without a specific citation. For each proposed change, provide:
- `check_id` and `category key`
- `current_weight` → `proposed_weight`
- `breadth` (broad / narrow, with the `applies_when` condition)
- `rationale` (one sentence)
- `citation` (URL or source name + year)

For each category you considered but did not propose changing, include a row in the "Considered but not proposed" table with a brief decision rationale. This creates an audit trail that prevents the same case from being re-argued in the next refresh.

### Reproducibility

To reproduce a prior run:
1. Fetch each distinct `url` from `[category.*]` blocks with a bare WebFetch and record HTTP status and date.
2. Cross-reference each category's `date` field in `standards.toml` against the verified publication dates.
3. For weight changes, look up each check's `applies_when` condition to determine breadth and compare its current weight against checks in the same dimension with `applies_when = "always"`.

The scratchpad files (`standards-refresh-proposal.md` and `standards-refresh-patch.toml`) from a prior run serve as the baseline for the next refresh. Diff the patch against the current `standards.toml` to see what was accepted.
