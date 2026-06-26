---
title: Report honesty + provenance (round 3)
date: 2026-06-26
branch: feat/ai-sdlc-metrics
status: approved-pending-review
---

# Report honesty + provenance — design

Third pass on the `ai-readiness-audit` plugin, driven by a fresh headless run against `onex-discovery-api` (`20260626T125139Z__awos-2218649`). The "Repositories & Connections / Tech Stack" section made several unexplained, sometimes-wrong claims, and the connector-enrichment + linked-repo features didn't behave as intended. Every item below has a root cause confirmed against the real repo and the run trace.

All work lands as staged commits on `feat/ai-sdlc-metrics` (PR #139), plugin bump to **2.5.0**. Engine is TypeScript bundled to a committed `dist/cli.js`; every `.ts` edit → `npm run build:engine` + commit `dist/`. New contracts ship with tests. Full `npm test` (engine + lint + installer + fixtures) must stay green — not just `test:engine`.

## Decisions (locked with the user)

- Fix all reported items as one batch.
- **Provenance representation: expandable/tooltip** — each Tech Stack / Framework / Linked-repo / Connection entry shows its name, with the evidence (matched file / pattern / count) revealed on hover/expand, reusing the existing `tip()` style.
- **#2 connector strategy:** investigated first (below); the fix is a SKILL.md framing change, verified by a real headless re-run.

## Confirmed root causes

1. **Linked repo mis-named.** `.claude/skills → ../../onex-discovery-awos/.claude/skills`. `topology.ts:416` derives the name from the target's **last** path segment (`skills`) instead of the linked repo root. Output: `{name:"skills"}` — meaningless.
2. **Atlassian not enriched.** The run made **zero** real Atlassian MCP calls (the apparent "3 calls" were the init tool-catalog + Read results). The model deliberately skipped, reasoning enrichment was _"out of scope … without a `sources.toml`."_ It invented an opt-in precondition; the connector-shapes doc didn't dislodge the "optional/heavy" framing.
3. **CI false "Connected".** `ci.ts:70` returns `available:true` whenever a CI **config file** exists (0 runs, no connector). The report lists it as a live source with a nonsensical "(limited history ~0 days)".
4. **Languages show C/C++.** Repo has a root `Makefile` + `pyproject.toml`, **zero** real `.c/.cpp/.h` (149 `.py`). `detectLanguages` infers a language from any root dep-file, and `Makefile` is in _both_ C's and C++'s dep-lists. Separately, `.venv`/site-packages/caches are not in the ignored set, polluting source-scanning detectors.
5. **Frameworks show "Express".** `detectFrameworks` source-scans (including `.venv`) with broad regexes (bare `\bexpress\b`) → false match in a Python repo.
6. **Cross-cutting:** none of these claims carry evidence, so a reader can't tell a real signal from a false positive.

## Fixes

### F1. Linked-repo naming (#1) — `topology.ts`

Derive the linked-repo name from the **repo root of the resolved target**, not its leaf segment. Algorithm for a resolved `realTarget`:

1. Walk `realTarget` upward; the first ancestor directory that contains a `.git` entry is the linked repo root → use its basename.
2. Fallback (no `.git` found): the path segment immediately **before** the first dotfile/tool-config segment (`.claude`, `.awos`, `.cursor`, `.git`, …). For `…/onex-discovery-awos/.claude/skills` → `onex-discovery-awos`.
3. Final fallback: the last segment (current behavior).

Apply in both the resolved-symlink branch and (best-effort) the dangling-symlink branch. Dedup by name. Test: the exact onex layout (`.claude/skills` → `../../onex-discovery-awos/.claude/skills`, where the target's repo has a `.git`) yields `name:"onex-discovery-awos"`.

### F2. Connector enrichment is default-on for reachable MCP (#2) — `SKILL.md` (+ `connector-shapes.md`)

The orchestrator must treat a **reachable** tracker/docs MCP as a source to **use by default**, not an opt-in gated on `sources.toml`. SKILL.md Step 6.2 changes:

- State plainly: when a tracker/docs MCP (Jira/Confluence/Linear/Coda/…) is reachable, **fetch and map it** — this is part of a normal audit, not optional, and does **not** require a `sources.toml`. `sources.toml` is only for non-MCP/explicit connector config; its absence never justifies skipping a reachable MCP.
- Make it **turnkey and low-effort** so the model doesn't rationalize "out of scope / 730 days is heavy": give a concrete minimal recipe — a bounded query (recent window; the engine handles lookback bucketing), the exact `collected/<source>.json` write path, and the exact `cli.js metric …` re-run + `aggregate` commands. Point at `connector-shapes.md` for the shape.
- When a source is genuinely **unreachable** (no MCP, auth fails, error), record the **actual** reason in `missed_sources` — not the generic "no connector provided" when an MCP was in fact reachable-but-skipped.
- Remove or reconcile any wording (here or in `references/data-sources.md`) that frames MCP enrichment as requiring `sources.toml`.

Verification: this is prompt behavior (non-deterministic), so it is verified by a **real headless re-run** of the audit against `onex-discovery-api` with the Atlassian MCP reachable, confirming `collected/tracker.json`/`docs.json` get written with `available:true` and the connector metrics fill. If still flaky after the framing fix, a deterministic pre-fetch helper is the documented fallback (out of scope now).

### F3. CI "Connected" honesty (#3) — `ci.ts` + metrics + render

A source is "Connected" only when it actually returned data. CI config-only is "detected, no data":

- `ci.ts`: return `available:false` with `reason_if_absent` = "CI config detected (`<platform>`) but no run history — supply a CI connector (e.g. Azure DevOps/GitHub Actions API) for pipeline metrics" when a config exists but there are **no runs and no connector**. `available:true` only when actual run data is present. (Topology `has_ci` is computed independently from the config path, so config-presence signals for SBP-05/SCS-06 are unaffected.)
- Verify `adp_c1_ci_pass_rate` / `adp_c2_pipeline_duration` SKIP cleanly on `available:false` (they already branch on it); update their header comments and any test that asserted the old config-only "OK + note" behavior. SKIP is the correct outcome — you can't measure pass rate with zero runs — and it removes the source from "Connected".
- `render.ts`: guard the "(limited history ~N days)" note so it only renders for `N > 0` (never "~0 days").

### F4. Detection accuracy (#4, #5) — `generated.ts`, `languages.ts`, `topology.ts`

- **Ignore Python env/cache + common vendor/build dirs.** Add to `generated.ts` `DIR_MARKERS`: `.venv`, `venv`, `env`, `.tox`, `.nox`, `.mypy_cache`, `.pytest_cache`, `.ruff_cache`, `.eggs`, `site-packages`, `.gradle`, `.terraform`. (Keep the existing node/dist/build/vendor markers.) Add `*.egg-info` handling. All source-scanning detectors (frameworks, scale, complexity, doc-coverage) already route through `isGeneratedPath`/`PRUNE_DIRS`; ensure `detectFrameworks` and `detectLanguages` honor it too.
- **`detectLanguages` requires real source.** Detect a language when it has **≥1 actual source file** (its `sourceGlobs`) outside ignored dirs — not from a shared build file alone. This drops the `Makefile`-driven C/C++ false positives (0 source files) and yields Python only. Evidence per language = source-file count (+ which dep-file, if any). (A language with a dep-file but zero source files is not "used" — correctly omitted.)
- **`detectFrameworks` excludes ignored dirs + tightens regexes.** Scan only non-ignored source; require import/usage context rather than a bare word for the prose-collision-prone names (`express`, `fiber`, `rails`, `sinatra`, `axum`, `gin`). Record which file + pattern matched (provenance).

### F5. Provenance everywhere in Repositories & Connections (cross-cutting) — `audit_core.ts`, `render.ts`

Change the tech-stack groups from `string[]` to **evidence-carrying entries**:

```ts
interface TechItem {
  name: string;
  evidence: string;
}
interface TechStack {
  languages: TechItem[];
  agent_tools: TechItem[];
  ci: TechItem[];
  frameworks: TechItem[];
}
```

- `detectLanguages`/`detectAgentTools`/`detectFrameworks` return the evidence string alongside each name (matched file/dir/pattern/count). `ci` evidence = the config path. `audit_core` populates `TechItem`s.
- `render.ts` `techStackSection()`: render each entry as `name` with the evidence shown via the existing `tip()` expandable tooltip (md: append the evidence in parentheses, since md has no hover).
- **Linked repos** already carry `{kind, via}` — render that as each entry's evidence (e.g. "onex-discovery-awos — symlink via `.claude/skills`").
- **Connections sources** already carry `reason_if_absent` — ensure it renders as the provenance for missed/limited sources, and that a `data_obtained` distinction (from F3) keeps config-only CI out of "Connected".
- Markdown report keeps the same content inline (no tooltip): `name — evidence`.

## Testing

- Engine `*.test.ts`: F1 onex-style symlink → `onex-discovery-awos`; F3 config-only CI → `available:false` + reason, and adp_c1/c2 SKIP; F4 a repo with `Makefile`+`pyproject.toml`+only `.py` → languages `[Python]` (no C/C++), and a `.venv` containing `.c`/`express` is ignored; F5 tech_stack entries carry non-empty evidence; render shows evidence tooltips and no "~0 days".
- Full `npm test` green (engine + lint + installer + fixtures). `standards-schema` + prompt-lint guards still pass. Rebuild + commit `dist/`. `prettier . --check` clean.
- **F2 is verified by a real headless re-run**, not a unit test (LLM behavior).

## Out of scope / follow-ups

- Deterministic connector pre-fetch helper (only if F2's framing fix proves insufficient on re-run).
- HTML/shell language detection (not requested; repo is "mostly Python").
- The pre-existing deferred follow-ups from the v2 batch (gitattributes arm, detection_conflicts dormancy, double-AST pass, org-mode flat Connections).

## Sequencing

Staged commits, each green: F1 → F3 → F4 (generated markers + detectLanguages + detectFrameworks) → F5 (provenance types + render) → F2 (SKILL/docs) → version bump + lint-contract → full verify + **headless re-run** to confirm #2 and eyeball the report.
