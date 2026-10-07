# AWOS test suite

A safety net that catches structural regressions in AWOS prompts and installer behavior at PR time. Three layers live in this directory and are built on Node's `node:test` built-in with **zero npm dependencies**; `npm test` also runs the audit engine's TypeScript layer (`plugins/awos/skills/ai-readiness-audit/**/*.test.ts`, needs `npm ci` for `tsx`), described in the root `CLAUDE.md`. Runs identically under `node --test` (CI primary) and `bun test` (local cross-runtime sanity).

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

CI runs the three no-dependency layers as the blocking `test-core` job in `.github/workflows/quality-check.yml`; the full `npm test` (including the engine layer) runs alongside as the non-blocking `test` job until Phase 6 retires the engine.

## Layout

```
tests/
├── README.md                       # this file
├── lint-prompts.test.js            # Layer 1: static prompt linter
├── better-render.test.js           # Layer 1: plugins/better render-spec.mjs contracts
├── profiler-script.test.js         # Layer 1: plugins/profiler script against a synthetic session
├── config/
│   └── wrapper-schema.json         # which wrapper frontmatter fields are required
├── installer/                      # Layer 2: installer unit tests
│   ├── configurators.test.js
│   ├── file-copier.test.js
│   ├── migration-runner.test.js
│   ├── pattern-matcher.test.js
│   ├── prompt.test.js
│   └── setup-orchestrator.test.js
├── fixtures.test.js                # Layer 3: harness for example projects
├── fixtures/                       # Layer 3: example projects
│   ├── fresh-project/
│   ├── existing-awos-v0/
│   ├── customized-wrapper/
│   ├── mid-workflow/
│   ├── pre-migration-v1/
│   └── pre-migration-v2/
└── helpers/
    ├── frontmatter.js              # minimal YAML-frontmatter parser, no deps
    ├── manifest.js                 # load + assert fixture manifests
    └── temp-project.js             # mkdtemp / copyTree / silenced helpers
```

Behavioral end-to-end tests (real `claude` sessions, session-log parsing) live in the separate **`awos-qa`** repository.

## Layer 1 — Static prompt linter

`tests/lint-prompts.test.js`. Reads markdown across `commands/`, `claude/commands/`, `templates/`, `plugins/better/`, and the audit plugin's dimensions and references, and asserts structure.

**The rule: a lint test pins a token that two files must agree on, or a structure a grep can verify. It never pins a sentence.** A marker (`**[Agent: `, `<!-- not-user-reviewed -->`), a path (`context/product/hired-agents.md`), a frontmatter key, a heading a command jumps to, an ordering (the drift question comes after the Finalization write) — those are contracts, and when one breaks something downstream breaks with it. "Step 5 must say it fetches concurrently" is prose: rewording the sentence fails the test while deleting the step around it passes, and every prompt PR pays to re-pin its own wording. Behavioural claims ("Claude actually fetches concurrently") belong in `awos-qa`, or nowhere. Three pins are kept as **incident guards** by exception — `audit-core` is unconditional (Step 4), scoring runs as one engine pass, and no prompt invokes a bare `node dist/cli.js` — each tied to a recorded headless regression; add a fourth only with a dated incident next to it.

What it checks:

- **Wrapper ↔ command symmetry.** Every `claude/commands/<name>.md` has a `commands/<name>.md` and vice versa; each wrapper includes its body (`@.awos/commands/<name>.md` or the legacy "Refer to" line); wrapper frontmatter carries the keys in `tests/config/wrapper-schema.json` (tighten that file, not the test); wrapper `description` equals the body's; wrappers do not repeat the `AskUserQuestion` rule the body owns.
- **Tokens two commands share.** `**[Agent: ` (tasks writes, implement reads); `<!-- not-user-reviewed -->` and `<!-- skip-tests: true -->` (tasks writes, implement/verify read); `## Open Questions` + `**[Agent: general-purpose]**` (tasks writes, implement reports); `plugin-name:` and `.claude/agents/` in every agent-enumerating command; the explicit `Agent(subagent_type=…)` example in implement and tech; the `<scope_discipline>`/`<investigate>`/skills/evidence XML blocks in implement; the no-topic sentence core `spec.md` and `/better:spec` must share verbatim.
- **Paths and cross-references resolve.** Every `/awos:<name>` mention maps to a real command; `context/...` paths are spelled consistently; `context/product/hired-agents.md` is the only coverage-report path; `setup-config.js` source directories exist and every top-level framework directory is in the copy table; the `claude/commands` operation is `preserveOnUpdate`; `.claude/agents/` is never auto-populated; `templates/qa-context-template.md` is not bundled.
- **Template fields commands fill.** `functional-spec-template.md` carries `- **Topic:**` and `## Change Log`; `agent-template.md` has the expected frontmatter shape and `disallowedTools: Agent`, with `hire.md` enforcing it.
- **Structure under `claude -p`.** Every core command has an `# INTERACTION` section; no command gates its write on a user reply (negative regexes over all of `commands/`); architecture's drift `AskUserQuestion` sits after the Finalization write, its Creation Mode gather is an `Explore` delegation, and it never invokes `configure-external-sources`; `architecture.md` and `product.md` declare `$ARGUMENTS` inside `<user_prompt>`; `spec.md` has an Update Mode section.
- **Removal guards.** No prompt mentions `brownfield`.
- **Audit plugin structure.** Dimension frontmatter and the dependency DAG; every dimension check maps to a `standards.toml` category with matching `check_id`; `standards.toml` schema and prevention-coverage cluster metadata; `project-topology.md` lists every `topology.*` flag the standards use; `connector-shapes.md` documents every incidents field the collector defines; the `repo-auditor` agent and `spec-verifier` agent exist with valid frontmatter (the verifier restricted to `Read`); the TS engine scaffold is present; the three incident guards above.
- **Plugin version lockstep.** awos, better, and profiler: marketplace entry, `plugin.json`, and the `EXPECTED_*_VERSION` pin agree (bumping is a deliberate three-file commit). The profiler skill and script are wired together.
- **`/better:spec` tokens.** The paths, identifiers, and markers it must share with core (`AWOS_UNATTENDED`, `[NEEDS CLARIFICATION`, the core template and directory script, `research-notes.md`, `functional-spec.html`, `## Status: configured`, the `${CLAUDE_PLUGIN_ROOT}` renderer path, the `better:spec-verifier` subagent type, `--artifact`).

