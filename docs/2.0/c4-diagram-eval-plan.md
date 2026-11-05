# Evaluating C4 Diagrams in AWOS Specs — Pre-Registered Eval Design

**Status:** Historical record — the program this plan pre-registered completed on 2026-10-14 (three campaigns; verdicts in the dated results notes, synthesis in `c4-diagram-evidence.md`). The design decisions below were locked in a review session on 2026-10-12, before any campaign run; amendments made before the relevant data existed are marked inline and dated. This document is kept verbatim as the pre-registration the results notes cite.
**Date:** 2026-10-12
**Relates to:** the C4 diagram proposal — specifically its falsifiability claims (fewer hallucinated integrations, fewer out-of-scope edits, less drift), which this plan turns into a runnable experiment. The resulting case is summarized in `c4-diagram-evidence.md`.

## The question

The C4 proposal claims that adding Context/Container diagrams to `architecture.md` and optional Component diagrams to technical specs improves downstream agent work: fewer hallucinated integrations, fewer out-of-scope edits, less drift across the `tasks → implement → verify` chain. The counter-position raised in review is that the diagrams may not improve AWOS output quality at all — they may just be decoration that costs tokens.

This plan describes a minimal, repo-native eval that produces hard numbers for that disagreement, designed for a **skeptical reader**: pre-registered decision rules, raw per-run tables published with the verdict, and an explicit second-fixture plan if the first result is positive.

## What already exists in this repo (and what we reuse)

We do not need new infrastructure categories. Three mechanisms in the repo already solve most of the problem:

1. **The audit QA harness** (`tools/ai-readiness-audit/qa/`) already does provenance-tagged headless `claude -p` runs: it measures tokens/duration/turns from the final `stream-json` `result` event into `run-meta.json`, archives each run, takes a machine-wide run lock, and ships a comparison script. The C4 eval harness follows the same patterns — but, unlike the audit harness, it needs **no marketplace repoint and no global state at all**: AWOS commands are project-local files, so every run is confined to a scratch copy.
2. **Fixture projects** (`tests/fixtures/`) already model "a user project in a known state". The eval adds one new, larger fixture (see below) in the same directory.
3. **The no-dependency script + `node:test` pattern** (`plugins/profiler/scripts/profile-implement.mjs` + `tests/profiler-script.test.js`) is the model for the eval scripts: plain `.mjs`, zero npm dependencies, deterministic logic unit-tested against canned inputs in the real on-disk shape.

**On Nix:** not recommended. The repo's deliberate stance is "Node 22+ or Bun, standard built-ins, no npm runtime deps"; the eval's only external dependency is the `claude` CLI, and the variance that matters (model version, CLI version) is not something Nix can pin — the harness pins the model explicitly and records versions in `run-meta.json`. A `flake.nix` would be new contributor surface area that isolates the wrong layer. Isolation is instead achieved per-run: scratch copies outside the repo, no global configuration touched (see "Isolation" below).

**On `claude plugin eval`:** Claude Code ships a native plugin eval runner (`claude plugin eval`, with `/skill-doctor` reporting). It was evaluated hands-on for this campaign (Claude Code 2.1.272) and the "Tooling decision" section records the verdict: right tool for small per-prompt regression checks later, wrong shape for this A/B/C campaign. The metric extractors are plain Node modules either way, portable between runners.

## Experimental design

### Conditions (arms) — all three run in one campaign

| Arm                      | Context documents                                                                                                                    | Answers                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| **A — baseline**         | `architecture.md` + `technical-considerations.md` as today: prose + tables only                                                      | status quo                                                       |
| **B — diagrams**         | Same documents plus the proposal's C4 sections (Mermaid flowchart, Context + Container; Component in tech)                           | the product question: does the proposal improve outcomes?        |
| **C — prose-equivalent** | Same documents plus the **same information as B's diagrams**, rendered as a textual edge list, mechanically derived from B's Mermaid | the mechanism question: is it the _diagram_ or the explicitness? |

Why C runs now and not "later if B wins": the proposal's ask is specifically _diagrams_. Without C, a positive B result supports "add an explicit edge list" just as well as "add C4 Mermaid", and the skeptic's strongest reply — "you just added information" — goes unanswered. B−C is the notation effect; C−A is the information effect.

