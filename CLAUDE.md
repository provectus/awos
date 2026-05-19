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

The repo has a four-layer test suite under `tests/`, all built on Node's `node:test` built-in — no npm dependencies. See `tests/README.md` for the detailed reference and the inventory of current scenarios.

1. **Static prompt linter** (`tests/lint-prompts.test.js`) — symmetry, frontmatter, marker presence, cross-references, dimension DAG, copy-table consistency, and grep-style checks for required substrings inside prompt bodies.
2. **Installer unit tests** (`tests/installer/*.test.js`) — exercises the installer services against temp directories.
3. **Fixture projects** (`tests/fixtures.test.js` + `tests/fixtures/<name>/`) — real installer runs against representative pre-install trees, with manifest-based assertions.
4. **Session-log E2E** (`bin/awos-e2e-{list,prepare,verify}.js` + `tests/e2e/scenarios/<name>/`) — human-triggered. `prepare` seeds a temp project from a scenario fixture; the user runs the relevant slash command in their own Claude Code session; `verify` parses the session JSONL at `~/.claude/projects/<encoded-cwd>/<session>.jsonl` and asserts on the actual tool-call trace Claude produced.

Layers 1–3 plus the Layer-4 parser unit test run in CI (`npm test`). Layer-4 scenarios run pre-merge by a human; they are not a CI gate.

### Pick the lowest layer that can express the contract

| Contract type                          | Layer | Cost          | Example                             |
| -------------------------------------- | ----- | ------------- | ----------------------------------- |
| Surface area (file/string/frontmatter) | 1     | free, instant | "wrapper has key X"                 |
| Installer mechanics                    | 2     | free, instant | "migration is idempotent"           |
| End-state of an install                | 3     | free, instant | "tree matches manifest"             |
| Claude's runtime behavior              | 4     | one human run | "Claude called Tool X with input Y" |

Layers 1–3 verify the source-of-truth files are wired correctly. They cannot verify Claude follows the wiring at runtime — only Layer 4 can. A typical full coverage story for one contract uses both: Layer 1 asserts the prompt mentions the required pattern; Layer 4 asserts Claude actually acted on it.

### Tests must narrate what they checked

Output that says `N events found` or `M pass` tells you the suite ran, not what was validated. Tests should produce output a human can read top-to-bottom and understand which contracts were verified.

- **Layer 1 lint tests** — `assert.*` failure messages name the contract being violated, not just dump a diff.
- **Layer 4 scenarios** — each assertion is wrapped in `await check('what was verified', () => { ... })` from `tests/e2e/expect.js`. Each becomes a streamed `✓` (or `✗` with error excerpt) line, with a final `N/M checks passed` summary. Any existing scenario under `tests/e2e/scenarios/` is a reference shape.

### Adding tests for new contracts

When a change introduces a contract — frontmatter key, structural marker, migration, required tool-call pattern in a slash command — its test ships in the same PR. Pick the lowest layer in the table above that expresses the contract. Behavioral contracts ("Claude must call X") add a Layer-4 scenario; the static counterpart often also lives at Layer 1 (assert the prompt mentions X). Coverage tracks contracts, not narrative.

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
