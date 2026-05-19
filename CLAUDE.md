# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

# Test installer against a separate project (pick one runner):
cd ~/some-scratch-project
npx /Users/aleksandrmakarov/code/awos/index.js
bunx /Users/aleksandrmakarov/code/awos/index.js
bun /Users/aleksandrmakarov/code/awos/index.js          # direct exec also works
npx /Users/aleksandrmakarov/code/awos/index.js --dry-run   # preview only
```

There is no test suite. The installer runs on **Node 22+ or any recent Bun**. It uses only standard JS built-ins (`fs`, `path`) via CommonJS `require`, which both runtimes support — do not add npm dependencies or runtime-specific APIs without strong justification, as that would break cross-runtime compatibility.

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
- **Don't introspect the Agent tool** to enumerate subagents — its descriptions are the dispatch mechanism, read them directly from `.claude/agents/*.md`.
- **Prefer the built-in `Explore` and `Plan` subagents** for read-heavy context-gathering. Don't have an orchestrator command read the whole codebase in its own context.
- **Skip ceremonial preambles** like "Great!", "I will now…", "All done!" — modern models trim them naturally and AWOS prompts shouldn't fight that.
- **`AskUserQuestion` is Claude-Code-only.** Mention it only in `claude/commands/*.md` wrappers, never in core `commands/*.md`, since other agentic tools don't have it.