**Content-matching rules (both mechanical):**

- Arms A and B are identical except that B appends the diagram sections — B's prose is not otherwise improved.
- Arm C is **script-generated from B's Mermaid source** by a committed parser (`tools/c4-evals/mermaid-edges.mjs`): nodes, edges, and labels become deterministic sentences ("gateway-api → order-queue: publishes shipment events"). C's text is committed alongside B, and a unit test asserts the committed C regenerates byte-identically from B — information-equivalence is checkable by reading a ~50-line script, not by trusting anyone's prose.

**Diagram provenance:** the B-arm diagrams are drawn once per the proposal's conventions, frozen in the fixture, and — before run 1 — verified against the fixture source (every box and edge corresponds to real code; nothing real at that zoom level omitted), with the sign-off recorded in the fixture's README. _Amendment 2026-10-12 (pre-data, before any campaign run): the original rule required a second maintainer who did not author the diagrams; the maintainer decided a single-maintainer sign-off suffices for this phase. The independence loss is noted as a limitation in the results note if phase 1 is positive._ The eval measures the effect of accurate diagrams being _present_; the agent's ability to _draw_ them is a separate, later eval, and hand-authored diagrams being a best case is acknowledged in "Threats to validity".

### The fixture: one longer-running example

Small fixtures won't show a difference — on a two-file project the agent holds the whole system in context anyway. The eval needs a fixture where structural reconstruction is actually expensive:

- **`tests/fixtures/eval-c4-multiservice/`**: a synthetic project, **modeled on failure sites observed in a real pilot project** (the proposal's evidence source), with 3–4 containers (an HTTP API, a queue worker, a shared library, two file-backed datastores), ~45–65 source files, and real inter-service call sites. Plain Node/CommonJS with zero npm dependencies, so its test suite runs under `node --test` with no new toolchain. Scaffolded by an agent, with **hand-placed structural traps**: two same-named modules with different purposes in different containers, a store-choice trap (data that belongs in one store, not its similarly-named sibling), publish/consume direction stated only ambiguously in the prose docs, and an unwired legacy module as out-of-scope bait.
- A completed AWOS `context/` tree: `product-definition.md`, `architecture.md` (arm variants), and one frozen functional spec for a feature that **crosses container boundaries** (shared model + worker computation + API endpoint), so scope discipline is testable.
- The fixture ships a **test suite that fails until the feature is correctly implemented** — the single most objective quality metric.
- Plus two grader manifests: `symbols.json` (every real service/module/endpoint identifier, generated by a committed script, regenerated when the fixture changes) and `scope.json` (the files/directories the spec legitimately touches).
- The fixture is **committed byte-identical**, not generated on demand: every campaign must see exactly the same input, and a generator script is one more thing that can drift between campaigns.

Synthetic beats cloning a real OSS repo: committable, licensing-clean, stable under upstream drift, and the structural traps sit exactly where we want them.

### The task under eval

One run = the per-feature chain executed against a scratch copy of the fixture, as **two separate `claude -p` sessions**:

```
session 1:  /awos:tasks       (from the frozen functional spec + tech spec)
session 2:  /awos:implement   (fresh session, reads tasks.md from disk)
```

Two sessions, not one: each AWOS command running in a fresh session that rehydrates from `context/` is the framework's whole premise, and it is the honest test of the drift claim — in one shared session the implement stage remembers the tasks reasoning, which masks exactly the drift diagrams are supposed to prevent. The diagrams must carry structure across a genuine context boundary.

`/awos:spec` and `/awos:tech` stay frozen as fixture inputs in phase 1 — varying them would confound the measurement. A later phase can unfreeze `/awos:tech` to measure whether the agent _produces_ good Component diagrams.

**The review step, simulated:** `/awos:implement` refuses a `tasks.md` still carrying the `<!-- not-user-reviewed -->` marker (correctly — a human reviews the plan between the two commands). The eval has no human in that loop, so the harness strips the marker between the sessions, identically for every arm. This means the eval measures the unreviewed-plan path; plan quality differences between arms flow into the implement stage unfiltered, which is the honest setting for a diagrams-help-the-chain claim.

**Question handling:** under headless `-p` a clarifying question ends the turn. The harness auto-replies **once** per session with a fixed text ("Proceed with your stated recommendation") and continues — a single question is normal AWOS behavior and shouldn't zero out a run, but it still counts against the arm (metric 4). A second question marks the run **stalled**. The auto-reply is identical for all arms.

### Account, model, and isolation

- Runs use the team's default **Claude Code subscription account** (how AWOS runs by default), not an API key. Consequence: the `total_cost_usd` in stream-json is notional, so **dollars are not a metric — tokens are** (they are what the subscription meters, and they're model-price-independent).
- Model pinned via `--model` to the versioned Sonnet ID **`claude-sonnet-5-5`** (what the pilot project actually runs implement with — external validity beats cheapness; the `sonnet` alias is not acceptable, it floats). The harness additionally records the **resolved** model string from each session's init event plus the CLI version in `run-meta.json`, so the published result carries the exact model even if the ID re-points. The published result states the effect is measured on Sonnet only.
- **Isolation — nothing outside the branch and the scratch dirs is touched:** scratch fixture copies live in `$TMPDIR/c4-eval-runs/` (fully outside the repo — the installer is run from this checkout **into the scratch copy**, never inside this repo, per `CLAUDE.md`); run archives are copied back into gitignored `tmp/` for comparison; every session runs with `--strict-mcp-config`; no marketplace repointing, no `settings.json` mutation, no global state of any kind. The logged-in account's own config is used as-is (a fresh `HOME` would break subscription auth).
- The machine-wide run lock pattern from the audit harness applies: one campaign at a time.

