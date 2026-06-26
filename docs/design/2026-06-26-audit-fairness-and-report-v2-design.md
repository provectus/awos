---
title: Audit fairness + report v2
date: 2026-06-26
branch: feat/ai-sdlc-metrics
status: approved-pending-review
---

# Audit fairness + report v2 — design

Second hardening pass on the `ai-readiness-audit` plugin, driven by a real run against `onex-discovery-api` (a single-service FastAPI app; run `20260626T081429Z__awos-f4fb35d__first`). The first pass made detection multi-tool and multi-language; this pass makes the **scoring fair**, the **values legible**, and the **sources honest** — plus a batch of detector bugs the run surfaced.

All work lands as staged commits on `feat/ai-sdlc-metrics` (PR #139). The engine is TypeScript bundled to a committed `dist/cli.js`; every `.ts` edit is followed by `npm run build:engine` and a committed `dist/`. New structural contracts ship with tests in the same change (Layer 1 lint / engine `*.test.ts`).

The design groups the ~25 items into six workstreams. Each item names the file and the concrete behavior change.

## 1. Connectors & sources honesty

### 1.1 Data-source resolution protocol (CRITICAL)

**Problem.** The Atlassian MCP (Jira/Confluence) was reachable, but the orchestrator declined tracker/docs enrichment and left both SKIP, reasoning that the collector's raw JSON shape was undocumented so emitting metrics felt fabrication-risky. That reasoning is wrong: a reachable, working integration is a real data source and must not be silently dropped. The deeper fix is a protocol, not just a schema doc.

**Fix — never abandon a potential source without user confirmation.** SKILL.md Step 6 gains an explicit data-source resolution protocol the orchestrator follows for every non-git source (tracker, docs, incident, and any other MCP/integration that could feed a metric):

1. **Discover & attempt.** Enumerate reachable integrations (configured MCP servers, connectors). For each that maps to a collector source, attempt to fetch.
2. **On success** → map into the documented connector shape, write `collected/<source>.json`, run that source's metrics. Mapping into a documented shape is not fabrication; declining a reachable source is the failure mode to avoid.
3. **On failure or ambiguity** (auth error, unclear/unfamiliar schema, broken dependency, closed port, empty/partial result, "not sure how to map this") → do **not** silently SKIP. Surface the source, the failure reason, and a remediation hint, then `AskUserQuestion`: **Mark unavailable** (record reason in the report) / **Retry with guidance** / **Here's how to fix it** (doc links). Only mark a source unavailable after this — by user choice, or, in headless `claude -p` runs (no interactive user), by the documented headless default: mark unavailable **with the failure reason and remediation captured in the report's missed-sources list**, never as a bare silent SKIP.

To make step 2 trustworthy, add `references/connector-shapes.md` documenting the exact `TrackerConnector` / `TrackerRaw` (`collectors/tracker.ts`) and `DocsConnector` / `DocsRaw` (`collectors/docs.ts`) interfaces as annotated JSON, with one worked example each (Jira issue search → `TrackerConnector`, Confluence page list → `DocsConnector`). Step 6 links to it. Existing reliability tagging is unchanged, so connector-derived metrics still carry their confidence band.

Every source that ends up unavailable carries a **reason + remediation** into the §1.2 Connections section — the report explains what was missed and how to wire it, rather than the source just being absent.

### 1.2 Surface linked repositories in Connections & Sources

**Problem.** `connectionsSection()` (`render.ts:1125`) renders only the four fixed collectors (git/ci/tracker/docs). The audited repo links `onex-discovery-awos` (skills symlinked in), which never appears anywhere in the report.

**Fix.**

- Topology gains a `linked_repos` detection: resolve symlinks under agent-tool dirs (`.claude/`, etc.) and `git submodule`/`gitlink` entries that point outside the repo; collect distinct target repo names.
- `audit_core.ts` writes `audit.linked_repos: { name, kind, via }[]` (kind ∈ symlink|submodule; via = the path that revealed it).
- `connectionsSection()` renders a third group, "Linked repositories," beneath Connected / Missed. The section is **always present** — when none are detected it renders explicitly ("No linked repositories detected"), so a reader can tell detection ran and found nothing versus the feature being absent. Org mode keeps its existing flat treatment (per-repo nesting remains a tracked follow-up, out of scope here).

### 1.3 Tech Stack section + detection-conflict feedback

**Problem.** `detectLanguages()` (`languages.ts`) and `detectAgentTools()` (`agent_tools.ts`) are only ever called from tests. The report never states what stack it audited (Python, FastAPI, Claude Code, AWOS, Azure DevOps…).

**Fix.**

- `audit_core.ts` calls both detectors (plus `ci_platforms` detection and the framework signals topology already computes) and writes `audit.tech_stack: { languages[], agent_tools[], ci[], frameworks[] }`.
- `render.ts` adds a "Tech Stack" block at the report bottom (md + html), above/with Connections.
- **Self-improvement feedback loop:** when a single file matches more than one language's source globs or more than one tool's path patterns, record it in `audit.detection_conflicts: { file, claimedBy[] }[]` and render a short "Ambiguous detections" note. This is the signal that a registry pattern is too broad and needs tightening.

## 2. Report UX

### 2.1 Insights & recommendations as collapsible accordion

**Problem.** "Top Insights" and "What to improve" render full detail inline, bloating the main page.

**Fix.** Main page lists only the title + tag chips for each insight/recommendation — e.g. `Excellent AI-agent context, but zero automated guardrails — Weak: ai_tooling_hooks, AI-05, SEC-02, PAI-05` and `P0 · Add automated dependency CVE scanning · SCS-06 · effort S`. Each row is a `<details>`/`<summary>` accordion (no JS routing needed); clicking expands the full body inline. Markdown report keeps full bodies (no accordion in md). This also sidesteps the scroll-jump in 2.2 for insights.

### 2.2 Back-link restores scroll position

**Problem.** Returning from a dimension detail page lands at the bottom of the overview; the overview branch of `route()` (`render.ts:1155`) never calls `scrollTo`.

**Fix.** Before navigating into a detail page, store `window.scrollY` (on the overview element or a module var). On return to overview, restore it (`window.scrollTo(0, saved)`); detail pages still open at top. Preserves "return to where I was."

### 2.3 List indentation

**Problem.** The universal reset `*{margin:0;padding:0}` (`render.ts:755`) zeroes `ul/li` indentation, so bottom-of-page lists sit flush-left, narrower than paragraphs.

**Fix.** Add explicit `ul{margin:.4em 0 .6em 1.4em} li{margin:.2em 0}` (or `padding-left`) after the reset.

## 3. Scoring transparency

### 3.1 Points + Value: rename, round, explain

**Problem.** Two columns confuse readers. "Wt" reads as "weight" but actually shows awarded/max points. The Value column shows raw, unitless, unrounded numbers across incomparable units: QA-01 `0.47058823529411764` (ratio), QA-02 `48` (file count), DOC-01 `11936` (bytes). No tooltips, no rounding.

**Fix — Points column.** Rename the "Wt" column header to **"Points"** (md + html) to stop the weight confusion. Its `tip()` tooltip surfaces the underlying `standards.toml` record for that category so the score is traceable to the source of truth: weight (max points), `method` (detected/computed/judgment), `definition`, and `source` + `source_year`. These fields are already parsed by the `standards` verb; thread the matched category record (or the needed subset) into the Check object so the renderer can show "Worth N points · detected · OWASP ASVS 2025 · <definition>".

**Fix — Value column.**

- Add optional `unit?: string` and `expression?: string` to the metric/check result (`metrics/_base.ts`, threaded through `audit_core.ts` to the Check object render.ts consumes). `expression` is the human computation with the actual numbers, authored where the metric is computed — e.g. QA-01 → `"48 test files ÷ 102 source modules = 0.47"`, DOC-01 → `"README.md = 11936 bytes"`.
- `render.ts` rounds displayed numeric values to 2 decimals (ratios/floats; integers and byte counts stay integral) and wraps the Value cell in `tip()` showing `expression` + `unit`. Narrower column, self-explaining.
- Detectors/metrics populate `expression` for at least the numeric checks the run exposed; others fall back to the bare rounded value (no tooltip) until filled.

### 3.2 AS-03 not-configured ≠ pass-with-zero

Covered in §5; it's both a fairness and a transparency fix.

## 4. New metric: doc-comment coverage

**Problem.** DOC-02 only checks per-service READMEs; nothing measures in-code documentation, which benefits every language. A raw comment-line-to-code ratio is the wrong measure — it's heavily language/idiom dependent (a terse Go file and a verbose Java file aren't comparable) and rewards comment volume over usefulness.

