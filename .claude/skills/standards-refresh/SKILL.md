---
name: standards-refresh
description: >-
  Maintainer skill for re-verifying the source links and re-evaluating the
  weights in plugins/awos/skills/ai-readiness-audit/references/standards.toml.
  Runs three passes (authoritative-source replacement + link verification +
  weight rescale) and emits a cited proposal document plus a ready-to-paste
  sources patch.
---

# Standards Refresh

A periodic maintainer task to keep `standards.toml` honest: every category must cite a genuine external authority, those links must resolve, and weights must reflect current (not original) importance. Run this once per major AWOS release or whenever a cited external standard publishes a new edition.

**Why each category needs a real external source.** Each scoring category cites the standard that justifies *why* the capability matters, and that citation is surfaced in the audit report next to the check (the "source" label and its link). A reader clicks it to learn the industry rationale. A link to the AWOS repository itself does not do this — `https://github.com/provectus/awos` is the tool's own page, not a write-up of an industry standard. Categories whose `source` is `"AWOS audit"` or `"AWOS conventions"` and whose `url` is the AWOS repo are **self-references**: they tell the reader "we measure this because we measure this." Pass 0 replaces them with the external authority that actually defines the practice.

## How to run

Invoke this skill in a Claude Code session from the repo root:

```
/standards-refresh
```

No arguments needed. The skill is self-contained: it reads `standards.toml`, runs all three passes, and writes its output to a scratchpad you specify (or a default under `tmp/`).

Before starting, confirm you have network access — Pass 0 and Pass 1 issue live WebSearch/WebFetch calls.

## What it outputs

The skill writes two files:

| File | Contents |
|------|----------|
| `standards-refresh-proposal.md` | Full three-pass report: a **self-reference audit** table (every category whose source is the AWOS repo, with the proposed external authority and its verified URL); a per-category url/date/last_verified table with HTTP status and verified dates; a weights table with proposed changes and citations; a "considered but not proposed" table; and a "left unchanged" rationale summary. |
| `standards-refresh-patch.toml` | Ready-to-paste per-category field updates (`source`, `url`, `date`, `last_verified`) for every category whose proposed URL resolved successfully. Categories with dead or unverified links are excluded and flagged in the proposal instead. |

After reviewing the proposal, apply it manually:

1. For each category in `standards-refresh-patch.toml`, update the matching `[category.*]` block in `standards.toml` with the refreshed `source`, `url`, `date`, and `last_verified` fields.
2. Apply the weight delta table from the proposal.
3. Run `node tools/ai-readiness-audit/standards-linkcheck.mjs` to confirm all per-category URLs resolve.
4. Open a PR with label `patch` (or `minor` if weights change materially).

## Methodology

### Pass 0 — Authoritative-source replacement (self-reference audit)

Run this first: a category with a self-referential source distorts every later pass (there is no external publication date to verify, and no external authority to weigh against).

1. List every `[category.*]` block whose `url` is `https://github.com/provectus/awos` (equivalently, whose `source` is `"AWOS audit"` or `"AWOS conventions"`). These are the self-references to fix.
2. For each, read the category's `definition`, `dimension`, and `metric`, then find the external authority that actually defines or justifies the practice the category measures. Search for the canonical specification, standards body, or primary industry write-up — not a blog summary. Map by cluster:

   | Capability cluster (examples of dimensions) | Authoritative source family |
   |---|---|
   | Delivery throughput & stability — deploy frequency, lead time, change-fail rate, MTTR (`end-to-end-delivery`, parts of `ai-sdlc-adoption`) | DORA *State of DevOps* report; Google DORA guides (dora.dev) |
   | CI/CD practice — pipeline presence, trunk-based, automated gates (`software-best-practices`, `end-to-end-delivery`) | Martin Fowler (Continuous Integration / Delivery); DORA |
   | Code complexity, size, maintainability (`code-architecture`) | McCabe 1976 (cyclomatic complexity); established maintainability literature |
   | Testing & quality gates — coverage, test layering, flake control (`quality-assurance`) | Martin Fowler "Test Pyramid"/"Self-Testing Code"; Google Testing Blog; ISTQB glossary |
   | Application security controls (`security`) | OWASP ASVS; OWASP Top 10; NIST SSDF (SP 800-218) |
   | Dependency & build-chain integrity (`supply-chain-security`) | OWASP SCVS; SLSA framework (slsa.dev); NIST SSDF; CISA SBOM guidance |
   | Documentation completeness & freshness (`documentation`) | Diátaxis framework; Google developer-documentation style/guides; Write the Docs |
   | AI agent tooling, prompt integrity, spec-driven flow (`ai-development-tooling`, `prompt-agent-integrity`, `spec-driven-development`, agent-tooling parts of `ai-sdlc-adoption`/`org-portfolio`) | Anthropic engineering docs — *Building effective agents*, *Claude Code best practices*, prompt-engineering guides (platform.claude.com / code.claude.com); Anthropic Agent SDK docs |

3. Verify the candidate URL with WebFetch (the Pass 1 rules below apply) and capture its publication/last-revised date.
4. In the patch, set **`source`** to the real authority name (e.g. `"OWASP SCVS"`, `"DORA State of DevOps"`, `"Anthropic — Building effective agents"`), **`url`** to the verified link, **`date`** to the source's publication date, and **`last_verified`** to today. The report's source label then reads e.g. "DORA State of DevOps 2025" instead of "AWOS audit 2026-06".