### Metrics — graded per stage

Per run, extracted deterministically from (a) the saved `stream-json` transcripts, (b) the resulting `tasks.md`, (c) the git diff of the scratch copy (the harness `git init`s the scratch copy before session 1), and (d) a post-run execution of the fixture's own test suite. The grader separates **tasks-stage** and **implement-stage** metrics from the same run, so if chain variance swamps the signal, a phase-1.5 implement-only rerun needs no redesign.

| #   | Metric                            | Definition                                                                                                                                                                                                                                                                                                                                        | Direction        |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | **Fixture tests pass**            | run `node --test` in the scratch copy after implement; record pass/fail counts                                                                                                                                                                                                                                                                    | higher is better |
| 2   | **Hallucinated references**       | references (imports, calls, endpoint paths, file paths, service/module names) in `tasks.md` and the diff that **fail to resolve against the post-run tree** (fixture symbols ∪ whatever the run itself created). New code naming new things it also creates is fine; naming a service, queue, or endpoint that exists nowhere is a hallucination. | lower            |
| 3   | **Out-of-scope edits**            | changed files outside `scope.json`                                                                                                                                                                                                                                                                                                                | lower            |
| 4   | **Clarifying questions / stalls** | `AskUserQuestion` events + harness auto-continuations; a run needing a second continuation is stalled                                                                                                                                                                                                                                             | lower            |
| 5   | **Tokens / duration / turns**     | summed across both sessions from each final `result` event (`usage`, `duration_ms`, `num_turns`); tokens are the cost metric, wall-clock is reported but does not gate                                                                                                                                                                            | lower            |
| 6   | **Tasks↔implement drift**         | tasks in `tasks.md` whose named files/components don't correspond to what the diff actually touched                                                                                                                                                                                                                                               | lower            |

All metrics are fully programmatic — **no LLM judge in v1**, so the numbers are beyond dispute. Every extractor is unit-tested against canned transcripts/diffs in the real on-disk shape (the `tests/profiler-script.test.js` pattern: drift in the format fails loudly).

### Trials and schedule

- **n = 10 runs per arm** (30 total), **strictly interleaved A/C/B** so no arm ever runs ahead of the others. If a subscription usage-limit pause hits, it hits all arms equally — the interleaving, not the calendar window, is what protects comparability, so the campaign may legally span several days. Timestamp + model string recorded per run.
- Runs are serial (shared rate limit; comparable durations). Budget roughly a few days of background wall-clock and a meaningful bite of the account's usage limits; phase 0 (fixture + graders) costs nothing.