**Fix — measure coverage, not volume.** Adopt the docstr-coverage model (cf. the Python [`docstr-coverage`](https://pypi.org/project/docstr-coverage/) tool, JSDoc/TSDoc coverage, KDoc, Go doc comments): the metric is the **fraction of documentable definitions that carry a doc-comment** — i.e. `documented_defs / total_defs`, not comment lines / code lines. Documentable definitions = modules/files, classes, and functions/methods, identified via the tree-sitter AST we already bundle for the complexity metric (`adp_g10_complexity`), so no new parsing dependency. A definition is "documented" if it has the language's doc convention attached (Python: a docstring as the first statement; TS/JS: a leading `/** … */`; Go: a doc comment immediately preceding the decl; KDoc: `/** … */`).

This is likely a **small family** rather than one number, since "documented" means different things at different scopes:

- **Public/exported-symbol coverage** — fraction of *exported/public* definitions that are documented (the highest-value signal; an unexported helper needs a doc far less than a public API).
- **Overall definition coverage** — fraction of all definitions documented (secondary, lower weight).
- Optionally a **module/file-header coverage** sub-signal.

Concretely: 1–2 new categories (`standards.toml` + dimension `.md` blocks + a detector reusing the AST layer), small weights (≈2 each), banded conservatively à la docstr-coverage (e.g. ≥80% elite … <40% low). `applies_when` requires a recognized source language with a known doc convention; languages without one SKIP. `LanguageDef` gains the documentable-node + doc-convention hints needed to drive this (which AST node types are documentable, how a doc attaches). Generated/vendored files excluded via the shared ignore set from §5.3.

## 5. Metric fairness

### 5.1 AS-06 — recognize framework-native auth

`AUTH_DECORATOR_RX` (`application_security.ts:505`) only matches Flask/Django/Express decorator/middleware idioms, so a FastAPI DI app (`Depends(get_current_user)`) false-FAILs while the AS-10 judgment check PASSes citing that same DI. Fix: add framework-native auth patterns — FastAPI `Depends(...)` security deps, NestJS `@UseGuards`, Spring `@PreAuthorize`/`@Secured`, ASP.NET `[Authorize]` — sourced from a framework-auth list (extend the relevant registry). A route file counts as protected if it shows decorator **or** DI-style auth. Keep it a detected check. Evidence lists only genuinely unprotected mutation routes.

### 5.2 AS-03 — separate "not configured" from "safe"

`application_security.ts:191`: no-CORS-found currently returns PASS value 0, conflated with scoped-origins PASS. Fix: three states — wildcard → FAIL; scoped origins configured → PASS (value = origin count, expression names them); no CORS config found → N/A (skip / not-applicable, not a value-0 PASS). Evidence distinguishes them.

### 5.3 ARCH-06 (+ complexity/scale) — exclude generated, per-language thresholds

`code_architecture.ts:485` uses a flat 300-line threshold over `ALL_SOURCE_GLOBS`, counting generated files (`htmlcov/*.js`, `*_pb2.py`, generated GraphQL). Fix:

- Shared ignore set `GENERATED_GLOBS` (new export, consumed by ARCH-06, the complexity/scale metrics, and the §4 comment metric): `**/htmlcov/**`, `**/*_pb2.py`, `**/*_pb2_grpc.py`, `**/*.generated.*`, `**/generated/**`, `**/__generated__/**`, `**/vendor/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `**/node_modules/**`, minified `**/*.min.*`, plus `.gitattributes` `linguist-generated` entries when present.
- Per-language size thresholds on `LanguageDef` (e.g. Python/TS ~400, Go ~500, verbose-idiom languages higher), defaulting to 300 when unset. The metric picks the threshold by the file's language.

### 5.4 SEC-05 — multi-ignore-file, stack-relevant, partial credit

`security.ts:306` checks only `.gitignore`. Fix:

- Inspect `.gitignore` + `.dockerignore` (+ `.claudeignore` and other `\.\w+ignore` files when present).
- Only require a secret-type pattern when that secret type is plausible for the detected stack or such a file actually exists in the repo — a repo that never uses `*.pem` isn't penalized for omitting it.
- The headline risk is **inconsistency**: a secret type ignored by `.gitignore` but exposed to image builds because `.dockerignore` is absent or doesn't cover it (a `COPY . /app` leak). Partial credit per covered ignore-file; evidence calls out the specific gap (which type, which ignore file misses it).

### 5.5 SBP-06 — gate to Python, reword

`software_best_practices.ts:336` greps `**/*.py` but is `applies_when="always"`. Fix: `applies_when="topology.has_python"`; reword the `standards.toml` definition to state it's a Python-3 syntax-validity check.

### 5.6 SBP-03 — drop stray language names

`standards.toml` SBP-03 definition names "JavaScript and Kotlin" but the detector implements Python/Ruby/TypeScript only. Fix: reword generically ("strong typing where the language supports it — strict config or high annotation coverage"); the detector iterates the language registry's typing signals rather than naming languages. No Kotlin-specific code added (registry-driven or omitted), so description and behavior match.

### 5.7 QA-09 — fix multi-service gating

Detector and `applies_when="topology.is_multi_service"` are correct, but the check fired on a single-service FastAPI app → `is_multi_service` mis-detected. Fix: tighten `is_multi_service` in `topology.ts` so a single deployable (one Dockerfile/service manifest, one app package) is not classified multi-service. Add a regression test proving a single FastAPI repo yields `is_multi_service=false` and QA-09 SKIPs.

### 5.8 SCS-07 — reword to override hygiene

`supply_chain_security.ts:690` only checks for `resolutions`/`overrides`/`[patch]` presence; it cannot verify freshness/CVE. Fix: reword `standards.toml` to describe override hygiene (overrides are tracked, minimal, justified); drop "recently published or suspicious versions." Keep WARN-on-presence but frame it as "review these overrides," not "suspicious."

### 5.9 SDD-05 — small weight, partial credit

`standards.toml` SDD-05 (code 2804, weight 5) is all-or-nothing: every spec dir must contain the full triad (functional-spec / technical-considerations / tasks). Small features legitimately skip artifacts. Fix: cut weight 5→2 and award partial credit proportional to artifacts present rather than WARN-on-any-incomplete, so a mostly-complete spec set isn't scored like an empty one.

## 6. Detector bugs

### 6.1 Spec-triad signal always zero

ADP-G1 code 106 (`adp_g1_tooling_depth.ts:45`) tests whether spec dirs appear in `tooling_paths`, but `git.ts:getToolingPaths()` only emits agent-tool paths, never `context/spec/`. So 106 is always 0 despite SDD-04 detecting 39% spec coverage — this produced the false "most features not built through the spec triad." Fix: include spec dirs (`context/spec/`, `.awos/`) in the paths 106 checks (extend the collector's tooling-path set, or have 106 check the repo directly). Regression test: a repo with `context/spec/NNN/` awards code 106.

### 6.2 PAI-05 — local files are meant to be untracked

`prompt_agent_integrity.ts:71` flags `.claude/settings.local.json` as "not tracked," but local settings are intentionally gitignored. Fix: add a per-tool `localOnlyFiles` notion to the `agent_tools` registry (e.g. `settings.local.json`, `*.local.json`) and exclude those from the must-be-tracked set across all tools. Regression test covers Claude + at least one other tool.

### 6.3 AI-04 — org-level MCP invisibility

`ai_development_tooling.ts` AI-04 only sees repo-committed MCP config. Fix: keep detection; when no in-repo MCP is found, evidence states org/MGM-pushed MCP isn't visible from the repo (absence ≠ none), and a tracker/connector confirmation can override. No score penalty asserted on pure absence.

### 6.4 DOC-04 — stop treating non-paths as paths

`documentation.ts:369` `extractLocalLinks` treats any `/...`-prefixed token as a filesystem path, flagging `/api` (route) and `/awos:architecture` (skill name). Fix: a reference is checked as a path only if it has a recognized file extension **and** does not contain `:` (excludes `tool:command` names); a flagged-missing reference must fail `existsSync` relative to repo root. Regression test: `/api` and `/awos:architecture` are not reported missing; a genuinely dead `./docs/gone.md` link still is.

## Registry extensions (summary)

- `LanguageDef`: documentable-node + doc-convention hints (which AST node types are documentable, how a doc-comment attaches, what counts as exported/public), optional `sizeThreshold`, typing-signal hints. Drives §4, §5.3, §5.6.
- `AgentToolDef`: `localOnlyFiles`. Drives §6.2.
- Framework-auth patterns list. Drives §5.1.
- Shared `GENERATED_GLOBS`. Drives §4, §5.3.

All consumed by iterating the registry in detectors — no per-language/tool branching in detector bodies, consistent with the first pass.

## Testing

- Engine `*.test.ts`: AS-06 FastAPI-DI recognized; AS-03 not-configured → N/A; SEC-05 docker-gap detection; SBP-06 gated off for non-Python; QA-09 SKIP on single-service; spec-triad 106 awarded; PAI-05 local files excluded; DOC-04 non-path refs ignored; doc-comment coverage on a multi-language fixture (documented vs undocumented defs); generated-file exclusion in ARCH-06.
- `standards-schema.test.ts` guard still passes (every `applies_when` flag computed in topology.ts) — covers new flags.
- Render: round-to-2dp; Value tooltip (expression) present; "Points" header with standards.toml tooltip; accordion markup; linked-repos section present even when empty; tech-stack section present.
- Data-source protocol: a failed/unavailable source renders into the missed-sources list with a reason + remediation string (headless-default path), rather than being absent.
- Rebuild `dist/` and commit; CI `git diff --exit-code` on dist must pass.

## Out of scope (tracked follow-ups)

- Org-mode Connections/Tech-Stack per-repo nesting (stays flat).
- Live CVE/registry feed for SCS-07 (would need a network source).
- AST-based auth detection beyond the framework-pattern list.

## Sequencing

Staged commits, each green before the next:

1. Registry extensions + shared `GENERATED_GLOBS` (foundation; no behavior change alone).
2. Detector bugs (§6) — highest signal, lowest risk.
3. Metric fairness (§5).
4. New comment metric (§4).
5. Scoring transparency (§3).
6. Connectors & sources (§1).
7. Report UX (§2).
8. Final `dist/` rebuild + whole-branch review.
