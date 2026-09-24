# AWOS 2.0 Roadmap

- **Author:** Daria Garanina
- **Created:** 2026-09-18
- **Status:** Draft, pending team review
- **Role:** the plan for AWOS 2.0 — what gets built, in what order, gated on what, and which decisions are still open. The principles it serves are in [Philosophy](../philosophy.md), [Direction](../direction.md), and [Rationale](../rationale.md); each item names the principle (§N) or direction it advances, and when two directions pull against each other, toward agreement wins. Decision points (D-N) carry a recommendation, not a decision.

---

## Where 2.0 lives

AWOS 2.0 is the release in which the `better` commands have become the core commands; every release before it is 1.x. Until then the `better` plugin hosts the updated commands, and a core command retires when its `better` version is beta (Phase 5).

The way to 2.0 is through experiments that define what 2.0 is, not through items that patch the current gaps one by one — patching spreads the team thin. This roadmap adds no items for fixing current gaps. Experiments run on the HOPS project.

---

## Phase overview

| Phase | What                                                                                                              | Depends on                                      | Gate                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0     | Preparation — flow, roadmap, brownfield removed; philosophy adopted; prior-agreements lane in flight              | —                                               | Done except three merges (#200, awos-qa #51, #205) and the lane evaluation                       |
| 1     | Implement — one command that splits the work, implements it, and verifies the result; verify first; hire reworked | Phase 0                                         | `better:implement` benchmarked against `/awos:implement` on the profiler's criteria; D-7 decided |
| 2     | Memory — an experiment: can memory-based context, in a solution of the team's own, replace the Product Definition | Phase 0                                         | Team review of the results; if the memory infrastructure is not viable, investment stops         |
| 3     | BetterSpec — the seam contract, proven on `better:spec`: what every `better` command emits and honours            | Phase 0                                         | `sources.md` dissolved; contract in templates and lint; `better:spec` release                    |
| 4     | Foundation experiment — does the path need `/product` and `/architecture`, and in what shape                      | Phase 2 review, for the Product Definition half | Team review of the results; each document kept, reworked, or dropped                             |
| 5     | Switch the path — installer and docs point at `better`; core commands retire; release CI/CD                       | Phases 1 and 3 in beta; Phase 4 reviewed        | A newcomer following the README reaches the `better` flow and nothing else                       |
| 6     | Audit stack retirement, and with it the marketplace machinery it justified                                        | External successor audit passes beta            | Timing depends on another repository                                                             |

Implement (with the hire rework) and Memory come first, next to each other, right after Phase 0. Everything else — BetterSpec, the `architecture` review, the sources revisit, CI/CD — sits below them; nothing is dropped. Phase 0's remaining work overlaps with both.

---

## Phase 0: Preparation

Done on the PR #200 branch: `/awos:flow`, `/awos:roadmap`, and the brownfield subsystem are removed; `/awos:product` is interview-only; `/awos:architecture` gathers the codebase unconditionally and confirms drift item by item in Update Mode; the user-file policy is adopted; the philosophy documents are on `main`. Kept on purpose: `/awos:hire` (reworked in Phase 1) and the AI-readiness audit (retires in Phase 6, not marked deprecated before then). What remains to remove, and when:

| Candidate                                                                                                       | Disposition                                                                        | Where              |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------ |
| Core `spec`, `tech`, `tasks`, `implement`, `verify`, `product`, `architecture`                                  | Graceful shutdown, each when its `better` version reaches beta or Phase 4 drops it | Phase 5            |
| `configure-external-sources` skill + `context/sources/` conventions                                             | Dissolved into host-tool introspection                                             | Phase 3, item 3.1  |
| `hire`                                                                                                          | Reworked under D-7; retires only if D-7 removes it                                 | Phase 1            |
| AI-readiness audit, `standards-refresh`, engine, `dist/`, marketplace machinery                                 | Deleted when the external successor passes beta                                    | Phase 6            |
| Multi-host residue (`.github/copilot-instructions.md`, Cursor/Copilot pointers in `docs/testing-strategies.md`) | Deleted — principle 10                                                             | Phase 5 docs sweep |
| Three plugin version lines                                                                                      | Collapse as plugins leave                                                          | Phases 5–6         |

### 0.1 Prior agreements

- **Scope.** PR #205 adds a research lane to `/better:spec` over earlier specs, ADRs and decision records, commit messages, and test assertions; each finding closes with an `intact | changed | unclear` verdict, and `changed` and `unclear` become supersession markers the human answers before code. Evaluation runs on complex features, from-scratch services, and single-purpose One Health microservices; criteria: adherence to the original requirements, assumptions added, clarifying questions asked. Results go in a dated evaluation note under `docs/2.0/`. Owner: Rail. Serves §2, §3, §8.
- **Decision point D-3 — separate lane or merged.** (a) Keep the fourth lane as in #205. (b) Merge its retrieval into the codebase lane and keep the verdict rule and the `[prior]` label. (c) Build (b) and measure both on the same repositories. Recommendation: (c), with a bias to (b) if it holds — the smaller-surface regression is the extra agent, not the extra label. Until decided, #205 is the working version.

**Exit.** PR #200 merged as a 1.x minor; awos-qa PR #51 merged; PR #205 merged as the working version; the evaluation note published and D-3 decided. Owners: Daria (merges), Rail (evaluation).

---

## Phase 1: Implement

**Goal.** One command that breaks the work into tasks, implements them, and verifies the result — `/awos:tasks` + `/awos:implement` + `/awos:verify` merged — and does not consider the work done until it has checked it against the agreement. Serves §4 and §5 and the fidelity direction; collapses three commands to one (smaller-surface direction).

**Scope.** The minimum is one command that splits, implements, and verifies. Whether that is one workflow or a command that spawns the separate steps is an open implementation choice. The verify rework comes first. The technical spec step is out of scope: it works, no redesign needed. The hire rework belongs here, next to `better:implement`, not at the switch.

### 1.1 Verify

- **Start here.** Verification checks the acceptance criteria against the software's real behaviour — not that the documents were updated, not that tests exist.
- **Design.** Verification is the loop's exit criterion, not a separate command: each work unit is checked against the criteria it named as it completes, and the whole is checked against the agreement — acceptance criteria, Out-of-Scope, and the confirmed technical decisions and assumptions. A failed criterion becomes a work unit, not a chat message. A criterion `awos` cannot check gets a distinguishable "could not check" mark and is put to the human. One check, not three. Acceptance-level proof of the agreement stays; ownership of the team's regression suite, RED-validation prescriptions, the `docs/screenshots/` convention, and tooling-install asks leave the command (§4: code quality in general belongs to the host).

### 1.2 One command

- **Shape.** _Split_ — derive work units from the tech spec; assign agents by introspecting the `Agent` tool's description block; surface a staffing gap as an open question. _Run_ — delegate by path (paths plus verbatim work-unit text, never re-authored bodies — the measured fidelity leaks followed re-authoring); each unit names the criteria it realizes; a subagent's question is a first-class return value the orchestrator puts to the human or turns into a marker the run stops on. _Verify_ — as 1.1. _Remember_ — the last step moves the spec to `Completed`; what it writes back (the product and architecture documents today, memory if the experiment holds) follows the Phase 2 review.
- **Standing constraints.** The orchestrator never edits code; below the worth-specifying threshold the host's plan mode is the boundary (§11); #209's guardrails (no specialist re-delegation, command hygiene, one full-suite run) are design inputs.
- **Decision point D-4 — is the split a confirmation moment?** (a) Internal: the spec and tech spec are the agreement and the human confirmed those. (b) Reviewable: the plan is shown, with a derived view, before the run. Recommendation: (a) by default, (b) behind a flag — the plan is the wrong artifact to gate; the agreement direction's regression is "more content to review without more decisions to make".
- **Decision point D-5 — how the run reports.** (a) Chat only. (b) A `run.md` in the spec directory: units, agents, criteria checked, evidence, marks. Recommendation: (b), with a derived view rendered from it (§5: "where it cannot make sure, it says so").
- **Decision point D-6 — the `**[Agent: name]**`convention without`tasks.md`.** (a) Carry it into `run.md`. (b) Drop it; agent choice is the orchestrator's and is reported, not pre-recorded. Recommendation: (b) unless D-4 chooses (b).
- **Benchmark.** Judge `better:implement` against `/awos:implement` on the 1.4 criteria with the profiler, on the same specs. Fidelity first.

### 1.3 Technical spec

Out of scope: the step works and needs no redesign. What the seam contract asks of `better:tech` — reading the spec's status and markers, opening `research-notes.md` — sits with the contract (3.10).

### 1.4 Profiler and benchmark criteria

- **Instrument.** The `profiler` plugin (PR #210, merged): `/profiler:implement` reads the session transcripts and reports per-agent wall time, turns, tokens, thinking share, delegation chains, hangs, and agents running on the orchestrator's model.
- **Criteria, in order of weight.** _Fidelity_ — acceptance criteria met on the first verification pass, criteria that rested on an unresolved marker, rework units after verification (§1 judges by outcome, §4 by fidelity; time and tokens are means). Then _wall time_ and _tokens_ per run. Then _hangs and delegation depth_. Without fidelity a faster, cheaper run that builds the wrong thing scores well.
- **Decision point D-2 — where the profiler lives.** It ships in the awos marketplace today. Recommendation: move it to awos-qa when Phase 5 collapses plugins — it is a maintainer instrument, not part of the method's surface.

### 1.5 Agent model and effort

- **Landed.** PR #207 (merged): generated agents carry `model: sonnet` and `effort: low`, host-native frontmatter; `awos-recruitment#94` adds `effort` to the registry schema. PR #209 (merged): `disallowedTools: Agent` so specialists cannot re-delegate, plus command-hygiene and one-suite-run rules. A prompt instruction cannot control the host's reasoning budget; the frontmatter fields can (§10).
- **Next.** Measure their effect with the profiler as the first benchmark run, so the `better:implement` work starts from a known baseline. #207 assumes hire stays — if D-7 removes hire, the template moves with whatever replaces it.

### 1.6 Hire rework

- **Starting point.** Hire stays until an integrated approach exists where the model hires the needed agents itself. The repo already picks agents by introspecting the `Agent` tool's description block in tech, tasks, and implement; `context/product/hired-agents.md` is read by no command. The general-purpose fallback triggers when no _installed_ agent covers a task — installing agents is what hire does. The design question is "who installs agents and when", not "who reads the file".
- **Decision point D-7 — hire's fate.** (a) Hire stays a foundation step with a `better:hire` version. (b) `better:implement` hires on demand: when the split finds no installed agent for a unit, it queries the recruitment MCP, proposes the agent, and installs on confirmation; hire as a command retires. (c) Hire leaves the path; recruitment is documented as host tooling the team sets up itself (§9). Recommendation: (b) — it removes a foundation step (smaller surface), keeps the human's confirmation on what gets installed (agreement), answers the staffing gap on the path rather than beside it, and makes the installer's unconditional MCP registration unnecessary. Owner: Rail (recruitment) with whoever owns `better:implement`.

### 1.7 awos-qa Phase B

Phase A (awos-qa PR #51, open) retires the scenarios the Phase 0 removals invalidated; 41 remain. Phase B — recorded runs — lands with `better:implement`'s beta, not before. Owed: `/better:spec` with an empty prompt under `AWOS_UNATTENDED` stops, writes nothing, asks nothing; `/awos:architecture` Update Mode surfaces each drift item as a confirmation question; the staffing-gap question and the general-purpose fallback named in the report, written against `better:implement`; the installer upgrade through migration 003 with a `/awos:roadmap` call hitting the removal notice; the product TUI rewrite and the headless-product retire-or-repurpose call.

**Exit.** The verify rework landed first; `better:implement` in beta; one baseline profiler run recorded and the benchmark note published; D-4, D-5, D-6 decided; D-7 decided and the hire rework in beta under its choice; awos-qa Phase B merged.

---

## Phase 2: Memory

**Goal.** An experiment, not a committed feature: test whether memory-based context can replace the Product Definition. The memory solution is the team's own — M0 was considered and dropped as not what the method needs. The Product Definition's removal is pending the experiment's results. Serves §8 and the memory direction; §2 (what cannot be found is an open question, never a guess) is the check on it. Today the flow never writes back what shipped: after verification it tells the human which command to run, and the product definition is never enriched by a shipped feature.

Three streams, run in parallel:

### 2.1 Infrastructure

Design and build the team's own memory solution: how it is deployed, how the data is stored and laid out. Owner: Rail.

### 2.2 Agent integration

How the agent writes to memory and reads from it. Owner: Daria.

### 2.3 Knowledge organization

What to store; how to structure it, condense it, and reference it so the agent knows which part of memory to use for a given question. Owner: unassigned.

### 2.4 Specs in memory

The experiment: store functional specs in memory. An outdated spec is either not stored or marked historical, so early and late specs do not contradict each other.

**Open questions.** Will the agent actually use memory? Will the context volume cause hallucinations? How are references structured?

- **Decision point D-9 — memory and sources, one story or two.** Recommendation: two, with a shared home. _Memory_ is what the project knows about itself; _sources_ is where the project's knowledge lives outside the repo; the flow writes the first and only reads the second. Where memory lives follows the experiment's result.

**Exit.** The team reviews the results. If the memory infrastructure is not viable, investment stops and the approach is rethought. The Product Definition decision, and with it the product half of Phase 4, follows the review.

---

## Phase 3: BetterSpec and the seam contract

**Goal.** Fix what every command on the path emits and honours — so the `better` commands are built against a contract instead of retrofitted — and prove it on `better:spec`, the one `better` command that exists. BetterSpec stays a standalone item: it has value on its own — better acceptance criteria, even with the current implement — but sources and knowledge-base access are fixed first (3.1). Serves §3, §2 and §7, §6, §5, and the fidelity direction.

**Why the seam.** `/better:spec` produces the richest agreement in the repo, and every signal in it — the confirmation, the markers, the provenance, the verifier's residuals — is dropped at the boundary to the next command. `better:implement` (Phase 1) is built before this contract exists; when the contract lands, its verify reads the agreement the seam records instead of the raw spec.

### 3.1 Sources revisited

- **First.** Sources and knowledge-base access are fixed before the rest of this phase; the spec's knowledge-base lane depends on it.
- **Problem.** The rigidly structured `sources.md` is useless for the model and sometimes confuses it; `/better:spec`'s knowledge-base lane and `/awos:architecture`'s retrieval are gated on it; the skill that writes it lives in the audit plugin.
- **Design.** Two different jobs. Which tools are connected is the host's knowledge — every `better` command introspects it at runtime; a hand-written manifest of it is the discovery direction's named regression. What each tool is _for_ here, and where the non-tool sources live (a Slack channel, a runbook, a person), is project knowledge and belongs in the project's documents in plain prose (§8). Delete `configure-external-sources` and `context/sources/` in the same release (user copies of `sources.md` are never touched). The knowledge-base lane reads ticket and communication sources, not documentation only; until this lands, lift the category filter on the existing manifest.
- **Decision point D-8 — location and shape.** (a) One plain-text "Knowledge sources" section in `product-definition.md`. (b) Two sections split by consumer: "Where intent lives" in `product-definition.md` (read by `better:spec`'s research lanes) and "Where operations live" in `architecture.md` (read by `better:implement`'s agents). (c) A separate file. Recommendation: (b) — it matches who reads what and adds no file; if Phase 4 later drops one of the two documents, its section moves to whatever survives, or to (c). Owner: unassigned.

### 3.2 Confirmation status

- A `Status` vocabulary the flow actually writes and reads: `Draft` (written, not yet put to a human) → `Confirmed` (a human said yes, in-session or asynchronously) → `Completed` (verified against the agreement). `better:spec` writes `Draft` and moves to `Confirmed` when the post-write review is answered; `better:tech` and `better:implement` refuse a `Draft` spec unless an explicit override is passed. The templates lose `In Review | Approved`. Asynchronous shape: an unattended run ends by opening a PR that carries the spec and tech spec; approving that PR is the confirmation.
- **Decision point D-1 — where the confirmation is recorded.** (a) A `Status` field in the spec's header, as today. (b) A sidecar file per spec directory that also records who confirmed and what was open. Recommendation: (a) — one document, one source of truth (§6).

### 3.3 Marker vocabulary

One marker convention across all five `better` commands — the `[NEEDS CLARIFICATION: …]` form — with one rule for consumers: a command that reads a document carrying an unresolved marker resolves it with the human, carries it forward explicitly, or refuses to proceed; it never builds over it silently. One unattended contract for every `better` command: `AWOS_UNATTENDED` skips interviews, never resolves a marker, and never proceeds past a `Draft` gate. Foundation documents record which sections were interviewed, gathered with evidence, or assumed. Written into the templates, pinned by lint.

### 3.4 Provenance in the source

Provenance becomes part of the markdown spec (a per-requirement source tag and a "Decisions" section), and `render-spec.mjs` derives the review page from the markdown alone — no view-model file — so any command that edits or verifies the spec can regenerate the page.

### 3.5 Repo gates

Flip the `test` CI job to blocking; extend the lint scope to `plugins/better/**`; add a lint contract per item in 3.2–3.4 as it lands. The engine job stays non-blocking until Phase 6 removes it. §5 applied to ourselves.

### 3.6 Verifier completeness and residuals

Give `spec-verifier` the product definition and the research findings as a second input and two more questions: did every finding land in a requirement or get explicitly dropped, and does the spec contradict the product definition. Run it once more after the post-write edits. Write residuals into the spec as markers.

### 3.7 Open questions on the review page

An "Open questions" section first on the page; the page regenerated from the markdown (3.4) by any command that edits or verifies the spec.

### 3.8 Update Mode in `better:spec`

An Update Mode with the same rigor as creation — the prior-agreements lane runs against the amendment, the change is confirmed, the Change Log records why. The amended spec returns to `Draft` for the affected criteria so `better:implement` reopens them.

### 3.9 Egress consent and the web lane

The web lane sits behind the same consent posture as the knowledge-base lane and artifact publishing, and is skipped when the brief is marked internal or when comparable-product research cannot move the outcome (§1). The gate is a one-time project setting, not a per-run question.

### 3.10 `better:tech` and the seam

The technical spec step itself is out of scope (1.3); this is only what it must honour once the contract exists. `better:tech` opens by reading the spec's status and markers — a `Draft` spec stops it, an unresolved marker is resolved or carried forward, never built over. It reads `research-notes.md`. It writes first and confirms after, honouring the unattended contract. Where it must choose without evidence it writes a marker, not an `**Assumption:**`.

**Exit.** `sources.md` dissolved and D-8 decided; templates carry the status and marker vocabulary and `better:spec` is the first command to emit both; lint pins them; the review page derives from markdown alone and shows open questions; verifier and Update Mode shipped; web-lane consent in place; `better:tech` honours the seam; `test` CI job blocking; `better` plugin version bumped as one commit.

---

## Phase 4: Foundation experiment

**Goal.** An experiment questioning the usefulness of `/awos:product` and `/awos:architecture`: does the path need the documents they write, and if so, in what shape. Phase 2 already tests whether memory replaces the Product Definition; this phase puts the same question to both foundation documents and to the commands that produce them. The outcome per document is one of three: kept as is, reworked as a `better` version, or dropped. Serves §2, §8, §10 and the discovery and smaller-surface directions.

**What is at stake today.** `product-definition.md` is written from an interview and read by `better:spec` as ground truth. `architecture.md` is written from an unconditional codebase gather, confirmed drift by drift in Update Mode, and read by tech and implement. Both share the same weaknesses: unanswered or unevidenced sections become best-practice assumptions rather than open questions, the confirmation moment is raw markdown, and documentation retrieval is gated on `sources.md`.

### 4.1 `/awos:product`

Follows the Phase 2 review: if memory replaces the Product Definition, the command goes with it. If the document stays, the rework is: interview-only stays; unanswered sections become markers, not assumptions; a derived view at confirmation; a "Where intent lives" section (3.1) naming the ticket, chat, and document sources `better:spec` should read; the status vocabulary, so `better:spec` can tell a confirmed product definition from a draft.

### 4.2 `/awos:architecture`

The question is whether the codebase gather and the drift confirmation earn their place on the path, or whether `better:spec`'s codebase lane and `better:implement`'s agents find what they need without a maintained document. If the document stays, the rework is: keep the gather and drift mechanics; an unevidenced choice is a marker, not a default (3.3); sections record interviewed / gathered / assumed; a derived view at confirmation (3.4); doc retrieval by host-tool introspection (3.1); the hire pointer follows D-7; the document becomes the home of _operational_ knowledge sources (3.1) — where implementers look when debugging.

**Exit.** The team reviews the results and decides per document: kept, reworked, or dropped.

---

## Phase 5: Switch the path

**Goal.** This phase _is_ the AWOS 2.0 release: the `better` commands become the core commands, a newcomer following the README reaches them and nothing else, the old core commands retire gracefully, and the release process is automated. The `major` label is used here and nowhere before. Serves the smaller-surface direction and §10.

### 5.1 Onboarding and installer

The installer installs the `better` plugin as the path; README, `docs/commands/`, and every next-command pointer are rewritten around the `better` commands; the upgrade guide gains the 2.0 command table.

- **Decision point D-10 — plugin or core.** Decided: the `better` commands become the core commands under `.awos/commands/` and the plugin retires; that event is the AWOS 2.0 release. Open: whether the installer installs the plugin during 1.x (via the marketplace it already registers) or 1.x users are pointed at `/plugin install` by the README. Recommendation: the installer installs it.

### 5.2 Core command retirement

Each core command retires when its `better` version is beta, under the user-file policy: awos deletes only what it wrote and the user never touched, and anything carrying user intent is preserved and surfaced. The local body becomes a removal notice pointing at the `better` command; pristine wrappers are rewritten; customized wrappers and all `context/` content are preserved. One migration per retirement wave; `--dry-run` validated; idempotent. The per-file table lives in the upgrade guide, `docs/2.0/upgrading-1.x.md`.

### 5.3 Hire and the installer

D-7 is decided in Phase 1. Whatever the choice, the installer's unconditional `awos-recruitment` MCP registration ends here: under (b) `better:implement` asks to connect it when first needed; under (a) hire registers it on first run; under (c) it is documentation.

### 5.4 Release and test automation

Blocking tests (3.5); plugin version pins checked in CI against the marketplace as a blocking job; a release job that publishes the plugin versions alongside the npm package so the marketplace never lags the tag; the awos-qa behavioural suite triggered on a `better` command change (needs a Claude runtime in CI — _assumption_: a token is available to the org; if not, awos-qa stays a manual pre-release gate); the Phase 1 profiler benchmark run against a fixed fixture spec on each `better:implement` change, so a regression in fidelity or wall time is visible in the PR. awos-recruitment's own CI is out of scope; if D-7 chooses (b), the MCP's search contract becomes an interface `better:implement` depends on and gets a contract test here.

### 5.5 Docs and multi-host residue

Delete `.github/copilot-instructions.md`; strip Cursor and Copilot pointers from `docs/testing-strategies.md`; rewrite the README's promise around agreement, not autonomy; every `docs/commands/*.md` page describes the `better` command's actual behaviour.

**Exit.** Fresh install → README → `better` flow with no detour; core commands answer with the notice; D-10's open half decided; release CI publishes package and plugins together.

---

## Phase 6: Audit stack retirement

Last. **Gate: the successor audit, developed in its separate repository, has passed beta.** Delete `plugins/awos/skills/ai-readiness-audit/`, `agents/repo-auditor.md`, `standards-refresh`, `tools/ai-readiness-audit/`, `dist/`, the engine scripts, devDependencies, and CI jobs; retire the now-empty `awos` plugin and the marketplace machinery and its installer step. The audit is not marked deprecated before then. Its Spec-Driven-Development dimension still scores a 2.0 project down for following 2.0 (it expects `roadmap` and `context/product/roadmap.md`); that rides until this phase, and is reopened as one fix if the successor slips past Phase 5.

**Successor-audit requirements** (owned by the successor repository): narrative claims mechanically traceable to check evidence (#157); an applicability model with "can't determine" and deployment context (#158); a per-ecosystem fixture matrix, Maven multi-module first (#159); orchestration-root / multi-repo topology as first-class (#172); attribution as an unscored descriptor, if anywhere (#173); BDD suites first-class and a pyramid check that SKIPs rather than PASSes on unclassifiable trees (#176); one definition of "project file" plus coverage-report dedup (#179); the measured-or-not MTTR decision owned by a single function (#186).
