# CLAUDE.md

## What This Repo Is

This repo contains **two distinct things** that live side-by-side:

1. **The AWOS framework** — markdown files in `commands/`, `templates/`, `claude/`, `scripts/`, and `plugins/`. These are the actual product: AI-agent prompts, document templates, and a Claude Code plugin. They never execute as code in this repo; they get copied into a user's project.
2. **The installer** — JavaScript code in `src/` and `index.js` (entry point). Published to npm as `@provectusinc/awos` and runnable via either Node (`npx`) or Bun (`bunx`). Its only job is to copy framework files into a user's project. See `src/CLAUDE.md` for installer internals.

When working here, identify which layer your change touches. Editing a prompt under `commands/foo.md` is product work; editing `src/services/file-copier.js` is installer work.

## Critical Rule: Do Not Run the Installer Here

**Never run the installer inside this repo** — neither `npx @provectusinc/awos` / `npx ./index.js` nor `bunx @provectusinc/awos` / `bun index.js`. The installer creates `.awos/`, `.claude/`, and `context/` directories — running it here pollutes the source tree with copies of files that already exist as originals. To test installer changes, run it against a separate scratch project as described in `CONTRIBUTING.md`.

## Common Commands

```sh
# Format check — CI-enforced quality gate (pick one runner):
npx prettier . --check
bunx prettier . --check
npx prettier --write .     # auto-format before committing
bunx prettier --write .

# Run the test suite (no npm deps; node --test built-in):
npm test                   # all four layers (markdown lint, installer, fixtures, engine)
npm run test:lint          # Layer 1 — static prompt linter
npm run test:installer     # Layer 2 — installer unit tests
npm run test:fixtures      # Layer 3 — fixture-project end-to-end
npm run test:coverage      # prints per-file coverage table for src/
npm run test:coverage:gate # fails if coverage drops below env thresholds
bun test --coverage tests/ # local cross-runtime coverage (Bun version)

# Behavioral / session-log E2E lives in the awos-qa repository
# (sibling to this one). See its README for how to run.

# Test installer against a separate project (pick one runner; $AWOS_REPO is the absolute path to this repo):
cd ~/some-scratch-project
npx $AWOS_REPO/index.js
bunx $AWOS_REPO/index.js
bun $AWOS_REPO/index.js          # direct exec also works
npx $AWOS_REPO/index.js --dry-run   # preview only
```

The installer runs on **Node 22+ or any recent Bun**. It uses only standard JS built-ins (`fs`, `path`) via CommonJS `require`, which both runtimes support — do not add npm dependencies or runtime-specific APIs without strong justification, as that would break cross-runtime compatibility.

## Testing

The repo has a three-layer test suite under `tests/`, all built on Node's `node:test` built-in — no npm dependencies. See `tests/README.md` for the detailed reference.

1. **Static prompt linter** (`tests/lint-prompts.test.js`) — symmetry, frontmatter, marker presence, cross-references, dimension DAG, copy-table consistency, and grep-style checks for required substrings inside prompt bodies.
2. **Installer unit tests** (`tests/installer/*.test.js`) — exercises the installer services against temp directories.
3. **Fixture projects** (`tests/fixtures.test.js` + `tests/fixtures/<name>/`) — real installer runs against representative pre-install trees, with manifest-based assertions.

All three layers run in CI via `npm test`, which also runs the engine test layer (see "Running the engine tests" below).

### Coverage

`npm run test:coverage` runs the full suite under Node 22's built-in `--experimental-test-coverage` and prints a per-file table for `src/**` (the installer entry point `src/index.js` is excluded — it's just CLI plumbing). `npm run test:coverage:gate` adds three threshold flags that fail the run when coverage drops below the configured floor.

CI runs both: a non-blocking **coverage-report** job that just prints the table, and a **coverage-gate** job that enforces hardcoded thresholds. To raise the floor, edit `COVERAGE_LINES` / `COVERAGE_FUNCTIONS` / `COVERAGE_BRANCHES` in `.github/workflows/quality-check.yml`.

Local Bun fallback: `bun test --coverage tests/` produces an equivalent table (slightly different column set) when Node isn't installed.

Behavioral end-to-end tests — the ones that run a real Claude Code session against a seeded scratch project and assert on the actual tool-call trace — live in the separate **`awos-qa`** repository (sibling to this one). See its README for how to run them.

### Tests must narrate what they checked

Output that says `N events found` or `M pass` tells you the suite ran, not what was validated. `assert.*` failure messages should name the contract being violated, not just dump a diff. Anyone reading the test output should understand which contracts were verified without opening the test source.

### Adding tests for new contracts

