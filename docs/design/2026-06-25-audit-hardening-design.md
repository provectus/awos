---
title: AI-readiness-audit hardening
date: 2026-06-25
branch: feat/ai-sdlc-metrics
status: approved-design
---

# AI-readiness-audit hardening — design

## Goal

Harden the `plugins/awos/skills/ai-readiness-audit/` plugin so it (1) is correct at the prompt/frontmatter layer, (2) recognizes the whole field of agentic coding tools rather than only Claude, (3) detects metrics uniformly across programming languages instead of being JavaScript-centric, (4) produces a clearer report with a connections/missed-sources section, and (5) is cheaper to run. Delivered as four staged, independently reviewable commits (A–D) on `feat/ai-sdlc-metrics`.

## Constraints and invariants

- The engine is TypeScript bundled to `dist/cli.js`. `dist/` is committed and shipped; CI rebuilds and runs `git diff --exit-code` on it. Every engine-touching commit must end with `npm run build:engine`, `npm run test:engine`, and a committed `dist/`. Run these with a real Node toolchain (the engine tests rely on `node:test`).
- The report renderer (`render.ts`) is deterministic and contains no LLM. Anything the report must display has to be present in `audit.json`; the renderer only formats it. New report content therefore requires the data to be threaded into the JSON at `audit-core`/`aggregate` time.
- Scoring is additive/weighted, never capped. Broadening detectors changes how many files/signals are found, which moves ratios and therefore scores. Each coverage change must update the affected engine tests in the same commit, and score deltas on the fixture repos must be reported, not silently absorbed.
- Markdown prose in this repo is not hard-wrapped at 80 columns.

## Decisions (locked with the user)

- Delivery: staged commits on `feat/ai-sdlc-metrics`, reported after each group.
- Language coverage: a real language-conventions registry, not just wider inline lists.
- Title casing: an acronym-aware title-caser, not two hard-coded strings.
- Agentic tools to treat as first-class, via an agent-tools registry mirroring the language registry: Claude plus exactly Cursor, GitHub Copilot, Codex, Gemini, Kiro, Windsurf, Cline. Every detector iterates the registry; none special-cases a single tool.
- `docs/design/`: keep `ai-sdlc-measurement-and-scoring-plan.md` and `ai-sdlc-exec-deliverable.md`; delete the two dated planning docs (`2026-06-25-audit-headless-and-coverage-plan.md`, `2026-06-25-report-redesign-design.md`).
- SKILL.md stays command-only: keep `disable-model-invocation: true`, rewrite the description so it no longer implies model auto-invocation.

---

## Commit A — Prompt/frontmatter, CI, docs (no engine rebuild)

### SKILL.md frontmatter

- Keep `disable-model-invocation: true`. The audit is expensive and is meant to be driven by the `/awos:ai-readiness-audit` command, not auto-triggered.
- Rewrite `description` to describe a command-invoked capability and drop the "Use when asked to 'audit the code'…" auto-trigger phrasing, which is dead weight under `disable-model-invocation` and currently misleads. Keep the one useful behavioral note (dimensions are discovered automatically; the engine does the scoring).
- Refresh `argument-hint` from `'[dimension-name] or blank for full audit'` to `'[dimension] — omit for a full audit'`, matching the Step 1 behavior (a dimension arg still runs the full topology-gated pass and presents only that section).

### Cross-reference fix

- Replace the prose `see project-topology TOPO-01` (SKILL.md and `references/data-sources.md`) with a stable file+anchor reference: `` `dimensions/project-topology.md` → TOPO-01 ``.
- In `references/data-sources.md`, add a short subsection that actually documents the monorepo / submodule / symlink linked-repo detection and the TOPO-01 monorepo flag, so the reference is self-contained rather than pointing elsewhere.

### CI workflow

- In `.github/workflows/quality-check.yml`, bump every `actions/checkout@v4` → `@v7` and every `actions/setup-node@v4` → `@v6` across all jobs (current latest majors). Verify the exact latest tag for each action at implementation time before pinning, in case a newer major has shipped. No other action versions are present in the file.

### docs/design pruning

- Delete `docs/design/2026-06-25-audit-headless-and-coverage-plan.md` and `docs/design/2026-06-25-report-redesign-design.md`.
- Keep `docs/design/ai-sdlc-measurement-and-scoring-plan.md` and `docs/design/ai-sdlc-exec-deliverable.md`.
- Update `CLAUDE.md` references that point at the deleted headless/coverage plan (the "Known gap" paragraph cites it) so no dangling links remain; fold the still-true content inline or point at the kept scoring-plan doc.

