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
| `standards-refresh-proposal.md` | Full two-pass report: sources table with HTTP status and verified dates, weights table with proposed changes and citations, "considered but not proposed" table, and a "left unchanged" rationale summary. |
| `standards-refresh-sources.toml` | Ready-to-paste `[source."<name>"]` blocks for every URL that resolved successfully. Entries that are dead or unverified are excluded and flagged in the proposal instead. |

After reviewing the proposal, apply it manually:

1. Add the `[source.*]` blocks from `standards-refresh-sources.toml` to `standards.toml`.
2. Apply the weight delta table from the proposal.
3. Run `node scripts/standards-linkcheck.mjs` to confirm all proposed URLs resolve.
4. Open a PR with label `patch` (or `minor` if weights change materially).

## Methodology

### Pass 1 — Source link verification

For each distinct `source` string found in `standards.toml`:

1. Run a WebSearch to locate the authoritative current URL — the canonical report or specification page, not blog summaries or secondary references.
2. Issue a WebFetch against the candidate URL to confirm HTTP resolution and capture the precise publication or last-revised date.
3. Record: `source name`, `proposed_url`, `final_url_after_redirect`, `http_status`, `date`, `notes`.

Rules:
- For DOI references, use the doi.org URL as the canonical form (stable even when the landing page is paywalled). A 302 redirect from doi.org to a paywalled page (HTTP 403) is **not** a dead link — flag it as REACHABLE-AUTH and keep the DOI URL.
- **Never fabricate a URL.** If WebFetch fails or returns 404/5xx, flag the link as DEAD and propose no replacement until a confirmed URL is found. A missing or stale link is far less harmful than a plausible-but-wrong one.
- For living documents (GitHub repositories, framework websites), record the date of the latest release or last commit visible on the page, not the original publication date.
- Where `source_year` in `standards.toml` does not match the verified date, flag it as a metadata correction in the proposal. These are low-risk fixes that should be applied alongside any weight changes.

After running Pass 1, run `node scripts/standards-linkcheck.mjs <path>` against the proposed sources file to programmatically confirm all proposed URLs return HTTP 200 or REACHABLE-AUTH before adding them to `standards.toml`.

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
1. Fetch each URL in the sources table with a bare WebFetch and record HTTP status and date.
2. Cross-reference `source_year` values in `standards.toml` against the verified dates.
3. For weight changes, look up each check's `applies_when` condition to determine breadth and compare its current weight against checks in the same dimension with `applies_when = "always"`.

The scratchpad files (`standards-refresh-proposal.md` and `standards-refresh-sources.toml`) from a prior run serve as the baseline for the next refresh. Diff them against the current `standards.toml` to see what was accepted.
