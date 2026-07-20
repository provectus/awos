# AWOS test suite

A three-layer safety net that catches structural regressions in AWOS prompts and installer behavior at PR time. Built on Node's `node:test` built-in — **zero npm dependencies**. Runs identically under `node --test` (CI primary) and `bun test` (local cross-runtime sanity).

## Why this exists

AWOS distributes markdown prompts that users install into their projects. Prompts and the installer share several silent contracts — task markers, file paths, frontmatter fields, dimension DAGs, copy semantics — and a typo or rename in one prompt can break a downstream user's `/awos:implement` run a week later, with no PR-time signal. This suite asserts those contracts so future prompt edits get caught before they ship.

What it does **not** do: validate prompt _behavior_ (does the LLM actually do the right thing when run?). That requires an LLM in the loop and an API budget; we rely on the scratch-project smoke test described in the root `CLAUDE.md` for that.

## Running the suite

```sh
# Primary path (Node 22+, what CI runs)
npm test

# Per-layer
npm run test:lint        # Layer 1
npm run test:installer   # Layer 2
npm run test:fixtures    # Layer 3

# Local cross-runtime sanity check
bun test tests/
```

CI runs `npm test` under Node 22 in `.github/workflows/quality-check.yml` (non-blocking initially; flip to required after two consecutive green PR runs).

## Layout

```
tests/
├── README.md                       # this file
├── lint-prompts.test.js            # Layer 1: static prompt linter
├── config/
│   └── wrapper-schema.json         # which wrapper frontmatter fields are required
├── installer/                      # Layer 2: installer unit tests
│   ├── file-copier.test.js
│   ├── migration-runner.test.js
│   └── setup-orchestrator.test.js
├── fixtures.test.js                # Layer 3: harness for example projects
├── fixtures/                       # Layer 3: example projects
│   ├── fresh-project/
│   ├── existing-awos-v0/
│   ├── customized-wrapper/
│   ├── mid-workflow/
│   └── pre-migration-v1/
└── helpers/
    ├── frontmatter.js              # minimal YAML-frontmatter parser, no deps
    ├── manifest.js                 # load + assert fixture manifests
    └── temp-project.js             # mkdtemp / copyTree / silenced helpers
```

Behavioral end-to-end tests (real `claude` sessions, session-log parsing) live in the separate **`awos-qa`** repository.

## Layer 1 — Static prompt linter

`tests/lint-prompts.test.js`. Reads markdown across `commands/`, `claude/commands/`, `templates/`, and `plugins/awos/skills/ai-readiness-audit/dimensions/` and asserts:

- **Wrapper symmetry.** Every `claude/commands/<name>.md` has a matching `commands/<name>.md`.
- **Wrapper include line.** Each wrapper contains either `@.awos/commands/<name>.md` (preferred) or the legacy `Refer to the instructions located in this file: .awos/commands/<name>.md`. Output logs the count of each form so the migration to `@`-import is visible.
- **Wrapper frontmatter schema.** Required keys defined in `tests/config/wrapper-schema.json`. Tighten this file (don't edit the test) when new wrapper-frontmatter contracts are added.
- **Wrapper description matches root.** Drift between a wrapper's `description` and the corresponding root command's `description` fails the suite — the slash-command palette shows the wrapper's text, so it has to stay in sync with the canonical one.
- **Agent marker preservation.** `commands/tasks.md` (writer) and `commands/implement.md` (reader) both contain the literal `**[Agent: ` marker token — this is how the orchestrator extracts each task's specialist assignment.
- **XML scope, investigate, skills, and completion-evidence snippets.** `commands/implement.md` contains `<scope_discipline>` (don't over-engineer), `<investigate_before_answering>` (don't hallucinate), `<use_available_skills>` (apply matching project/user/plugin skills), and `<completion_evidence>` (completion claims cite fresh command output; a test the subagent writes is proven with RED validation). The first three pass into the delegated subagent prompt verbatim; `<completion_evidence>` is tailored per task — evidence requirement always, RED validation instantiated concretely only when the task writes a test.
- **Verification-before-completion reflex.** `templates/agent-template.md`, `commands/implement.md`, and `plugins/awos/templates/implement-feature-template.md` all carry the evidence-cited completion rule and the RED-validation fail-first test proof, with the vocabulary joined to the literal "RED validation" wording in `commands/tasks.md`'s testing slice. `agent-template.md` names the sanctioned evidence forms mirroring `commands/verify.md` (browser-automation + screenshots to `docs/screenshots/` for UI; curl/shell/log/database/MCP otherwise) and makes the tests opt-out explicit (evidence stays required in another form; RED validation goes inert). The `<completion_evidence>` block is tailored per delegation (see the snippet bullet above) and, together with the feature template's spot-check, honors `<!-- skip-tests: true -->`.
- **`Agent()` invocation example.** `commands/implement.md` and `commands/tech.md` both show an explicit `Agent(subagent_type=..., ...)` call so the delegation step is concrete, not just described.
- **`INTERACTION` section in every core command.** Every `commands/*.md` declares its own `# INTERACTION` section that names `AskUserQuestion`. Wrappers must _not_ duplicate that rule — AWOS targets Claude Code only, so the tool is a framework default, not host-specific customization.
- **Subagent discovery (filesystem + plugins).** `commands/tasks.md`, `commands/tech.md`, and `commands/hire.md` reference both `.claude/agents/` (project-local, parsed via frontmatter) _and_ the `Agent` tool's description block (plugin-provided agents, recognized by the `plugin-name:` prefix on `subagent_type`).
- **`agent-template.md` cues skills application.** The body of `templates/agent-template.md` instructs spawned agents to apply the skills listed in their frontmatter — without this, `/awos:hire`'s skill-attachment work is inert at run time.
- **`context/product/hired-agents.md` rename pinned.** The `/awos:hire`-owned coverage report is referenced at its post-rename path; no prompt still references the legacy `context/product/agents.md`.
- **Slash-command cross-references.** Every `/awos:<word>` mentioned in any prompt resolves to a real `commands/<word>.md` (or the plugin path for `/awos:ai-readiness-audit`).
- **Dimension DAG.** Every dimension under `plugins/awos/skills/ai-readiness-audit/dimensions/*.md` has required frontmatter, `name` matches its filename, severity is in the allowed set, `depends-on` entries resolve to real dimension names, and the graph topologically sorts (no cycles).
- **`context/...` path consistency.** Cross-prompt path references are mutually reachable — if two prompts read the same path, at least one writer of it must exist.
- **`setup-config.js` ↔ source-tree consistency.** Every `copyOperation.source` directory exists; every top-level source directory matching `^(commands|templates|scripts|claude)/` is referenced by exactly one `copyOperation`.

Cost: ~30 ms. Catches roughly 80 % of structural regressions on its own.

## Layer 2 — Installer unit tests

`tests/installer/*.test.js`. Exercises `src/services/file-copier.js`, `src/migrations/runner.js`, and `src/core/setup-orchestrator.js` against `fs.mkdtemp()` temp directories. Only Node built-ins, only public exports of the installer modules — no monkey-patching.

- **`file-copier.test.js`**
  - Fresh install lands every source file at its declared destination.
  - Synthetic `commands/synth-test.md` is auto-discovered (validates "no `setup-config.js` edit needed when adding files inside an existing tree").
  - Wrapper overwrite behavior pinned to current code (`.claude/commands/awos/*.md` _is_ overwritten on update). Comments in the test point at the open §11 docs-vs-code question; flip the assertion when that's resolved intentionally.
  - Dry-run honesty: `dryRun: true` produces zero filesystem changes.
- **`migration-runner.test.js`**
  - Migration 001 is idempotent (run twice, second run is a no-op).
  - `skip_if_any` triggers on already-migrated state and reports `already_applied`.
  - Migration version meta-test: every JSON under `src/migrations/` has a unique version, no gaps, no duplicates.
  - Dry-run does not touch disk.
- **`setup-orchestrator.test.js`**
  - End-to-end `runSetup({ workingDir, packageRoot })` against a temp dir completes without throwing.
  - Re-running on an existing install is idempotent on the on-disk side.

Cost: ~50 ms.

## Layer 3 — Example fixture projects

`tests/fixtures.test.js` is a harness that runs once per directory under `tests/fixtures/`. For each fixture:

1. Make a fresh `fs.mkdtemp()` temp dir.
2. If the fixture has a `before/` subtree, copy it into the temp dir.
3. Run the real installer (`runSetup({ workingDir, packageRoot: repoRoot })`).
4. Load `expected-after.json` and assert the resulting tree matches the manifest.

Each `expected-after.json` lists files with one or more of: `{ exists, sha256, contains, unchanged }`. Files not listed are not asserted — fixtures are deliberately selective.

Currently shipped fixtures:

| Fixture               | Scenario                                                    | What it pins down                                                                                        |
| --------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `fresh-project/`      | Empty project                                               | Full install layout: `.awos/commands/`, `.claude/commands/awos/`, `context/`, `.awos/.migration-version` |
| `existing-awos-v0/`   | Stale `.awos/commands/architecture.md` from a prior install | Framework internals always get the latest content (overwritten)                                          |
| `customized-wrapper/` | User-customized `.claude/commands/awos/architecture.md`     | Pins the current always-overwrite behavior; see the §11 open question in the plan                        |
| `mid-workflow/`       | Populated `context/spec/001-test-feature/*.md`              | Installer never touches user spec work                                                                   |
| `pre-migration-v1/`   | `.claude/agents/python-expert.md` at the pre-v1 path        | Migrations 001 + 002 land cleanly and the version file reads `2`                                         |

Adding a new fixture: create `tests/fixtures/<name>/`, optionally with a `before/` subtree, plus an `expected-after.json` manifest. The harness picks it up automatically.

Cost: ~65 ms for all five.

## Behavioral end-to-end tests live in the `awos-qa` repo

Static lint catches "prompt mentions X"; only running the real LLM catches "Claude actually did X". That second class of test lives in the separate **`awos-qa`** repository, sibling to this one. It drives a Claude Code session against a seeded scratch project and parses the resulting session log to assert on the tool-call trace.

It's intentionally a separate repo so prompt-author iteration here doesn't pull in the behavioral-test surface area, and so awos-qa can grow other test types (perf, evals, integration) without coupling them to AWOS's release cycle.

## Adding tests for new contracts

The rule (also in the root `CLAUDE.md`): **any PR that introduces a new structural contract must ship its test in the same PR.**

- New wrapper frontmatter key → add it to `tests/config/wrapper-schema.json`.
- New required marker in a prompt → add a `test('marker preserved', …)` to `tests/lint-prompts.test.js`.
- New migration in `src/migrations/` → add an idempotency + skip-semantics test to `tests/installer/migration-runner.test.js`. If user wrappers or agents are rewritten, add a fixture under `tests/fixtures/` that exercises a representative pre-migration tree.
- New copy operation in `src/config/setup-config.js` → the consistency check in Layer 1 will fail unless the matching source directory exists; the fixture suite picks up the new destination automatically once any fixture asserts a file under it.
- New audit dimension → Layer 1's DAG check picks it up automatically; just make sure the frontmatter is complete.

## Constraints (don't break these)

- **No npm dependencies.** AWOS's installer is dep-free for cross-runtime portability. Tests inherit that constraint.
- **Cross-runtime compatible.** Same files must run under both `node --test` and `bun test`. Avoid Node-only APIs Bun lacks.
- **Tests assert today's code as truth.** If a test fails after a code change you didn't intend to make, fix the code, not the test. If you intentionally changed a contract, update the test in the same commit and explain why in the message.