---

## Commit B — De-Claude-ify: multi-tool recognition + reference refresh (engine rebuild)

Build an **agentic-tool registry** that mirrors the language registry (Commit C): a new module `agent_tools.ts` with one `AgentToolDef` per tool, and every detector iterates the registry instead of hardcoding any single tool. No detector special-cases Claude.

```ts
interface AgentToolDef {
  id: string; // 'cursor'
  displayName: string; // 'Cursor'
  instructionFiles: string[]; // top-level guidance files, e.g. ['CLAUDE.md']
  ruleOrCommandDirs: string[]; // rules/commands/prompts dirs
  skillDirs: string[]; // skill dirs (empty if N/A)
  mcpConfigPaths: string[]; // MCP config files (empty if N/A)
  hookPaths: string[]; // hook dirs/files (empty if N/A)
  configDirs: string[]; // any other tool config dirs (for tooling-presence)
  commitAttribution: RegExp[]; // commit trailer / author patterns
}
```

Supported set is exactly Claude plus the seven requested tools — Cursor, GitHub Copilot, Codex, Gemini, Kiro, Windsurf, Cline. Every tool gets a full definition (best-known paths as of build; empty arrays where a tool has no equivalent for an attribute):

- Claude: instr `CLAUDE.md`; dirs `.claude/commands`, `.claude/skills`, `.claude/hooks`; mcp `.mcp.json`, `.claude/mcp.json`; settings `.claude/settings*.json`; attribution `Co-authored-by: Claude`, `claude@anthropic`.
- Cursor: instr `.cursorrules`; dirs `.cursor/rules`, `.cursor/commands`; mcp `.cursor/mcp.json`; attribution `Cursor`.
- GitHub Copilot: instr `.github/copilot-instructions.md`; dirs `.github/prompts`, `.github/instructions`; attribution Copilot coding-agent.
- Codex: instr `AGENTS.md`; dirs `.codex`; mcp/config in `.codex/config.toml`; attribution `Codex` / `chatgpt`.
- Gemini: instr `GEMINI.md`; dirs `.gemini`, `.gemini/commands`; mcp `.gemini/settings.json`; attribution `Gemini`.
- Kiro: dirs `.kiro`, `.kiro/steering`, `.kiro/specs`, `.kiro/hooks`; attribution `Kiro`.
- Windsurf: instr `.windsurfrules`; dirs `.windsurf`, `.windsurf/rules`, `.windsurf/workflows`; mcp `.windsurf/mcp_config.json`; attribution `Windsurf` / `Cascade`.
- Cline: instr `.clinerules` (file or dir); dirs `.clinerules`; mcp `.cline/mcp.json`; attribution `Cline`.

Union helpers used by detectors: `ALL_INSTRUCTION_FILES`, `ALL_RULE_COMMAND_DIRS`, `ALL_SKILL_DIRS`, `ALL_MCP_CONFIG_PATHS`, `ALL_HOOK_PATHS`, `ALL_TOOL_CONFIG_DIRS`, `ALL_COMMIT_ATTRIBUTION`, and `detectAgentTools(repoPath)` (which tools are present). Exact paths are verified against each tool's current docs at implementation time.

### collectors/git.ts

- `getAiMarkedCommits`: match `ALL_COMMIT_ATTRIBUTION` from the registry (Claude + all seven tools), not just Claude. Keep the dedupe-by-SHA set semantics.
- `TOOLING_CANDIDATES`: replace the Claude-centric list with `ALL_TOOL_CONFIG_DIRS` + `ALL_INSTRUCTION_FILES` from the registry.

### detectors

Every detector below iterates the agentic-tool registry; none special-cases Claude, and all seven tools (including Gemini, Kiro, Windsurf, Cline) are covered by construction because they come from the same registry the language detectors' pattern is modeled on.

- `ai_development_tooling.ts`: `detectCustomCommands` → `ALL_RULE_COMMAND_DIRS`; `detectClaudeSkills` → `ALL_SKILL_DIRS`; `detectMcpConfig` → `ALL_MCP_CONFIG_PATHS`; `detectClaudeHooks` → `ALL_HOOK_PATHS` + per-tool settings hooks. Evidence strings name the specific tool found, not "Claude". Function names may stay for stability; behavior/evidence broaden.
- `prompt_agent_integrity.ts`: `AGENT_FILE_GLOBS` / `listAgentFiles` / `detectNoSecurityBypass` scan `ALL_INSTRUCTION_FILES` + `ALL_RULE_COMMAND_DIRS` + `ALL_SKILL_DIRS` across all tools.
- `security.ts`: `detectAgentSafetyHooks` checks `ALL_HOOK_PATHS` (and per-tool hook mechanisms) across all tools, not Claude hooks only.