When a change introduces a structural contract — frontmatter key, marker pattern, migration, copy-table entry — its test ships in the same PR. Surface-area contracts (something a grep can catch) go to Layer 1. Mechanical contracts (installer behavior, migration idempotency) go to Layer 2 or 3. Behavioral contracts ("Claude must actually call X") belong in the `awos-qa` repository.

## Architecture: The Two-Folder Customization Model

The installer copies files into **two destination folders** with different semantics — this is load-bearing for the whole UX:

| Source             | Destination              | Semantics                                                               |
| ------------------ | ------------------------ | ----------------------------------------------------------------------- |
| `commands/`        | `.awos/commands/`        | Framework internals. Overwritten on every update.                       |
| `templates/`       | `.awos/templates/`       | Framework internals. Overwritten on every update.                       |
| `scripts/`         | `.awos/scripts/`         | Framework internals. Overwritten on every update.                       |
| `claude/commands/` | `.claude/commands/awos/` | Thin wrappers. User-editable customization layer — preserved on update. |

Each file in `claude/commands/{name}.md` is a tiny wrapper that points at `.awos/commands/{name}.md`. Users add custom instructions in the wrapper without losing them on update. When you add a new command, you must add both the full prompt in `commands/` AND a wrapper in `claude/commands/`. The copy table is defined in `src/config/setup-config.js`.

**Wrapper-preservation policy.** The `claude/commands` copy operation is marked `preserveOnUpdate: true`. On every install, the file-copier scans `.claude/commands/awos/` for files that already exist and would be clobbered. If any conflicts are found, the installer asks the user before overwriting; opting out leaves the existing wrappers untouched, while wrappers the user has never had (e.g. newly added commands) are still installed. Non-interactive runs (CI, piped, tests) default to **preserve** — silent overwrite of customizations is the bug this policy exists to prevent. CI/scripts that genuinely want a fresh sync can pass `--overwrite`; `--no-overwrite` is the explicit form of the safe default. Users who decline overwrite see a pointer to <https://github.com/provectus/awos/tree/main/claude/commands> for manual diffing.

## Architecture: Document-Centric Workflow

AWOS is **spec-driven** — all project state lives in markdown files under `context/` in the user's project, not in chat history. An AI agent can rehydrate full context by reading the files alone.

**Brownfield projects** get automatic codebase awareness. `/awos:product` detects existing source code (during Creation Mode only) and creates `context/product/brownfield.md` with triaged findings about purpose, audience, and features. `/awos:roadmap` and `/awos:architecture` read that file and run their own focused explorations (capabilities and tech stack respectively), passing prior findings to avoid duplicate questions. All findings are triaged with the user (accept / correct / reject). `/awos:architecture` removes the file after all knowledge is absorbed into the product, roadmap, and architecture documents.

The canonical flow (each command is a markdown prompt under `commands/`):

```
/awos:product → /awos:roadmap → /awos:architecture → /awos:hire
              → /awos:spec → /awos:tech → /awos:tasks → /awos:implement → /awos:verify
```

The first four are run once at project setup; the last five iterate per feature. Each command reads/writes a specific document under `context/` (e.g. `context/product/product-definition.md`, `context/spec/NNN-feature/tasks.md`). The numeric prefix on spec directories is allocated by `scripts/create-spec-directory.sh`.

**Implementation delegation rule:** `/awos:implement` is an orchestrator only — it reads `tasks.md`, extracts the `**[Agent: name]**` marker from each task, and delegates to a subagent. The orchestrator is explicitly prohibited from editing code itself. Preserve this contract when editing `commands/implement.md`.

## Architecture: Installer Pipeline

`src/core/setup-orchestrator.js` runs six numbered steps: init → create directories → run migrations → copy files → configure MCP → register plugin marketplace. Each step lives in its own service module under `src/services/`. The orchestrator and `setup-config.js` are the two files to touch when changing setup behavior.

## Migrations

The installer can restructure existing user projects between versions. Migration files are JSON in `src/migrations/NNN-name.json`, executed in version order. Each declares `preconditions` (`require_any`, `require_all`, `skip_if_any`, `error_if_any`) and `operations` (`move`, `copy`, `delete`). The current version is stored in `.awos/.migration-version` in the user's project.

Always validate new migrations with `--dry-run` and ensure they are idempotent (re-running must be a no-op). Use `skip_if_any` to short-circuit when the migration has already been applied. See `CONTRIBUTING.md` for the migration schema.

## The Audit Plugin

`plugins/awos/` is a Claude Code plugin that adds the `/awos:ai-readiness-audit` command. The marketplace is declared in `.claude-plugin/marketplace.json` at the repo root, and the installer registers it in the user's settings during setup (`src/services/marketplace-configurator.js`).