**When no external standard genuinely fits.** A few categories detect AWOS-native conventions with no published external equivalent (e.g. the presence of `context/spec` documents in the AWOS layout). Do not dress these up with a loosely-related link. Keep an AWOS source, but make the label honest — set `source` to `"AWOS convention"` (singular, describing what it is) and point `url` at the specific documentation page for that convention, not the repo root. Flag each such retained self-reference in the proposal with a one-line justification so the next refresh can revisit it as the ecosystem matures. Prefer a real external authority wherever one exists — agent-tooling and prompt categories almost always have an Anthropic or industry source and should not be left self-referential.

Never fabricate a URL (see Pass 1). A retained, honestly-labelled AWOS convention link is acceptable; a plausible-but-unverified external link is not.

### Pass 1 — Per-category link verification

Each `[category.*]` block in `standards.toml` carries its own `url`, `date`, and `last_verified` fields. Pass 1 verifies each unique URL independently and stamps per-category results:

For each distinct `url` found across all `[category.*]` blocks:

1. Run a WebSearch to locate the authoritative current URL — the canonical report or specification page, not blog summaries or secondary references.
2. Issue a WebFetch against the candidate URL to confirm HTTP resolution, capture the precise publication or last-revised date, **and read enough of the page to confirm its content actually defines or justifies this category's metric.** HTTP 200 is necessary but not sufficient: a page that resolves but does not explain the concept fails verification.
3. Record: `category slug`, `source name`, `proposed_url`, `final_url_after_redirect`, `http_status`, `date`, `last_verified` (today's date), and a one-line `relevance` note quoting the part of the page that defines the metric.

When multiple categories share the same URL (e.g. all DORA categories pointing to the DORA report), verify the URL once and apply the result to all sharing categories. Each category's `last_verified` is stamped independently with the run date.

Rules:
- **Search by the metric's actual calculation, not the category label.** Before judging a source, read how the metric is really computed (`metrics/<id>.ts` / `detectors/*.ts`) — what it counts, over what window, with what threshold. Search for the backing source using *that* definition. A category named "loc_scale" whose code counts non-blank physical source lines needs a source that defines physical SLOC, not a generic "developer productivity" page. **We do not invent our own metric and then bolt on a loosely-related citation** — the source must back the thing the code actually measures.
- **If a metric has no backing at all — it looks invented/hallucinated (no standard, no industry article defines or justifies the measurement) — do not manufacture a source. Stop and ask the user** with `AskUserQuestion`, offering to **drop the metric/category** (or its external claim) as one of the options. An unbacked metric is a bug to surface, not a citation to fake.
- **Relevance, not just liveness.** A link is only valid if the fetched page explains the specific practice the category measures. A resolving-but-off-topic page — a product overview, a research index, a marketing page that merely mentions the topic — is a bad link even at HTTP 200. When the current link fails relevance, replace it; do not keep it because it resolves.
- **Deep-link, never a site root.** The `url` must land on the specific page that explains the concept, never a bare domain root or landing page (`https://example.com/`). A domain root almost never defines the metric it is attached to. `node tools/ai-readiness-audit/standards-linkcheck.mjs` fails on bare-root URLs — treat that as an error to fix, not a warning.
- **Recency.** Flag any source whose publication date is more than ~10 years old and search for a newer authoritative edition. Keep an old source only when it is the genuine canonical primary for the concept (e.g. McCabe 1976 for cyclomatic complexity) — and record that justification in the proposal. An old source attached to a metric it does not actually cover (e.g. a complexity paper on a plain LOC metric) is both stale and irrelevant: replace it.
- For DOI references, use the doi.org URL as the canonical form (stable even when the landing page is paywalled). A 302 redirect from doi.org to a paywalled page (HTTP 403) is **not** a dead link — flag it as REACHABLE-AUTH and keep the DOI URL.
- **Never fabricate a URL.** If WebFetch fails or returns 404/5xx, flag the link as DEAD and propose no replacement until a confirmed URL is found. A missing or stale link is far less harmful than a plausible-but-wrong one.
- **When no relevant, live, reasonably-current authoritative source can be found, stop and ask the user** with `AskUserQuestion` (offer: keep-and-flag as an honest AWOS convention / provide a source you know of / drop the check's external claim). Do not settle for a loosely-related link to fill the field — a wrong-but-resolving link is exactly the failure this skill exists to prevent.
- For living documents (GitHub repositories, framework websites), record the date of the latest release or last commit visible on the page, not the original publication date.
- Where a category's `date` does not match the verified publication date, flag it as a metadata correction in the proposal.

After running Pass 1, run `node tools/ai-readiness-audit/standards-linkcheck.mjs <path>` against the updated `standards.toml` to programmatically confirm all per-category URLs return HTTP 200 or REACHABLE-AUTH **and that none is a bare domain root.**

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
1. Grep `[category.*]` blocks for `url = "https://github.com/provectus/awos"` to re-list the self-references Pass 0 must address, and cross-check the proposal's self-reference audit table.
2. Fetch each distinct `url` from `[category.*]` blocks with a bare WebFetch and record HTTP status and date.
3. Cross-reference each category's `date` field in `standards.toml` against the verified publication dates.
4. For weight changes, look up each check's `applies_when` condition to determine breadth and compare its current weight against checks in the same dimension with `applies_when = "always"`.

The scratchpad files (`standards-refresh-proposal.md` and `standards-refresh-patch.toml`) from a prior run serve as the baseline for the next refresh. Diff the patch against the current `standards.toml` to see what was accepted.