### references refresh

- `standards.toml`: rewrite category `definition`/`evidence_required` text that says "for Claude" to tool-agnostic phrasing ("AI coding agent" / "agentic tool"). No numeric codes/weights change in this commit unless a definition genuinely requires it.
- `standards.md`: refresh narrative to match the tool-agnostic standards and current engine reality.
- `data-sources.md`: present all seven tools (Cursor, GitHub Copilot, Codex, Gemini, Kiro, Windsurf, Cline) as first-class detected tools alongside Claude, sourced from the registry.
- `ai-sdlc-metrics-catalog.md`: update 2024-dated metric references to their 2025/2026 equivalents, and remove every mention of Jellyfish across the whole repo (license unclear). Grep the tree for `Jellyfish` to confirm zero remaining.

---

## Commit C — Language registry + coverage breadth (engine rebuild)

### New `languages.ts`

A registry describing each language's conventions:

```ts
interface LanguageDef {
  id: string; // 'python'
  displayName: string; // 'Python'
  sourceGlobs: string[]; // ['*.py']
  testFileGlobs: string[];
  testDirNames: string[];
  depFiles: string[]; // ['requirements.txt','pyproject.toml','Pipfile','poetry.lock']
  importRx?: RegExp;
}
```

Cover the languages that already have bundled grammars (JS, TS/TSX, Python, Go, Java, Kotlin, Ruby, PHP, C, C++, C#, Rust) plus glob-only entries for Swift, Scala, Dart. Export union helpers: `ALL_SOURCE_GLOBS`, `ALL_TEST_GLOBS`, `ALL_TEST_DIRS`, `ALL_DEP_FILES`, and `detectLanguages(repoPath)` (which languages are present, by source globs / dep files).

### Refactor detectors to consume the registry

- `code_architecture.ts`: import-graph and all `SOURCE_GLOBS`/file-size/naming globs come from the registry; the import-direction heuristic stops assuming JS/Python only. `ARCH_DOC_PATTERNS` broadens to architecture docs in `*.md`, `*.rst`, `*.txt`, `*.adoc` and common locations (`docs/`, `ARCHITECTURE.*`, `design/`).
- `end_to_end_delivery.ts`:
  - `SOURCE_GLOBS` → `ALL_SOURCE_GLOBS`.
  - `IMPL_PATH_RX` → also accept code at repo root (not only `src/app/lib/packages`).
  - `SPEC_REF_RX` → recognize AWOS `context/spec/NNN-`, plus GSD, SpecKit (`.specify/`/`specs/`), OpenSpec, and similar spec layouts.
  - `TRUNK_NAMES` → add `dev`, `prod` (and `trunk`).
  - Remove the name-based BE/FE branch-split check (E2E-02 `detectNoLayerSplit`) entirely: delete the function, its `DETECTORS` entry (2301), `BACKEND_RX`/`FRONTEND_RX`/`stripLayerSuffix`, the corresponding check in the `end-to-end-delivery` dimension `.md`, and the category 2301 record in `standards.toml`. It is redundant with the path-based E2E-01 and unreliable on facade/contract/DTO/utility repos. The audit total drops by category 2301's weight; note this delta explicitly in the commit message and report.
  - Gate E2E-01 `detectVerticalDelivery` on the repo genuinely having ≥2 architectural layers present (reuse the layer-presence detection from `detectLayerCoverage` — API/UI/DB). Pure-backend, contracts, DTO/RPC, library/utility, and spec-only repos SKIP as not-applicable rather than receiving a (low) vertical-delivery score. Branch classification stays path-based (which files a branch touches), never name-based.
  - `ROOT_TOOLING_FILES` → add monorepo tools: Bazel (`WORKSPACE`/`BUILD`/`MODULE.bazel`), Nx (`nx.json`), Pants (`pants.toml`), Turborepo (`turbo.json`).
  - CI detection uses the full `ci_platforms` candidate set (dirs + files), not just `CI_DIRS`, so GitLab/Bitbucket/Jenkins file-based configs are counted.
- `quality_assurance.ts`:
  - More frameworks across `INTEGRATION_DIR_RX`, `INTEGRATION_FILE_RX`, `INTEGRATION_CONTENT_RX`, `E2E_CONTENT_RX`, `E2E_GLOBS` (add e.g. Vitest, k6, Gatling, RestAssured, pytest markers, Robot Framework, Karate, WebdriverIO variants, Cypress/Playwright already present).
  - `UNIT_DIR_RX` / `E2E_DIR_RX`: handle projects that keep everything in a flat `tests/` (or `test/`) with no on-disk unit/integration/e2e split — detection falls back to naming/content signals rather than requiring tier-named directories.
  - `COVERAGE_CONFIG_FILES` / coverage content: add more tools (e.g. `coverage.py`/`pytest-cov`, JaCoCo, `go test -cover`/`gocov`, SimpleCov, `tarpaulin`, Istanbul/`nyc`/`c8`, `.coverage`, `lcov.info`).
- `application_security.ts`: `SQL_GLOBS` → include `*.sql` and templated/ORM/migration files where SQL commonly lives, in addition to source files.
- `ci_platforms.ts`: add Concourse (`.concourse/`, `ci/pipeline.yml`) and Woodpecker (`.woodpecker.yml`, `.woodpecker/`).

### Tests and drift

Update the engine tests that assert on detected counts/ratios in the same commit. Run the suite against the existing fixture repos and report score deltas. Where a broadened glob would otherwise pull in vendored/generated trees, reuse the existing `SOURCE_IGNORE`-style ignore lists.

---

## Commit D — Report + performance (engine rebuild)

### render.ts

- Acronym-aware `labelize` (render.ts:232): given a slug, uppercase known acronyms from a set — AI, SDLC, CI, CD, API, UI, UX, DB, MCP, E2E, TLS, CORS, SQL, ML, DORA, PII, QA, SBOM, CSRF, XSS, HTTP, URL — and title-case the rest. Fixes "Ai Sdlc Adoption" → "AI SDLC Adoption" and "Ai Development Tooling" → "AI Development Tooling". Frontmatter `title` remains authoritative when carried; this fixes the fallback path the renderer actually uses.
- Headline band layout: change `.exec-blocks` (render.ts:691) from `repeat(auto-fit, minmax(220px,1fr))` to a single-column stack (`grid-template-columns:1fr` or flex column) so Delivery / Code scale & complexity / Reach stack vertically with no overlap.
- New bottom section **"Connections & Sources"** in both md and html:
  - "Connected" — collectors/connectors with `available=true` (git always; CI/tracker/docs when reachable), with what each provided.
  - "Missed / limited" — sources that were absent or shallow, each with its reason: `reason_if_absent` (e.g. "no CI config or connector found") and history limits derived from `period.history_available_days` (e.g. "only ~14 days of history available", "no incident/MTTR data").
- Data threading: `audit-core`/`aggregate` writes a `sources` block into `audit.json` summarizing each collector artifact's `source`, `available`, `reason_if_absent`, and `period.history_available_days` (per repo in org mode). The renderer reads only this block — no source access at render time. Extend the `AuditJson`/`PerRepoSummary` types accordingly.

### Faster models

Add explicit model guidance at the points where the orchestrator dispatches work (SKILL.md Step 0 discovery and `data-sources.md` Phase 1; and the Step 6 judgment/connector/narrative slice). Discovery and connector-transform are mechanical → recommend Haiku; judgment + narrative authoring need moderate reasoning → recommend Sonnet. Expressed as prompt guidance / `model` hints, since there are no standalone agent files to pin.

### dist size

- Enable `minify: true` in `scripts/build-engine.mjs` (cli.js ≈432 KB → ≈300 KB).
- Document in CLAUDE.md that the ~24.5 MB of tree-sitter grammar `.wasm` is the dominant and intentional cost of multi-language complexity parsing, and is not stripped (the registry refactor depends on it).

---

## Out of scope

- No change to the additive scoring philosophy or category weights beyond what a definition rewrite strictly requires.
- No removal of language grammars / no lazy-grammar-loading rework (larger change; grammars are needed by the registry direction).
- No new audit dimensions.

## Risks

- Coverage broadening shifts fixture scores; mitigated by updating tests + reporting deltas per commit.
- Branch-classification rework (E2E) is heuristic; bias toward not-flagging to avoid false positives, accepting some false negatives.
- Threading `sources` into `audit.json` touches the aggregate path and renderer types; covered by engine tests + the committed-dist diff gate.
