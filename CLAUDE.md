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
npm test                   # Layers 1–3 + the Layer-4 parser unit test
npm run test:lint          # Layer 1 — static prompt linter
npm run test:installer     # Layer 2 — installer unit tests
npm run test:fixtures      # Layer 3 — fixture-project end-to-end
npm run test:e2e           # Layer 4 plumbing — session-log parser unit test
bun test tests/            # local cross-runtime sanity check (optional)

# Layer 4 — session-log behavioral E2E (human-triggered, real Claude Code):
npm run e2e:prepare <scenario>             # seed a temp project; prints workdir
# (open `claude` in that workdir, run the /awos:* command, exit)
npm run e2e:verify <scenario> <workdir>    # parse session log, assert behavior

# Test installer against a separate project (pick one runner; $AWOS_REPO is the absolute path to this repo):
cd ~/some-scratch-project
npx $AWOS_REPO/index.js
bunx $AWOS_REPO/index.js
bun $AWOS_REPO/index.js          # direct exec also works
npx $AWOS_REPO/index.js --dry-run   # preview only
```

The installer runs on **Node 22+ or any recent Bun**. It uses only standard JS built-ins (`fs`, `path`) via CommonJS `require`, which both runtimes support — do not add npm dependencies or runtime-specific APIs without strong justification, as that would break cross-runtime compatibility.

## Testing

The repo has a four-layer test suite under `tests/`, all built on Node's `node:test` built-in — no npm dependencies. See `tests/README.md` for the detailed reference.

1. **Static prompt linter** (`tests/lint-prompts.test.js`) — wrapper/root command symmetry, frontmatter schema, agent-marker presence, slash-command cross-references, audit-dimension DAG, `setup-config.js`-to-source-tree consistency, and substring checks for required prompt patterns (e.g. `.claude/agents/` references in subagent-enumerating commands, XML verification snippets in `implement.md`).
2. **Installer unit tests** (`tests/installer/*.test.js`) — exercises `src/services/file-copier.js`, `src/migrations/runner.js`, and `src/core/setup-orchestrator.js` against temp directories.
3. **Fixture projects** (`tests/fixtures.test.js` plus `tests/fixtures/<name>/{before/, expected-after.json}`) — each fixture represents a real-world install scenario (fresh, existing-awos, mid-workflow, pre-migration) and asserts the post-install tree against a manifest of `{ exists, sha256, contains, unchanged }`.
4. **Session-log E2E** (`bin/awos-e2e-{prepare,verify}.js` + `tests/e2e/scenarios/<name>/`) — human-triggered. `prepare` seeds a temp project from the scenario fixture; the user runs the relevant `/awos:*` command in their own Claude Code session; `verify` parses `~/.claude/projects/<encoded-cwd>/<session>.jsonl` and asserts on the actual tool-call trace Claude produced.

Layers 1–3 plus the Layer-4 parser unit test run in CI (`npm test`, non-blocking — see `.github/workflows/quality-check.yml`). Layer-4 scenarios are run pre-merge by a human (no CI gate; they need a live Claude Code session).

### Static vs. behavioral coverage

Layers 1–3 verify that the source files are wired correctly — wrappers exist, frontmatter is valid, the installer copies the right tree. They cannot verify that Claude follows the wiring at runtime. Layer 4 closes that gap: it asserts on the actual tool calls Claude made, recovered from the session log on disk. For example, Layer 1 can assert that `commands/tasks.md` contains the string `.claude/agents/`; only Layer 4 proves that Claude actually issued `Glob`/`Read` against that path during a real `/awos:tasks` run.

Pick the lowest layer that can express the contract. Static checks are free and instant; behavioral checks cost a human run.

### Tests must narrate what they check

Output that says `N events found` or `7 pass` tells you the suite ran, not what was validated. Both lint tests and E2E scenarios should produce output a human can read top-to-bottom and understand which contracts were verified.

For Layer-4 scenarios, wrap each assertion in `await check('what was verified', () => { ... })` from `tests/e2e/expect.js`. Each becomes a streamed `✓` (or `✗` with error excerpt) line in the verify output, with a final `N/M checks passed` summary. The scenario at `tests/e2e/scenarios/tasks-enumerates-agents/assert.js` is the reference shape — copy it when building a new scenario.

For Layer-1 lint tests, the `assert.deepEqual`/`assert.ok` failure messages should name the contract explicitly (e.g. `"commands/${file} must reference '.claude/agents/' as the subagent discovery source"`), not just dump the diff. Anyone debugging a red CI run shouldn't have to open the test source to understand what broke.

### Rule for new structural or behavioral contracts

Any PR that introduces a contract — wrapper frontmatter key, `agent-template.md` schema field, XML tag inside a prompt, migration, required tool-call pattern in a slash command — must ship its test in the same PR. Surface-area contracts go to Layer 1. Mechanical contracts (installer behavior, migration idempotency) go to Layer 2 or 3. Behavioral contracts ("Claude must actually call X") go to a Layer-4 scenario. Coverage tracks contracts, not the audit proposal in the abstract.

## Architecture: The Two-Folder Customization Model

The installer copies files into **two destination folders** with different semantics — this is load-bearing for the whole UX:

| Source             | Destination              | Semantics                                         |
| ------------------ | ------------------------ | ------------------------------------------------- |
| `commands/`        | `.awos/commands/`        | Framework internals. Overwritten on every update. |
| `templates/`       | `.awos/templates/`       | Framework internals. Overwritten on every update. |
| `scripts/`         | `.awos/scripts/`         | Framework internals. Overwritten on every update. |
| `claude/commands/` | `.claude/commands/awos/` | Thin wrappers. User-editable customization layer. |

Each file in `claude/commands/{name}.md` is a tiny wrapper that points at `.awos/commands/{name}.md`. Users add custom instructions in the wrapper without losing them on update. When you add a new command, you must add both the full prompt in `commands/` AND a wrapper in `claude/commands/`. The copy table is defined in `src/config/setup-config.js`.

## Architecture: Document-Centric Workflow

AWOS is **spec-driven** — all project state lives in markdown files under `context/` in the user's project, not in chat history. An AI agent can rehydrate full context by reading the files alone. The canonical flow (each command is a markdown prompt under `commands/`):

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

The plugin uses an **auto-discovery** architecture: each audit dimension is a standalone `.md` file in `plugins/awos/skills/ai-readiness-audit/dimensions/` with YAML frontmatter declaring `name`, `severity`, and `depends-on`. The orchestrator builds a dependency DAG, groups dimensions into phases, and runs each dimension in its own context window via the `dimension-auditor` agent (`plugins/awos/agents/dimension-auditor.md`). Adding a new dimension is a single-file change — no other registration needed.

When bumping plugin behavior, update version numbers in **both** `.claude-plugin/marketplace.json` and `plugins/awos/.claude-plugin/plugin.json`.

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
- **Project-local agents come from `.claude/agents/*.md`** — read them directly. Plugin-provided agents (recognized by the `<plugin-name>:` prefix in `subagent_type`, e.g. `python-development:python-pro`) only appear in the Agent tool's description block; read them there. Don't introspect the Agent tool to discover agents that are already on disk.
- **Prefer the built-in `Explore` and `Plan` subagents** for read-heavy context-gathering. Don't have an orchestrator command read the whole codebase in its own context.
- **Skip ceremonial preambles** like "Great!", "I will now…", "All done!" — modern models trim them naturally and AWOS prompts shouldn't fight that.
- **`AskUserQuestion` belongs in core `commands/*.md`** under an `# INTERACTION` section. AWOS targets Claude Code only, so the tool is a framework default rather than a host-specific customization — don't duplicate it into the `claude/commands/*.md` wrappers.