Each audit dimension is a standalone `.md` file in `plugins/awos/skills/ai-readiness-audit/dimensions/` defining its checks and their `standards.toml` category codes. Scoring runs deterministically in the engine, not via a per-dimension subagent fan-out: the orchestrator invokes one command — `node dist/cli.js audit-core <repo> <out>` — which evaluates project-topology first (computing the flags that gate other categories' `applies_when`), then every `detected`/`computed` category across all dimensions in a single pass, writing each `<dimension>.json` plus the aggregated `audit.json`. Only the handful of `judgment` categories and the connector-backed metrics are left for the orchestrator's LLM patch step. Adding a dimension touches four places: the dimension `.md` file, its category records in `standards.toml` (each with a required `check_id`, plus `meta.dimension_order`), a `detectors/<slug>.ts` module, and one import + spread in `detectors/index.ts` (metrics likewise register in `metrics/index.ts`).

The repo has **two independent version lines**. The npm installer version is managed by release-drafter via PR labels — never bump it manually. The **plugin version** is manual: when plugin behavior changes, bump it as one deliberate commit moving three files together — `.claude-plugin/marketplace.json`, `plugins/awos/.claude-plugin/plugin.json`, and the `EXPECTED_PLUGIN_VERSION` pin in `tests/lint-prompts.test.js` (the lint exists to force exactly this three-file discipline). The engine stamps the plugin version into `audit.json` provenance and the report footer, so a behavior change shipped without a bump mislabels its audits.

### Measurement engine (TypeScript)

Scoring is additive and weighted, not A–F/0–100. Each capability **category** lives in `references/standards.toml` (numeric code, weight, definition, applicability, source bands); a dimension's score is the sum of weights for present-and-applicable categories, the audit total is the sum across dimensions, and nothing is capped. A secondary **coverage ratio** (awarded ÷ currently-defined applicable weight) is shown for intuition, and each metric carries a per-run **reliability** tag (`minimal`/`maximal`/`not-reliable` + confidence) computed from which sources were available.

The deterministic compute is a **TypeScript engine** under `plugins/awos/skills/ai-readiness-audit/`. Layers:

- `collectors/*.ts` — one per source (`git`, `ci`, `tracker`, `docs`); each queries its source once and emits a shared JSON artifact. Git is always available; absent sources SKIP with a reason.
- `detectors/*.ts` and `metrics/*.ts` — compute purely from collector artifacts and map to `standards.toml` categories. Complexity/scale metrics parse source with bundled tree-sitter `.wasm` grammars.
- `cli.ts` — the single dispatcher (`progress`/`render`/`rollup`/`audit-core`/`patch-judgment`/`report-context`/`patch-report`/`aggregate`/`enrich`). `render --format both --out-dir <dir>` writes `report.md` + `report.html` in one invocation.
- `audit_core.ts` — the one-pass deterministic audit: runs every `detected`/`computed` category across all dimensions, emits `judgment` checks as `PENDING_JUDGMENT` and connector metrics as `SKIP`, and writes the per-dimension JSON + `audit.json`. Connector topology flags (`has_tracker`/`has_docs_connector`/`has_incident_source`) are derived from the collected artifacts' availability. `enrich <repo> <outDir>` re-runs `auditCore` against the already-written `collected/` dir (via a `collectedDirOverride`, so it never re-collects/overwrites connector artifacts) — the orchestrator calls it once after fetching connectors to re-score every connector metric in a single pass instead of one `metric <id>` spawn per source; repo-derived checks (detectors, AST metrics) are reused from the per-dimension artifacts on disk rather than recomputed, so enrich costs a fraction of the initial pass. The post-audit patch verbs (`aggregate`, `patch-judgment`, `patch-report`, `report-context`) live in `audit_patch.ts`. `patch-judgment <dir> <verdicts.json>` applies the orchestrator's judgment verdicts to the per-dimension files and re-aggregates `audit.json` itself; `report-context <dir>` dumps the flattened authoring context (check values/hints, git window stats, tracker fetch meta) and `patch-report <dir> <blocks.json>` merges the orchestrator-authored headline/insights/recommendations into `audit.json` and emits `recommendations.md` from the same array, so the orchestrator never reads or edits a scoring artifact directly (the `audit-core`/`enrich` summary also lists `pending_judgment_checks`); the standalone `aggregate <dir>` verb (re-sum `audit.json` from the per-dimension files, preserving report blocks) is a repair tool, not part of the normal flow.
- `prevention.ts` — the prevention-coverage linkage pass: derives the per-cluster tier view (`enforced`/`instructed`/`absent`/`pending`) from the PRV check pairs, annotates covered source-dimension checks, and emits the `audit.prevention` block (audit.json only; per-dimension files stay raw). Pure over dimension objects; recomputed by both `audit-core` and `aggregate` (never preserved), which is how `pending` tiers finalize after `patch-judgment`. The PRV check records are self-describing (`cluster`/`covers_checks` stamped from standards.toml), so no standards access is needed post-audit.
- `topology.ts` — deterministic project-topology flags (file/grep heuristics) that gate `applies_when`; connector-dependent flags default absent until a connector is fetched.
- `render.ts` — deterministic JSON → Markdown/HTML renderer (single-repo + hash-routed drill-down report with org and per-repo sections); `report.md`/`report.html` are rendered from the JSON source of truth, never hand-written.
- `progress.ts` — pure progress/ETA helper (wall-clock, user-wait excluded).

The engine is bundled by `tools/ai-readiness-audit/build-engine.mjs` into `dist/cli.js` (esbuild, all imports inlined) plus `dist/grammars/*.wasm`. **`dist/` is committed and shipped** — users run the prebuilt `dist/cli.js`; they do not build. So after editing any engine `.ts`, run `npm run build:audit-engine` and commit the regenerated `dist/`. CI rebuilds and runs `git diff --exit-code` on `dist/` to flag a stale committed bundle — the job is currently `continue-on-error: true` (non-blocking until it has proven stable), so a stale `dist/` shows as a failed check without blocking the merge. The bundle is minified; `dist/`'s bulk is the ~26 MB of tree-sitter grammar `.wasm` files, which are required for multi-language complexity parsing and are intentionally shipped, not stripped.

At audit runtime `SKILL.md` orchestrates: Step 0 discovers repos (single-repo or org mode) and confirms scope with one `AskUserQuestion` whose **headless default** proceeds on the auto-discovered set (no prompt needed); Step 4 runs the single `node "$ENGINE" audit-core …` pass (no per-dimension subagents); Step 5 fills only the LLM-only slice — it fetches the reachable connector sources concurrently, re-scores them in one `enrich` pass, then patches the 13 `judgment` categories (5 source-dimension rubrics plus the 8 prevention-coverage instruction checks, which share one instruction-file corpus and ride one subagent), re-aggregates, authors the report blocks into `audit.json`, and renders both reports in one `render --format both` call. Each run writes to a fresh timestamped `context/audits/YYYY-MM-DD_HH-MM-SS/` directory — audits are independent snapshots; there is no previous-audit or delta logic. In **org mode** the per-repo audits are dispatched as concurrent `awos:repo-auditor` subagents (one per repo, `plugins/awos/agents/repo-auditor.md`), each running the full single-repo flow into its own `per-repo/<repo>/` subdir, before the org `rollup`. The engine runs under any `node` on PATH, so it requires a Node runtime present — `SKILL.md` preflights `command -v node`. **Engine-skip circuit-breaker:** under headless `claude -p`, the orchestrator model has repeatedly tried to skip `audit-core` and hand-compute the audit (the reversion that retired the old `dimension-auditor` fan-out). Three layers prevent it: `SKILL.md` Step 4 is unconditional — the `audit-core` call is the first scoring action, and there is deliberately no load-time injection or other "maybe it already ran" mechanism to cite; the engine enforces provenance — `audit-core` stamps `audit.json` (and each dimension JSON) with `engine.generated_by`, and `patch-judgment`/`render` refuse an unstamped single-repo audit while `rollup` skips unstamped per-repo audits, so a hand-assembled audit cannot become a report; and the QA harness (`tools/ai-readiness-audit/qa/`) guards compliance, retries with a corrective `--append-system-prompt`, and seeds `audit-core` itself to salvage a non-compliant run.

Run headless against a target repo: `claude -p "/awos:ai-readiness-audit" --output-format stream-json --verbose`. Progress is coarse — the deterministic scoring is one `audit-core` pass — and is emitted via `node "$ENGINE" progress <elapsed> <done> <total>` (a `pct`/`eta_seconds` line, also a stream-json line in headless mode); the always-available fallback is counting completed `.json` artifacts in `context/audits/YYYY-MM-DD_HH-MM-SS/` against the total.

### Running the engine tests

The engine has its own test layer (`plugins/awos/skills/ai-readiness-audit/**/*.test.ts`), run with Node's `node:test` + `tsx`. The files split by intent: the skill's `tests/` directory holds the structural suites (one per layer/verb), while `*.test.ts` files co-located with the modules (skill root, `detectors/`, `metrics/`) are issue-fix regression tests pinned to specific bugs. These need dev dependencies, so `npm ci` first (the markdown/installer layers have no deps, the engine layer does):

```sh
npm ci                 # installs tsx, esbuild, typescript, etc.
npm run build:audit-engine   # regenerate dist/ (required if any engine .ts changed)
npm run test:audit-engine    # node --import tsx --test over the engine test files
npm test               # full suite: markdown/installer layers + test:audit-engine
```

These commands assume `node`/`npm` resolve to a real Node toolchain (as on CI and a fresh clone), since the engine layer relies on `node:test`.

## Conventions

- Framework files are markdown. Treat them as prompts: clarity, structure, and explicit role/task/process sections matter more than terseness.
- Templates use `[bracketed placeholders]` for sections users fill in.
- Spec directories are numbered (`001-feature-name/`) to enforce ordering.
- Prettier config: single quotes, semicolons, 80-col, 2-space, LF endings, `es5` trailing commas. CI fails on format drift.
- PR labels (`major` / `minor` / `patch`) drive automated release version bumps via release-drafter; defaulting to `patch` when unlabeled.

## Editing Prompts

Files under `commands/`, `claude/commands/`, `plugins/awos/`, and `templates/agent-template.md` are prompts. Re-read Anthropic's guidance before any large rewrite — it changes:

- <https://code.claude.com/docs/en/best-practices>
- <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices>
- <https://code.claude.com/docs/en/slash-commands>
- <https://code.claude.com/docs/en/sub-agents>

Non-obvious rules for this repo:

- **Dial back aggressive emphasis.** Opus 4.6+ overtriggers on `CRITICAL` / `YOU MUST` / `STRICTLY PROHIBITED`. Use plain declarative sentences; reserve one bold-emphasis rule per file for the one most likely to be ignored.
- **Use `Agent`, not `Task`,** when naming the delegation tool. `Task(...)` aliases still work but the tool was renamed in Claude Code v2.1.63.
- **Both project-local and plugin-provided agents surface in the `Agent` tool's description block at runtime.** Project-local agents come from `.claude/agents/*.md`; plugin-provided ones are recognized by the `plugin-name:` prefix on `subagent_type` (e.g. `python-development:python-pro`). For commands that only need to know what specialists exist and what each covers (e.g. `commands/tasks.md`, `commands/tech.md`), introspect the description block — no tool calls needed, no asymmetry between the two kinds. Read `.claude/agents/*.md` directly only when the command actually consumes the file contents beyond `name` + `description` — e.g. `commands/hire.md`, which reads `skills:` arrays to build its coverage table and appends to them when installing new skills.
- **Don't gratuitously name "Claude Code" inside prompts.** The host is already implied by paths (`.claude/agents/*.md`), conventions (the `plugin-name:` prefix on `subagent_type`), and tool names (`Agent` / `Read` / `Glob`). Explicit "loaded by Claude Code" / "in Claude Code" attributions in the prompt body almost always just trim.
- **Prefer the built-in `Explore` and `Plan` subagents** for read-heavy context-gathering. Don't have an orchestrator command read the whole codebase in its own context.
- **Skip ceremonial preambles** like "Great!", "I will now…", "All done!" — modern models trim them naturally and AWOS prompts shouldn't fight that.
- **`AskUserQuestion` belongs in core `commands/*.md`** under an `# INTERACTION` section. AWOS targets Claude Code only, so the tool is a framework default rather than a host-specific customization — don't duplicate it into the `claude/commands/*.md` wrappers.
- **Prefer `AskUserQuestion` over plain prose for every fixed-choice ask, not just the interview.** The `# INTERACTION` bullet ("instead of plain text or numbered lists") states the rule, but it's easy to break in the `PROCESS` body: "list the spec directories and ask the user to choose" is a numbered-list question wearing prose, and a proceed/stop or keep/drop/merge decision is a two-to-three-option `AskUserQuestion`, not a sentence. `flow.md` is the reference — its interview, re-run reconciliation, and reuse tradeoffs are all `AskUserQuestion` calls. Reserve plain prose for interactions with no discrete options to enumerate: a hard stop with a single next action, a non-blocking recommendation the command then proceeds past, or open-ended "review this and tell me what to change".
- **Do not hard-wrap markdown prose at 80 columns.** Let paragraphs and list items flow as a single line per logical unit. Markdown renderers reflow soft-wrapped text, and 80-col wrapping inflates diffs when prose is edited. Wrapping is fine only where the line is semantically a single token (a URL, a code identifier) or inside a fenced block whose literal line breaks matter.