### The pre-registered decision rule

Written down before the first run; this section is the registration.

**Pairwise comparison rule** (applied to B vs A, B vs C, C vs A): the "better" arm must show, over 10 runs each:

- **≥ 2 more fixture-test-passing runs out of 10**, OR **≥ 30% reduction in mean hallucinated references with no decrease in passing runs**;
- AND **total tokens regression ≤ 15%** (mean of in+out tokens).

**Readout table:**

| Outcome             | Interpretation                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **B > A and B > C** | Notation effect — the diagram itself helps. Adopt C4 Mermaid per the proposal.                                                               |
| **B > A but B ≈ C** | Information effect — explicitness helps, Mermaid doesn't. Adopt explicit structure text; diagrams become a humans-only, optional convention. |
| **B ≈ A**           | Agent-side claim falsified (regardless of C). The proposal downgrades to "useful for humans, optional for agents" — its own stated fallback. |

Softer metrics (questions, drift, out-of-scope edits) are reported in full but do not gate; if only they move, the result is "mixed — iterate on the convention", matching the proposal's own pilot decision tree.

Report **per-metric mean ± sd and the full per-run table**. At n=10 per arm, an effect that needs a significance test to be visible is not an effect worth changing templates for; the distributions are published and speak for themselves.

**Verdict destination:** a dated results note under `docs/2.0/` (this repo's evaluation-note convention) stating **which readout branch fired**, with the raw tables attached. The verdict is input to a human decision (the proposal's own Week-3 decision step) — nothing auto-triggers. The meeting argues about what to do, not about what the data said.

## Implementation shape

```
tools/c4-evals/
  run-eval.mjs         # one arm, one run: copy fixture to $TMPDIR scratch → git init →
                       #   swap in the arm's context docs → run installer from this checkout
                       #   into the scratch → claude -p "/awos:tasks", then a fresh
                       #   claude -p "/awos:implement" → run fixture tests → archive + run-meta.json
  grade-run.mjs        # pure extractors: transcripts + tasks.md + diff + test results → metrics.json
  compare-arms.mjs     # aggregate N runs per arm → per-metric table (markdown + json) +
                       #   the pre-registered readout branch
  mermaid-edges.mjs    # Mermaid flowchart → deterministic edge-list text (generates arm C)
  README.md            # how to run, usage-limit note, pointer to the decision rule in this doc
tests/fixtures/eval-c4-multiservice/
  project/             # the fixture tree: source, tests, context/ with arm-A docs
  arms/B/              # architecture.md + technical-considerations.md with C4 Mermaid
  arms/C/              # generated from B by mermaid-edges.mjs; committed; regeneration unit-tested
  symbols.json         # generated identifier manifest (committed; regeneration unit-tested)
  scope.json           # files/dirs the spec legitimately touches
  generate-symbols.mjs # manifest generator
  README.md            # fixture docs + the diagram-accuracy sign-off record
tests/c4-evals.test.js # unit tests: graders, mermaid parser, arm-C and symbols.json
                       #   regeneration byte-equality, readout logic, and "fixture feature
                       #   tests fail before implementation" (all zero-API-cost)
```

- All scripts are plain no-dependency `.mjs` (the profiler-script precedent), so the grader tests run in the repo's dep-free root test layer and the harness needs no build step.
- The eval harness, like the audit harness, is **developer tooling, not shipped product** — the installer copy table is untouched.
- CI runs only `tests/c4-evals.test.js`. Campaigns are run manually by a maintainer, like all behavioral checks in this repo — but each campaign leaves an archived, comparable, numbers-bearing record instead of an anecdote.

### Tooling decision: custom harness vs `claude plugin eval`