Cost: under 100 ms.

## Layer 2 — Installer unit tests

`tests/installer/*.test.js`. Exercises `src/services/file-copier.js`, `src/migrations/runner.js`, and `src/core/setup-orchestrator.js` against `fs.mkdtemp()` temp directories. Only Node built-ins, only public exports of the installer modules — no monkey-patching.

- **`file-copier.test.js`**
  - Fresh install lands every source file at its declared destination.
  - Synthetic `commands/synth-test.md` is auto-discovered (validates "no `setup-config.js` edit needed when adding files inside an existing tree").
  - Wrapper preservation pinned: existing `.claude/commands/awos/*.md` are left untouched under the non-interactive default, new wrappers still install, `--overwrite` forces a fresh sync.
  - Dry-run honesty: `dryRun: true` produces zero filesystem changes.
- **`migration-runner.test.js`**
  - Migration 001 is idempotent (run twice, second run is a no-op); `skip_if_any` leaves already-migrated state alone.
  - Migration 003 (roadmap shutdown) end-to-end: the local body becomes the removal notice (wrapper-only, body-only, and template-only footprints), the template is deleted, a wrapper byte-identical to any shipped 1.x version is rewritten (`replace_content` + `if_sha256`) while a customized one is preserved, and the `notice` is returned once and never on a rerun.
  - `replace_content` contracts: replace-only unless `create_if` authorizes a create; already-current content is a skip, so a version-marker-reset rerun reports zero applied; atomic temp-and-rename write; a dangling symlink at the target is replaced, not written through.
  - One `lstat` probe policy for preconditions and operations; missing `from`/`file`/`content` fields throw clean authoring errors.
  - Optional migrations, pinned with synthetic migrations via the injectable `migrationsDir`: a failure followed only by optional migrations warns and defers them all; a failure with a required migration queued behind it aborts the run.
  - Migration version meta-test: every JSON under `src/migrations/` has a unique version, no gaps, no duplicates; version assertions derive the expected number from the shipped files.
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

Each `expected-after.json` lists files with one or more of: `{ exists, sha256, contains, notContains, unchanged, changed }` (`changed` = exists and differs from `before/` — proof a step ran where bare existence would be tautological). Files not listed are not asserted — fixtures are deliberately selective.

Currently shipped fixtures:

| Fixture               | Scenario                                                    | What it pins down                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fresh-project/`      | Empty project                                               | Full install layout: `.awos/commands/`, `.claude/commands/awos/`, `context/`, `.awos/.migration-version`                                                                                                                                                                                                                                                                                                                                                           |
| `existing-awos-v0/`   | Stale `.awos/commands/architecture.md` from a prior install | Framework internals always get the latest content (overwritten)                                                                                                                                                                                                                                                                                                                                                                                                    |
| `customized-wrapper/` | User-customized `.claude/commands/awos/architecture.md`     | Pins wrapper preservation under the non-interactive default: existing wrappers untouched, new wrappers still installed                                                                                                                                                                                                                                                                                                                                             |
| `mid-workflow/`       | Populated `context/spec/001-test-feature/*.md`              | Installer never touches user spec work                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pre-migration-v1/`   | `.claude/agents/python-expert.md` at the pre-v1 path        | Migrations 001 + 002 land cleanly (old path empty, migrated subdir gone) and the version file exists — its exact number is asserted in `migration-runner.test.js`                                                                                                                                                                                                                                                                                                  |
| `pre-migration-v2/`   | Full pre-2.0 roadmap/hire footprint at migration version 2  | Graceful shutdown end-to-end for roadmap: migration 003 replaces the local command body with the removal notice and deletes the orphaned template, while the wrapper and the user roadmap stay byte-identical. Hire is current again, so its stale 1.x body and agent-template are overwritten by the copy step while the customized hire wrapper and the full `.mcp.json` (awos-recruitment entry already present) stay untouched; current commands still install |

Adding a new fixture: create `tests/fixtures/<name>/`, optionally with a `before/` subtree, plus an `expected-after.json` manifest. The harness picks it up automatically.

Cost: ~65 ms for all six.

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
