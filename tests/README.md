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
├── e2e/                            # Layer 4: session-log E2E (human-triggered)
│   ├── session-reader.js           # JSONL parser + findSessionsForCwd
│   ├── session-reader.test.js      # parser unit tests (runs in CI)
│   ├── expect.js                   # assertion DSL for scenario assert.js
│   ├── fixtures/                   # hand-crafted JSONL for parser tests
│   └── scenarios/                  # one directory per E2E scenario
└── helpers/
    ├── frontmatter.js              # minimal YAML-frontmatter parser, no deps
    ├── manifest.js                 # load + assert fixture manifests
    └── temp-project.js             # mkdtemp / copyTree / silenced helpers
```

Plus `bin/awos-e2e-prepare.js` and `bin/awos-e2e-verify.js` at the repo root drive Layer 4's prepare/verify cycle.

## Layer 1 — Static prompt linter

`tests/lint-prompts.test.js`. Reads markdown across `commands/`, `claude/commands/`, `templates/`, and `plugins/awos/skills/ai-readiness-audit/dimensions/` and asserts:

- **Wrapper symmetry.** Every `claude/commands/<name>.md` has a matching `commands/<name>.md`.
- **Wrapper include line.** Each wrapper contains either `@.awos/commands/<name>.md` (preferred) or the legacy `Refer to the instructions located in this file: .awos/commands/<name>.md`. Output logs the count of each form so F12 progress is visible.
- **Wrapper frontmatter schema.** Required keys defined in `tests/config/wrapper-schema.json`. Tighten this file (don't edit the test) as audit-driven contracts add new required fields.
- **Wrapper description matches root** (F18). Drift between a wrapper's `description` and the corresponding root command's `description` fails the suite.
- **Agent marker preservation.** `commands/tasks.md` (writer) and `commands/implement.md` (reader) both contain the literal `**[Agent: ` marker token.
- **XML scope-and-investigate snippets** (F8/F9). `commands/implement.md` contains `<scope_discipline>` and `<investigate_before_answering>`.
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

## Layer 4 — Session-log E2E (human-triggered)

`tests/e2e/` plus `bin/awos-e2e-prepare.js` and `bin/awos-e2e-verify.js`. Layers 1–3 catch structural regressions in prompt _source_; Layer 4 catches the failure mode they cannot — _Claude doesn't actually follow the prompt_. It parses the JSONL session log Claude Code writes under `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` and asserts on the tool calls Claude really made.

### Why it exists

A prompt that contains `**[Agent: ` somewhere in the source passes the static lint. That tells us the literal token is present; it does not tell us the LLM, given the prompt, will actually scan `.claude/agents/` before deciding which agent to assign. Layer 4 closes that gap by inspecting behavioral evidence.

### Not a CI gate

Each run requires a human in the loop (a real `claude` session inside a temp project). It is a **pre-merge checklist for prompt-touching PRs**, not part of automated CI. Only the parser unit test (`tests/e2e/session-reader.test.js`) runs through `npm test` — it asserts the parser against the checked-in fixture JSONL, which is enough to keep the harness itself honest.

### Running a scenario

```sh
# 1. Spin a fresh temp project, install AWOS into it, overlay the
#    scenario's fixture, and print the manual steps.
npm run e2e:prepare tasks-enumerates-agents

# 2. Open a new terminal, cd into the printed workdir, run `claude`,
#    and execute the slash command the instructions describe. Let it
#    finish.

# 3. Back in the original terminal:
npm run e2e:verify tasks-enumerates-agents <workdir>
# Exit 0 with a [pass] summary, or exit 1 with the recent tool-call
# trace and the specific contract that failed.
```

### Layout

```
tests/e2e/
├── session-reader.js              # JSONL parser + findSessionsForCwd
├── session-reader.test.js         # node:test unit tests against the fixture
├── expect.js                      # expectToolCall / expectNoToolCall / expectFileExists
├── fixtures/
│   └── sample-session.jsonl       # hand-crafted; exercises every event shape
└── scenarios/
    └── <scenario-name>/
        ├── INSTRUCTIONS.md        # rendered to the operator on prepare; {{WORKDIR}} is substituted
        ├── assert.js              # module.exports = async ({ events, toolCalls, workdir }) => { … }
        └── fixture/               # overlay on top of the installed AWOS tree
```

Currently shipped scenarios:

| Scenario                                | Target command       | Contract type            | What it asserts                                                                                                                                                                  |
| --------------------------------------- | -------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks-enumerates-agents/`              | `/awos:tasks`        | Discovery + output       | Scans `.claude/agents/` (Glob/Read/LS/Grep or Explore-delegation) and writes `tasks.md` with `**[Agent: name]**` markers that all resolve to real agent files                    |
| `implement-orchestrator-only/`          | `/awos:implement`    | Negative + delegation    | Delegates the coding via the `Agent` tool, never calls `Edit`/`Write`/`MultiEdit` on source files (checkbox flips on `tasks.md` are allowed), and carries the F8/F9 guard XML    |
| `architecture-builds-coverage-table/`   | `/awos:architecture` | Output + table semantics | Reads `product-definition.md` + `roadmap.md`, scans `.claude/agents/`, and writes a coverage table where the seeded specialist is `✅ Exists` and the absent one is `⚠️ Missing` |
| `tech-uses-parallel-reads-and-explore/` | `/awos:tech`         | Parallel calls + Explore | Reads `functional-spec.md` and `architecture.md` in the same assistant turn (parallel tool calls — proven via shared `assistantUuid`) and delegates exploration to `Explore`     |

### Adding a new scenario

The recipe:

1. Create `tests/e2e/scenarios/<name>/`.
2. Add a `fixture/` subtree — anything in it is overlaid on top of the installed AWOS tree during `prepare`. Seed only the pre-existing files the scenario needs (agents, partial spec docs, hand-authored CLAUDE.md, sample source files, etc.) — the installer's own output is already present.
3. Add `INSTRUCTIONS.md`. Use `{{WORKDIR}}` wherever you need the temp directory path; the prepare CLI substitutes it before printing.
4. Add `assert.js` as a CommonJS module exporting `async function run({ check, toolCalls, events, workdir })`. Use the helpers in `tests/e2e/expect.js`. Throw on failure with enough context for a human to act.
5. Wrap every assertion in `await check('what was verified', () => { ... })` so each one gets its own narrated pass/fail line. The harness streams them; "N events found" is not narration.

Smoke-test by running `e2e:prepare`, finishing a session in `claude`, and running `e2e:verify`. If you want to dry-run without burning an API call, stub a session log under `~/.claude/projects/<encoded-workdir>/sess-fake.jsonl` and run verify directly.

### Constraints

Same as the other layers — no npm dependencies, cross-runtime (the parser and CLIs must work under both Node 22 and Bun), and assertion failures must be informative (include the trace tail, not just "expected X got nothing").

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