`claude plugin eval` was assessed hands-on (Claude Code 2.1.272; no public docs page yet, so details come from the embedded reference and `--help`). What it offers: per-case folders under `evals/` with a frontmattered `prompt.md`, built-in grader types (`regex`, `tool_used`, `tool_order`, `file_exists`, `llm`, `baseline`), per-case `runs`/`max_turns`/`timeout_seconds`, a sandboxed throwaway workspace with fresh `HOME`/`CLAUDE_CONFIG_DIR`, `--ablation none` to disable the default plugin-vs-no-plugin baseline arm, `--json` aggregate output, and `--max-cost-usd` ceilings — runnable in CI with `--trust-plugin`.

**Decision: run the A/B/C campaign on the custom harness; adopt `claude plugin eval` separately for small single-command behavioral checks.** Six concrete mismatches drive this:

1. **No multi-step chains.** There is no sequencing between cases, so the two-session `tasks → implement` protocol doesn't fit.
2. **Custom graders don't fit.** The unresolved-reference grader and the scope grader are arbitrary Node programs; the built-in grader set is regex/tool-pattern/LLM-judge. (`file_exists` also only sees files the agent _created_, not edits to existing ones.)
3. **AWOS ships through the installer, not the plugin.** A plugin-target eval doesn't give the fixture `.awos/` or `.claude/commands/awos/`.
4. **Non-interactivity is constrained.** Case `env` only accepts `EVAL_*` keys, and there's no equivalent of the harness's counted auto-continuation.
5. **Its sandbox breaks subscription auth.** The fresh `HOME`/`CLAUDE_CONFIG_DIR` is exactly what the subscription-account decision can't use.
6. **Unconfirmed per-run cost/token fields and no variance stats** — the stream-json `result` event gives all of this today.

What `claude plugin eval` _is_ good for here, as a follow-up: cheap regression guards on the winning convention — e.g. a 3-run case asserting `/awos:architecture` output contains a Mermaid block with the documented `classDef` conventions (a `regex` grader over `{source: file}`), or a `tool_used` grader pinning the implement orchestrator's delegation contract. Those belong in `plugins/awos/evals/` once the template change ships. (Before building those suites, verify two undocumented details with a single `--runs 1` case: the exact YAML shape of the `regex` grader's `target:` option, and the per-case token/cost/duration field names in `aggregate-result.json`.)

## Phasing

_(As planned; how it actually unfolded is in the dated results notes — phase 1.5 was never needed, phase 2 became the MeterHub campaign, and a phase 3 with a calibration protocol was added by its own pre-registration, `2026-10-13-c4-eval-phase3-plan.md`.)_

1. **Phase 0 — graders + fixture** (no API/subscription cost): the fixture, manifests, arm documents, all four `.mjs` scripts, and their unit tests. A normal PR with normal CI. Gate before phase 1: the diagram-accuracy sign-off (originally a second maintainer; amended 2026-10-12, pre-data, to single-maintainer — see the amendment note in _Experimental design_).
2. **Phase 1 — A/B/C campaign**: 10 runs per arm, interleaved; publish the dated results note under `docs/2.0/` with the raw per-run table and the verdict against the readout table above.
3. **Phase 1.5 (contingency)** — if chain variance swamps the signal, rerun implement-only from a frozen `tasks.md` (the per-stage grading makes this a config change, not a redesign).
4. **Phase 2 (conditional)** — second fixture and/or a replication on an internal real project to strengthen generalization; unfreeze `/awos:tech` to eval diagram _generation_ quality.

## Threats to validity (acknowledged up front)

- **One fixture.** A result on one synthetic project generalizes weakly. Mitigation: the fixture's traps are modeled on failures observed in a real pilot project, and phase 2 replicates on a second fixture before any template change ships as "proven".
- **Hand-authored diagrams are a best case.** Real projects will have worse diagrams. Fine for this question — if even good, independently-verified diagrams don't move the numbers, the proposal falls; if they do, diagram _quality_ becomes the next eval.
- **Model drift.** Pinned versioned model, CLI version recorded, arms strictly interleaved within one campaign. Never compare runs across campaigns.
- **Diagram = more tokens of context.** Arm B's documents are strictly longer than A's — which is exactly what arm C controls for, and why tokens are part of the gate.
- **Subscription metering.** Token counts from `usage` are the comparison currency precisely because subscription dollars are notional; if the account tier changes mid-campaign, the interleaving keeps the comparison internally valid.
