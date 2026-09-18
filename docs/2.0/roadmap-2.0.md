# AWOS 2.0 Roadmap

- **Author:** Daria Garanina
- **Created:** 2026-09-18
- **Status:** Draft
- **Role:** the plan for AWOS 2.0 — what gets built, in what order, gated on what, and which decisions are still open. The gaps it closes are named in [`gaps.md`](gaps.md); the principles it serves are in [Philosophy](../philosophy.md), [Direction](../direction.md), and [Rationale](../rationale.md). The preparation work this plan starts from was executed under a predecessor plan (`refactoring-roadmap.md`, deleted 2026-09-18 — its history is in PR #200); what it delivered is Phase 0 below, and the parts of it still in force are carried into this document (the user-file policy in Appendix A, the awos-qa owed list in 2.4, the successor-audit requirements in Phase 5).

**How to read this document.** Every statement carries one of four labels. **Fact** — verified in the repository, on GitHub, or in host documentation on 2026-09-18, with the source named. **Team** — a statement from the team sync of 2026-09-17 or a decision Daria recorded; treated as reliable input, not re-argued. **Proposal** — content this roadmap puts forward where the input brief had a gap; to be accepted, amended, or struck. **Decision point** — an open question with options and a recommendation; the roadmap carries it, it does not settle it. Assumptions are marked inline as _assumption_.

**The test every item passes.** Each item names the principle or direction it advances (Philosophy §N, or a direction's advancing test). An item that advances one direction and regresses another is kept only when the one it advances is "toward agreement" — that direction wins conflicts ([Direction](../direction.md)). Principle 10 (one host, natively) is a standing constraint on every item.

---

## Where 2.0 lives

**Team (2026-09-18).** AWOS 2.0 is the release in which the `better` commands have become the core commands. Until then, everything ships as 1.x: PR #200 is a 1.x release, not 2.0, and no release is called 2.0 while the method still lives in a plugin. AWOS 2.0 is built as updated versions of the core commands inside the `better` plugin. `/better:spec` exists; `better:product`, `better:architecture`, `better:tech`, and `better:implement` follow, each written to close the gaps its core predecessor carries. **`better:implement` is `tasks` + `implement` + `verify` in one command.** The core commands are the baseline the `better` versions replace; once a `better` version is beta, its core predecessor retires under the user-file policy (graceful shutdown — see Phase 4). Whether `hire` gets a `better` version is the open hire decision (Decision point D-7).

**Fact.** The plugin today: `plugins/better/` at version 0.1.1 — `commands/spec.md`, `agents/spec-verifier.md`, `scripts/render-spec.mjs`, README — installed by `/plugin install better@awos-marketplace` on top of a core install; the installer does not install it and the README does not mention it (`gaps.md` gap 23).

**Consequence for the old plan.** The predecessor plan's Phase 6B ("`better:spec` folds into core `commands/spec.md`") is reversed: the flow moves _into_ `better`, not out of it. Its Phase 6A (implement absorbs tasks and verify) survives as `better:implement`. Its Phase 7 items are distributed across Phases 1–3 below. Its Phase 8 (audit retirement) is Phase 5 here, unchanged.

---

## Phase overview

| Phase | What                                                                                                                                  | Depends on                                                | Gate                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0     | Preparation — flow, roadmap, brownfield removed; philosophy adopted; gap registry rebuilt; prior-agreements lane in flight            | —                                                         | **Done** except three merges (#200, awos-qa #51, #205) and the lane evaluation      |
| 1     | The seam contract, proven on `better:spec` — what every `better` command emits and honours, shipped first in the spec; how we measure | Phase 0 merged                                            | Contract in templates and lint; `better:spec` release; profiler merged              |
| 2     | `better:tech` and `better:implement` — the back half of the path as consumers of the spec                                             | Phase 1                                                   | `better:implement` benchmarked against `/awos:implement` on the profiler's criteria |
| 3     | Foundation and memory — `better:architecture`, `better:product`, sources revisited, the project remembers                             | Phase 2 (memory's write side lives in `better:implement`) | Post-verify absorption lands; `sources.md` dissolved                                |
| 4     | Switch the path — installer and docs point at `better`; core commands retire; hire decided; release CI/CD                             | Phases 1–3 in beta                                        | A newcomer following the README reaches the `better` flow and nothing else          |
| 5     | Retire the audit stack and, with it, the marketplace machinery it justified                                                           | External successor audit passes beta                      | Unchanged from the old Phase 8; timing depends on another repository                |

Phase 0's remaining work and Phase 1 overlap: the lane evaluation runs while the contract is written. Phase 2 must not start its `better:implement` design before Phase 1's contract is written and emitted by `better:spec` — it is the contract's main consumer.

---

## Phase 0 — Preparation (PR #200)

**Status: executed on the PR #200 branch; the PR is open, `minor` label (relabelled from `major` on 2026-09-18 — it is a 1.x release), MERGEABLE, 0 unresolved threads as of 2026-09-18.** The full record is PR #200 — its body, its commits, and the dispositions recorded on each PR and issue it closed. What it delivered, as facts:

- **Removed:** `/awos:flow` and its generated delivery commands; `/awos:roadmap`, its template, and the roadmap lane in both spec commands; the brownfield subsystem (detection, staging file, triage) — `/awos:product` is interview-only and `/awos:architecture` runs an unconditional codebase gather with drift confirmation in Update Mode.
- **Kept, deliberately:** `/awos:hire` (removal reverted 2026-09-17 — fate undecided, D-7); the AI-readiness audit (retires in Phase 5, not marked deprecated — do not re-propose); a compatibility read of a user-maintained `context/product/roadmap.md` as spec topic candidates, no sunset.
- **Policy:** the user-file policy (classes 1–3, graceful shutdown of retired commands via migration 003 with `if_sha256`-guarded wrapper rewrite and a one-time notice) — Appendix A. Every later retirement in this roadmap follows it.
- **Product is interview-only (decided 2026-09-10, follow-through 2026-09-14):** existing-codebase onboarding after the brownfield removal was resolved as a third shape — `/awos:product` reads no code; the codebase-as-intent-source duty relocated to `/awos:architecture`'s unconditional `Explore` gather (an existing stack becomes evidence-cited defaults confirmed in review), and its Update Mode re-gathers and confirms drift item by item (adopt / keep as recorded). The rejected options were a modeless gather inside product, and accepting the discovery regression outright. The regression was answered for the technology stack, not for product behaviour — `gaps.md` gap 1 and Phase 3.2 pick that up.
- **Housekeeping:** 14 PRs closed with principle and kernel comments; issues triaged 18 → 10; `docs/2.0/upgrading-1.x.md` written; awos-qa Phase A opened as awos-qa PR #51, pending merge (18 scenarios retired, 41 remain).
- **Philosophy:** `docs/philosophy.md`, `direction.md`, `rationale.md` are on `main` (PR #194 merged). `gaps.md` rebuilt from a blank page on 2026-09-17 and again on 2026-09-18 from a three-reviewer pass — 29 gaps, each with the `better` command that owns it.

**On the brief's Pillar 0 ("build the full removal list").** The list the brief asks for is already decided and mostly executed. What remains to remove, and when:

| Candidate                                                                                                       | Disposition                                                    | Where              |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------ |
| Core `spec`, `tech`, `tasks`, `implement`, `verify`, `product`, `architecture`                                  | Graceful shutdown, each when its `better` version reaches beta | Phase 4            |
| `configure-external-sources` skill + `context/sources/` conventions                                             | Dissolved into host-tool introspection                         | Phase 3, item 3.3  |
| `hire`                                                                                                          | Undecided (D-7)                                                | Phase 4            |
| AI-readiness audit, `standards-refresh`, engine, `dist/`, marketplace machinery                                 | Deleted when the external successor passes beta                | Phase 5            |
| Multi-host residue (`.github/copilot-instructions.md`, Cursor/Copilot pointers in `docs/testing-strategies.md`) | Deleted — principle 10                                         | Phase 4 docs sweep |
| Three plugin version lines                                                                                      | Collapse as plugins leave                                      | Phases 4–5         |

Nothing else on the repo qualifies as legacy: `scripts/create-spec-directory.sh`, the templates, and the installer are 2.0 infrastructure.

### 0.1 Prior agreements — the "feedback force" (Pillar 1)

- **Why in Phase 0.** This work predates the roadmap and is in flight — the PR is mergeable and the evaluation runs are under way — so it is preparation in the same sense as PR #200, not a new phase.
- **Team (sync).** Prototype exists; it checks the spec against intended requirements and past decisions — commit history, ADRs, tests — finds conflicting requirements and asks instead of passing silently. Tested on Advanced Services and a clean Transaction Service; 20–30 minutes per repository; token usage comparable to base. Next: complex features, services from scratch, single-purpose One Health microservices. Evaluation criteria: adherence to original requirements, added assumptions, clarifying questions about constraints. Owner: Rail. Open question: separate lane or integrate into existing lanes; concern that a separate lane is over-engineering.
- **Fact.** The prototype is PR #205 (Ralfidze, 2026-09-14): a fourth always-dispatched research lane over earlier specs, ADRs and decision records, commit messages, and test assertions; each finding closes with an `intact | changed | unclear` verdict judged in the lane; `changed` and `unclear` become supersession markers ranked just under conflicts; a lint contract confines the lane to decisions about behaviour, never conventions. Six headless runs reported; the verdict had to move from synthesis into the lane after two large-repo runs lost it. The PR's author offers to build the merged variant and compare.
- **Assessment against the directions.** Advancing: discovery ("a source of intent that awos reads on its own" — four sources, zero setup), memory ("a later spec reads what an earlier one established" — this is `gaps.md` 20's read side, done), agreement (a supersession becomes a question before code). The regression risk is smaller-surface: a fourth agent. The PR's own evidence is that the _verdict_, not the retrieval, is what the codebase lane lacked, and that the verdict is lost when it is not made where the evidence is read.
- **Decision point D-3 — separate lane or merged.** (a) Keep the fourth lane as in #205. (b) Merge retrieval into the codebase lane's charge and keep the verdict rule and the `[prior]` label and pile — one agent, same treatment of the output. (c) Both, measured: build (b) and run it on the same repositories and topics as (a), as the author offers. Recommendation: (c), with a bias to (b) if it holds — the direction doc's regression is the extra agent, not the extra label, and the PR shows the label and verdict are what matter. Owner: Rail. Needed by: Phase 0 exit. Until then #205 is the working version; do not block the evaluation on the merge question.
- **Proposal — evaluation protocol.** Run on the sync's target set (complex feature, from-scratch service, One Health single-purpose microservices). Record per run: agreements found and their verdicts; markers produced; questions asked and whether each was one only the human could answer (discovery direction's test); assumptions added that no source supported (the failure §2 forbids); and the three sync criteria. Report in `docs/2.0/` as a dated evaluation note so the decision is made on measurements, as the PR argues.

**Exit for Phase 0:** PR #200 merged as the next 1.x minor via release-drafter; awos-qa PR #51 merged; PR #205 merged as the working version; the evaluation note published and D-3 decided. Owners: Daria (merges), Rail (evaluation).

---

## Phase 1 — The seam contract, proven on `better:spec`

**Goal.** Before any new `better` command is written, fix what every command on the path emits and honours — so `better:tech` and `better:implement` are built once against a contract instead of retrofitted — and prove the contract on the one `better` command that exists: `better:spec` becomes its first emitter, and the spec-side gaps (verifier, review page, amendments, egress) close in the same release. Put the measurement in place that Phases 2 and 3 will be judged by. Serves §3 (a recorded confirmation), §2 and §7 (open questions travel), §6 (source over view), §5 (checkable), and the fidelity direction.

**Why first.** The three-reviewer pass found sixteen 3-of-3 gaps; the ones that undermine agreement most (`gaps.md` 6, 7, 10) are the same seam: `/better:spec` produces the richest agreement in the repo and every signal in it — the confirmation, the markers, the provenance, the verifier's residuals — is dropped at the boundary to the next command. Building `better:implement` on the current seam would rebuild the drop.

### 1.1 Confirmation status — the agreement becomes a recorded fact (gaps 6, 12, 18)

- **Fact.** No command writes `Approved`; the only status transition in the flow is `verify` → `Completed`; the only enforced gate is `<!-- not-user-reviewed -->` on `tasks.md`.
- **Proposal.** A `Status` vocabulary the flow actually writes and reads: `Draft` (written, not yet put to a human) → `Confirmed` (a human said yes, in-session or asynchronously) → `Completed` (verified against the agreement). `better:spec` writes `Draft` and moves to `Confirmed` when the post-write review is answered; `better:tech` and `better:implement` refuse a `Draft` spec unless an explicit override is passed (used by CI and awos-qa). Both templates lose `In Review | Approved`. The `[?]` mark `verify` reports but never writes is replaced by a real "could not check" mark in `better:implement` (Phase 2).
- **Proposal — the asynchronous shape** (carried from old Phase 7.2): an unattended run ends by opening a PR that carries the spec and tech spec; approving that PR is the confirmation; the next run builds. Once the mechanism exists, Philosophy §3 gains its deferred-moment sentence — the doc follows the mechanism, not the other way round.
- **Decision point D-1.** Where the confirmation is recorded: (a) a `Status` field in the spec's frontmatter-like header, as today; (b) a sidecar file per spec directory (`confirmation.md`) that also records who confirmed and what was open at the time. Recommendation: (a) — one document, one source of truth (§6); the "what was open" record belongs to the marker resolution log in 1.2.

### 1.2 One vocabulary for the unconfirmed (gaps 7, 1, 11)

- **Fact.** Spec uses `[NEEDS CLARIFICATION: …]`; tech uses `**Assumption:**`; product and architecture "label the section as an assumption"; nothing downstream reads any of them; `AWOS_UNATTENDED` is honoured only by the spec commands.
- **Proposal.** One marker convention across all five `better` commands — the `[NEEDS CLARIFICATION: …]` form, since it already carries the assumption and its source — with one rule for consumers: a command that reads a document carrying an unresolved marker either resolves it with the human, carries it forward explicitly into its own document, or refuses to proceed; it never builds over it silently. One unattended contract, honoured by every `better` command: `AWOS_UNATTENDED` skips interviews, never resolves a marker, and never proceeds past a `Draft` gate. Written into the templates and pinned by lint.
- **Proposal.** Foundation documents record which sections were interviewed, gathered with evidence, or assumed — so `better:spec` can tell them apart when it reads `product-definition.md` as ground truth (gap 1).

### 1.3 Provenance in the source, views derived from it (gaps 10, 8)

- **Fact.** Source badges, challengeable decisions, and what each finding changed are authored into a temp JSON, rendered to `functional-spec.html`, and deleted; the markdown has no provenance.
- **Proposal.** Provenance becomes part of the markdown spec (a compact per-requirement source tag and a "Decisions" section), and `render-spec.mjs` derives the page from the markdown alone — no view-model file, so the page can be regenerated by any command that edits or verifies the spec. This is the precondition for item 1.8 and for a page at each confirmation moment in Phases 2–3.

### 1.4 The instrument — profiler and benchmark criteria (brief's side note; Pillar 3's open question)

- **Fact.** PR #210 (kmakarychev-dev, 2026-09-18, stacked on #209) adds a `profiler` plugin: `/profiler:implement` reads Claude Code's own session transcripts and reports per-agent wall time, turns, tokens, thinking share, delegation chains, hangs, and agents running on the orchestrator's model. Verified against two real runs. This resolves the brief's side note ("no working tool exists") — the tool exists, in review.
- **Proposal.** Adopt #210 as the benchmark instrument for Phase 2, and fix the criteria now so the `better:implement` design is judged by something agreed in advance. Recommended criteria, in order of weight: **fidelity** (acceptance criteria met on the first verification pass; criteria that rested on an unresolved marker; rework units after verification) — because §1 judges by outcome and §4 by fidelity, and time and tokens are means; then **wall time** and **tokens** per run from the profiler; then **hangs and delegation depth** as the operational signals #209 targets. Errors, tokens, and time — the sync's candidates — are all present; fidelity is added because without it a faster, cheaper run that builds the wrong thing scores well.
- **Decision point D-2.** Does the profiler plugin ride in the awos marketplace (as #210 proposes) or in awos-qa? Recommendation: awos-qa, once Phase 2 needs it in CI — it is a maintainer instrument, not part of the method's surface (smaller-surface direction: "a capability that sits outside the path"). Accept #210 where it is now to unblock Phase 2; move it when Phase 4 collapses plugins.

### 1.5 The repo's own gates (gap 28)

- **Fact.** Every test job in `.github/workflows/quality-check.yml` carries `continue-on-error: true`; only Prettier blocks a merge. Layer 1 lint pins ~10 contracts on the retired core spec and one aggregate test on `/better:spec`; `tests/README.md` does not list `plugins/better` in Layer 1's scope.
- **Proposal.** Flip the `test` job to blocking now (the README's "after two consecutive green runs" condition has been met many times over); extend the lint scope to `plugins/better/**`; add a lint contract per item in 1.1–1.3 as it lands. The engine job stays non-blocking until Phase 5 removes it. Cheap, and §5 applied to ourselves: "good work is not done until it can be checked".

### 1.6 Agents execute, they do not rethink (Pillar 3 groundwork; Team: urgent)

- **Team (sync).** Generated agents should carry `model: sonnet` and a lowered effort; today they inherit the orchestrator's model and high effort and about 7% of implementation time is thinking. Owner: Rail.
- **Fact.** PR #207 (Ralfidze, 2026-09-17) does exactly this: `templates/agent-template.md` gains `model: sonnet` and `effort: low`; `commands/hire.md` Step 6 fills both and says when to raise them; companion `awos-recruitment#94` adds `effort` to the registry schema. Both fields are host-native subagent frontmatter (`model`: `sonnet|opus|haiku|fable|<id>|inherit`; `effort`: `low|medium|high|xhigh|max`) — verified in the Claude Code sub-agents reference on 2026-09-18. PR #209 (kmakarychev-dev) adds `disallowedTools: Agent` to generated agents so specialists cannot re-delegate, plus command-hygiene and one-suite-run rules, from profiling two real runs.
- **Assessment of the sync's alternative** ("an instruction in the implement stage that all work runs without extended thinking"): a prompt instruction cannot control the host's reasoning budget; the frontmatter fields can, per agent, and they are the host's own primitive (§10). Recommendation: frontmatter, as #207 does; no prompt-level substitute.
- **Proposal.** Merge #207 and #209 in Phase 1; measure their effect with the profiler (1.4) as the first benchmark run, so Phase 2 starts from a known baseline. Note that #207 assumes hire stays — if D-7 removes hire, the template moves with whatever replaces it.

### 1.7 The verifier checks completeness, re-runs, and writes its residuals (gap 9)

- **Fact.** `spec-verifier` judges understandability only, runs once, and runs before Step 9's final edits; residuals live in chat.
- **Proposal.** Give the verifier the product definition and the research findings as a second input and charge it with two more questions: did every finding land in a requirement or get explicitly dropped, and does the spec contradict the product definition. Run it once more after the post-write edits. Write residuals into the spec as markers. §5 and §7.

### 1.8 The review page shows the open questions and stays current (gap 8)

- **Fact.** The renderer has no treatment of `[NEEDS CLARIFICATION]`; the page shows a verification count that `verify` later invalidates; it is stamped as never updating.
- **Proposal.** An "Open questions" section first on the page; the page regenerated from the markdown (Phase 1.3) by any command that edits or verifies the spec. Agreement direction: "something a person had to hold in their head is now something they can read".

### 1.9 Update Mode in `better:spec` (gap 22)

- **Fact.** `/better:spec` refuses amendment-shaped prompts and points at the retired core command.
- **Proposal.** An Update Mode with the same rigor as creation — the prior-agreements lane runs against the amendment, the change is confirmed, the Change Log records why (old Phase 7.5). The amended spec returns to `Draft` for the affected criteria so `better:implement` reopens them (Phase 2). Memory direction; §4.

### 1.10 Egress consent and the web lane (gap 4)

- **Proposal.** The web lane sits behind the same consent posture as the knowledge-base lane and artifact publishing, and is skipped when the brief is marked internal or when comparable-product research cannot move the outcome (§1). The gate is a one-time project setting, not a per-run question, so unattended runs stay unattended.

**Exit for Phase 1.** Templates carry the status and marker vocabulary and `better:spec` is the first command to emit both; lint pins them; `render-spec.mjs` derives from markdown alone and the page shows open questions; verifier and Update Mode shipped; web-lane consent in place; profiler merged and one baseline run recorded; `test` CI job blocking; #207 and #209 merged; `better` plugin version bumped as one deliberate commit.

---

## Phase 2 — `better:tech` and `better:implement` (Pillar 3)

**Goal.** The back half of the path consumes what the spec produced and does not consider work done until it has checked it against the agreement. Serves §4 and §5 and the fidelity direction; collapses five commands to three (smaller-surface direction).

### 2.1 `better:tech` — the first consumer of the seam (gaps 7, 11, 21, 1)

- **Proposal.** `better:tech` opens by reading the spec's status and markers (Phase 1) — a `Draft` spec stops it, an unresolved marker is resolved with the human or carried forward explicitly, never built over. It reads `research-notes.md` (gap 21: written for it, never opened). It writes first and confirms after, honouring the shared unattended contract (gap 11). Where it must choose without evidence it writes a marker, not an `**Assumption:**` (1.2). Its confirmation moment gets a derived view (1.3). Small command relative to `better:implement`; it can ship early in the phase.

### 2.2 `better:implement` — split, run, verify, in one command (gaps 12–19, 26, 20, 22)

- **Team.** One command replaces `/awos:tasks` + `/awos:implement` + `/awos:verify`. Implementation is driven directly by the functional and technical specs, built on out-of-box Claude Code features plus awos-recruitment.
- **Fact.** The design inputs already recorded for old Phase 6A stand: delegate-by-path (paths plus verbatim work-unit text, never pasted or re-authored bodies — the measured fidelity leaks followed re-authoring, gap 14); small-task pressure (below the worth-specifying threshold the host's plan mode is the boundary, §11); the orchestrator-only contract (implement never edits code). #209's guardrails (no specialist re-delegation, command hygiene, one full-suite run) are design inputs too.
- **Proposal — the shape.**
  - **Split.** Derive work units from the tech spec; assign agents by introspecting the `Agent` tool's description block (this is how tech, tasks, and implement already pick agents — see the fact correction below); surface a staffing gap as an open question.
  - **Run.** Delegate by path. Each unit names the criteria it realizes. A subagent's question is a first-class return value: the orchestrator puts it to the human or turns it into a marker the run stops on (gap 13).
  - **Verify.** Verification is the loop's exit criterion, not a separate command (gap 15): each unit is checked against the criteria it named as it completes; the whole is checked against the agreement — acceptance criteria, Out-of-Scope, and the confirmed technical decisions and assumptions (gap 16). A failed criterion becomes a work unit, not a chat message. A criterion `awos` cannot check gets a distinguishable mark and is put to the human (gap 18). One check, not three (gap 17).
  - **Remember.** The last step folds confirmed behaviour into the product and architecture documents (Phase 3.4's write side) and moves the spec to `Completed`.
  - **Not in the command.** Ownership of the team's regression suite, RED-validation prescriptions, and the `docs/screenshots/` convention leave (gap 19; §4 "code quality in general belongs to the host"); tooling-install asks leave (gap 26). Acceptance-level proof of the agreement stays — that is fidelity work.
- **Decision point D-4 — is the split a confirmation moment?** (a) Internal: the plan is not a reviewable artifact; the spec and tech spec are the agreement and the human confirmed those. (b) Reviewable: the plan is shown, with a derived view, before the run. Recommendation: (a) by default, (b) available behind a flag — the only gate today is on the plan and the three-reviewer pass found it is the wrong artifact to gate (gap 12); the agreement direction's regression is "more content to review without more decisions to make".
- **Decision point D-5 — how the run reports.** (a) Chat only. (b) A `run.md` in the spec directory: units, agents, criteria checked, evidence, marks — the durable record §5 asks for ("where it cannot make sure, it says so"). Recommendation: (b), derived-view rendered from it.
- **Decision point D-6 — the `**[Agent: name]**` convention** when no `tasks.md` exists. (a) Carry it into `run.md`. (b) Drop it; agent choice is the orchestrator's and is reported, not pre-recorded. Recommendation: (b) unless D-4 chooses (b).
- **Benchmark.** Judge `better:implement` against `/awos:implement` on the Phase 1.4 criteria with the profiler, on the same specs. Fidelity first.

### 2.3 Hire's relationship to `better:implement` (Team; feeds D-7)

- **Team (sync).** Hire stays until a new integrated approach exists where the model hires the needed agents itself. Decide whether the target hiring flow becomes part of the unified command.
- **Fact correction to the brief.** The sync statement "tasks read the `hired_agents` file for work assignment; without it everything falls to a general purpose agent" is not how the repo works: `commands/tech.md:51`, `commands/tasks.md:72`, and `commands/implement.md:58` all pick agents by introspecting the `Agent` tool's description block in the system prompt (project-local `.claude/agents/*.md` and plugin agents alike); `context/product/hired-agents.md` is read by no command (`gaps.md` 24). The general-purpose fallback triggers when no _installed_ agent covers a task — installing agents is what hire does, the file is a by-product. The design question is therefore "who installs agents and when", not "who reads the file".
- **Proposal — options for D-7, decided in Phase 4.** (a) Hire stays a foundation step with a `better:hire` version. (b) `better:implement` hires on demand: when the split finds no installed agent for a unit, it queries the recruitment MCP, proposes the agent, and installs on confirmation — the sync's "the model hires the needed agents itself"; hire as a command retires. (c) Hire leaves the path; recruitment is documented as host tooling the team sets up itself (§9). Recommendation: (b) — it removes a foundation step (smaller surface), keeps the human's confirmation on what gets installed (agreement), and answers the staffing gap on the path rather than beside it; it also makes the installer's unconditional MCP registration (gap 24) unnecessary — `better:implement` can tell the user to connect the MCP when it first needs it. Owner: Rail (recruitment) with whoever owns `better:implement`.

### 2.4 awos-qa Phase B

- **Fact.** Phase A is opened as awos-qa PR #51, pending merge (owner: Daria): the 18 scenarios the Phase 0 removals invalidated are retired, 41 remain, unit layer green. Phase B (recorded runs) waits on the hire decision and the implement rewrite. Owed, carried from the predecessor plan:
  - `/better:spec` with an empty prompt under `AWOS_UNATTENDED` must stop, write nothing, ask nothing; the interactive legacy `roadmap.md` topic-candidate offer.
  - `/awos:architecture` Update Mode drift: a run against a codebase that diverged from the recorded architecture surfaces each drift item as a confirmation question and never rewrites the document without one.
  - The staffing-gap open question after the write (Accept / Keep / Drop variants) and the general-purpose fallback named in the report — written against `better:implement`, since it replaces the tasks and implement prompts these were first owed for.
  - The installer upgrade through migration 003, with a `/awos:roadmap` call afterwards hitting the removal notice.
  - Also owed: the product TUI rewrite and the headless-product retire-or-repurpose call.
- **Proposal.** Phase B lands with `better:implement`'s beta, not before — the lockstep rule as amended 2026-09-18 ("owner + target, land once the surface settles").

**Exit for Phase 2.** `better:tech` and `better:implement` in beta; benchmark note published; D-4, D-5, D-6 decided; awos-qa Phase B merged.

---

## Phase 3 — Foundation and memory (Pillars 2, 4, 5)

**Goal.** The foundation documents are gathered and confirmed, not assumed; external knowledge is found where the host already knows about it; the project remembers what it agreed and what it now does. Serves §2, §8, §10 and the discovery and memory directions.

### 3.1 `better:architecture` (Pillar 2 — brief's gap: "not discussed"; gaps 1, 2, 8)

- **Fact.** `/awos:architecture` today: unconditional `Explore` gather of the stack with evidence citations in Creation Mode; Update Mode re-gathers, diffs, and confirms each drift item (adopt / keep as recorded). Its weaknesses in the registry: unevidenced choices become best-practice defaults rather than open questions (gap 1); it gates doc retrieval on `sources.md` (gap 2); its confirmation moment is raw markdown (gap 8); Step 4 exists to point at hire.
- **Proposal — scope of the `better` version.** Keep the gather and drift mechanics — they are the part of the current flow most aligned with the philosophy. Change: an unevidenced choice is a marker, not a default (1.2); sections record interviewed / gathered / assumed; a derived view at confirmation (1.3); doc retrieval by host-tool introspection (3.3); Step 4 follows D-7. Add: the architecture document becomes the home of _operational_ knowledge sources (3.3) — where implementers look when debugging.

### 3.2 `better:product` (gaps 1, 8)

- **Proposal.** Interview-only stays (Team, resolved 2026-09-10). Change: unanswered sections become markers, not "reasonable best-practice assumptions"; a derived view at confirmation; a "Where intent lives" section (3.3) naming the ticket, chat, and document sources `better:spec` should read. The document gains the status vocabulary so `better:spec` can tell a confirmed product definition from a draft.

### 3.3 Sources revisited (Pillar 5)

- **Team (sync).** The rigidly structured `sources.md` is useless for the model and sometimes confuses it. Proposed: plain-text description of available resources ("there is a Barley MCP with call information, ask it about X; there is a channel with Loki alerts, check there"). Location open: a code-side file subagents load from (used for debugging), `product.md`, or a separate file; possible split of debugging sources from research and spec-writing sources. Alternative: a skill that checks connected tools and MCPs at start and generates the instructions itself. No owner.
- **Fact.** There is no `code.md` in awos; the nearest existing homes are `context/product/architecture.md` (technical facts, read by tech and implement) and `context/product/product-definition.md` (read by spec). Old Phase 7.6 already decided: dissolve the skill and the `## Status:` state machine; consumers introspect the host's connected tools; a named source with no reachable tool is an open question; a knowledge-sources section goes into the product definition.
- **Assessment.** The two sync proposals are not alternatives; they answer different halves. Introspection answers "what tools are connected" — that is the host's knowledge and reading it directly is §10; a hand-written manifest of it is the discovery direction's named regression. Plain text answers "what is each tool _for_ here, and where do the non-tool sources live" (a Slack channel, a runbook, a person) — that is project knowledge and belongs in the project's documents (§8). The current file fails because it does the first job by hand and the second in a rigid schema.
- **Decision point D-8 — location and shape.** (a) One plain-text "Knowledge sources" section in `product-definition.md`. (b) Two sections split by consumer: "Where intent lives" in `product-definition.md` (tickets, chats, docs — read by `better:spec`'s research lanes) and "Where operations live" in `architecture.md` (logs, alerts, dashboards, MCPs for debugging — read by `better:implement`'s agents). (c) A separate file. Recommendation: (b) — it matches who reads what, avoids a new file (smaller surface), and both sections are plain prose the model reads well, as the sync asked. Runtime tool introspection is not a location question; every `better` command does it (a skill at start is one implementation; a step in each command's context-loading is another and needs no new surface).
- **Proposal.** Delete `configure-external-sources` and `context/sources/` in the same release (user copies of `sources.md` are class 3 — disowned, never touched). `better:spec`'s lanes and `better:architecture`'s retrieval read the sections plus introspection, and the knowledge-base lane reads ticket and communication sources, not documentation only (gap 3 — the rationale names tickets and conversations as where intent lives; until this lands, lift the category filter on the existing manifest); `gaps.md` 2 and 3 close here. Owner: unassigned — proposed to pair with whoever owns `better:architecture`.

### 3.4 Memory — the project remembers (Pillar 4; gaps 20, 21, 22)

- **Team (sync).** Memory functionality in progress (Rail); no significant progress yet. Decide the relationship with sources: one context story or two.
- **Fact.** Read side partly exists: #205's prior-agreements lane reads earlier specs, ADRs, commits, and tests. Write side does not: after verification the flow tells the human which command to run; the product definition is never enriched by shipped features; `hired-agents.md`, `research-notes.md`, and the HTML page are written and never maintained.
- **Proposal — target design** (the brief's gap).
  - **What the project remembers:** its confirmed agreements (the specs, with status and Change Log), what it currently is (product definition and architecture, kept current by the flow), and why it changed (Change Logs; ADRs where the team keeps them — read, never written, by awos).
  - **Read side:** `better:spec` reads prior agreements (0.1) and the foundation documents; `better:tech` reads `research-notes.md`; `better:implement` reads the agreement.
  - **Write side:** `better:implement`'s last step proposes the deltas to `product-definition.md` and `architecture.md` that the verified feature implies, confirmed with the human (adopt / keep — the same shape as architecture's drift confirmation), and applies them. No document is written that nothing reads: `hired-agents.md` follows D-7; `research-notes.md` gains its reader (2.1) or is dropped; the review page is regenerated, not stored as a snapshot (1.3).
  - **Not memory:** a vector store, a session-memory feature, or a "warm context" file the human maintains. Those are host features or discovery regressions; §8 is about project knowledge outliving the change, and that lives in the documents.
- **Decision point D-9 — one story or two with sources.** Recommendation: two, with a shared home. _Memory_ is what the project knows about itself; _sources_ is where the project's knowledge lives outside the repo. Both are recorded in the same two documents (product definition, architecture), which is why they feel like one story; they are different reads (the flow writes memory; the flow only reads sources).

**Exit for Phase 3.** `better:architecture` and `better:product` in beta; `sources.md` dissolved; post-verify absorption shipped; D-8 and D-9 decided.

---

## Phase 4 — Switch the path

**Goal.** This phase _is_ the AWOS 2.0 release (Team, 2026-09-18): the `better` commands become the core commands, a newcomer following the README reaches them and nothing else, the old core commands retire gracefully, and the repo's release process is automated. The `major` label is used here and nowhere before. Serves the smaller-surface direction and §10; closes `gaps.md` 23, 24, 27, 29.

### 4.1 Onboarding and installer (gap 23)

- **Fact.** The installer copies core commands and registers the marketplace; it does not install `better`; README, `docs/commands/`, CONTRIBUTING, the upgrade guide, and every next-command pointer name the core commands; `better` appears nowhere in the README.
- **Proposal.** The installer installs the `better` plugin as the path (via the marketplace it already registers, or by copying the plugin's commands into `.awos/` and wrappers into `.claude/commands/` under the same two-folder model — D-10). README and `docs/commands/` are rewritten around the `better` commands; the upgrade guide gains the 2.0 command table.
- **Decided — D-10, plugin or core (Team, 2026-09-18).** The `better` commands _become_ the core commands under `.awos/commands/` and the plugin retires; that event is the AWOS 2.0 release. During the transition `better` stays a plugin. What remains open is only the transition mechanics: whether the installer installs the plugin in the meantime (the marketplace it already registers) or 1.x users are pointed at `/plugin install` by the README. This collapses a version line and the marketplace dependency (gap 27) and matches the direction doc's "a proven experiment folded into core and its predecessor removed".

### 4.2 Core commands retire

- **Proposal.** Each core command retires when its `better` version is beta, under the user-file policy's graceful shutdown: the local body becomes the removal notice pointing at the `better` command; pristine wrappers are rewritten; customized wrappers and all `context/` content are preserved. One migration per retirement wave; `major` release label; `--dry-run` validated; idempotent.

### 4.3 The hire decision (D-7)

- Decided here with the options from 2.3. Whatever the choice, the installer's unconditional `awos-recruitment` MCP registration (gap 24) ends: under (b) `better:implement` asks to connect it when first needed; under (a) hire registers it on first run; under (c) it is documentation.

### 4.4 Release and test automation (Pillar 6 — brief's gap: "not discussed")

- **Fact — awos.** `quality-check.yml` (Prettier blocking; tests, coverage, engine non-blocking), `release-drafter.yml` (version from PR labels), `publish.yml` (npm via OIDC on release). **Fact — awos-recruitment** (public repo, last commit 2026-09-01): `validate.yml`, `publish-cli.yml`, `deploy.yml`, `image-scan.yml`, `terraform-lint.yml`.
- **Proposal — awos.** Blocking tests (Phase 1.5); plugin version pins checked in CI against the marketplace (exists as lint; make it blocking); a release job that publishes the plugin versions alongside the npm package so the marketplace never lags the tag; the awos-qa behavioural suite triggered on a `better` command change (needs a Claude runtime in CI — _assumption_: a token is available to the org; if not, awos-qa stays a manual pre-release gate and CI runs its unit layer only); the profiler benchmark from Phase 2 run against a fixed fixture spec on each `better:implement` change, publishing the criteria as a check summary — a regression in fidelity or wall time is visible in the PR.
- **Proposal — awos-recruitment.** Out of this roadmap's direct scope (separate repo, its own CI already covers validate, publish, deploy). Two lockstep items: the `effort` schema field (`awos-recruitment#94`) ships with #207; if D-7 chooses (b), the MCP's search contract becomes an interface `better:implement` depends on and gets a contract test here.

### 4.5 Docs and multi-host residue (gap 29)

- **Proposal.** Delete `.github/copilot-instructions.md`; strip Cursor and Copilot pointers from `docs/testing-strategies.md`; rewrite the README's promise around agreement, not autonomy; every `docs/commands/*.md` page describes the `better` command's actual behaviour.

**Exit for Phase 4.** Fresh install → README → `better` flow with no detour; core commands answer with the notice; D-7 and D-10 decided; release CI publishes package and plugins together.

---

## Phase 5 — Retire the audit stack (last)

Unchanged from the predecessor plan's Phase 8, restated for completeness. **Gate: the successor audit, developed in its separate repository, has passed beta.** Delete `plugins/awos/skills/ai-readiness-audit/`, `agents/repo-auditor.md`, `standards-refresh`, `tools/ai-readiness-audit/`, `dist/`, the engine scripts, devDependencies, and CI jobs; retire the now-empty `awos` plugin and, if D-10 chose (b), the marketplace machinery and its installer step. The audit is not marked deprecated before then (Team, 2026-09-15). Its SDD dimension's stale roadmap check (`gaps.md` 25) rides until this phase; if the successor slips past Phase 4, reopen that one fix.

**Successor-audit requirements** (kernels carried out of the issues and PRs closed on 2026-09-10; the successor repository owns them): narrative claims mechanically traceable to check evidence (#157); an applicability model with "can't determine" and deployment context (#158); a per-ecosystem fixture matrix, Maven multi-module first (#159); orchestration-root / multi-repo topology as first-class (#172, with its feasibility notes and counterfactual tables); attribution as an unscored descriptor, if anywhere (#173); BDD suites first-class and a pyramid check that SKIPs rather than PASSes on unclassifiable trees (#176); one definition of "project file" plus coverage-report dedup (#179); the measured-or-not MTTR decision owned by a single function (#186).

---

## Pillar 7 — what the philosophy asks for that the pillars did not name

The brief asked for items derived from the philosophy that pillars 0–6 do not cover. Read against `gaps.md`, these are the registry entries no pillar owned; each is placed above:

| Registry gap                                                 | Principle | Placed in                                            |
| ------------------------------------------------------------ | --------- | ---------------------------------------------------- |
| 6 — the agreement is never recorded                          | §3, §4    | 1.1                                                  |
| 7 — open questions die at the spec boundary                  | §2, §7    | 1.2, 2.1                                             |
| 10 — provenance lives only in the disposable view            | §6, §7    | 1.3                                                  |
| 8 — one review page, hides open questions, goes stale        | §6        | 1.3, 1.8                                             |
| 9 — verifier checks understandability only, once             | §5, §7    | 1.7                                                  |
| 4 — web lane ships intent outward unconditionally            | §1, §10   | 1.10                                                 |
| 11 — tech asks before writing; no shared unattended contract | §3, §5    | 1.2, 2.1                                             |
| 13 — subagents told to ask with no one to ask                | §2, §7    | 2.2                                                  |
| 28 — the repo's own checks do not gate                       | §5        | 1.5, 4.4                                             |
| 29 — docs overclaim, multi-host residue                      | §1, §10   | 4.5                                                  |
| 5 — legacy `roadmap.md` read stays                           | decided   | none — listed in the registry so the cost is visible |

**Team (sync).** A shallow competitive analysis of a popular analogous tool is planned (owner: Rail), read against Philosophy 2.0, to understand why it earns GitHub stars. **Proposal.** Treat its findings as input to Phase 1 (what a spec step is expected to do) and Phase 4 (onboarding and README — the surface a newcomer judges in the first five minutes). Findings that propose a capability outside the path are tested against the smaller-surface direction before they become items; "it has stars" is not an argument the philosophy accepts.

---

## Decision register

| ID   | Decision                                          | Options                                                                                                                 | Recommendation                         | Owner                    | Needed by     |
| ---- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------ | ------------- |
| D-1  | Where the confirmation is recorded                | (a) `Status` in the document; (b) sidecar file                                                                          | (a)                                    | Daria                    | Phase 1 start |
| D-2  | Where the profiler lives                          | (a) awos marketplace (#210); (b) awos-qa                                                                                | Accept (a) now, move to (b) in Phase 4 | Daria, kmakarychev-dev   | Phase 1       |
| D-3  | Prior agreements: separate lane or merged         | (a) fourth lane (#205); (b) merged into codebase lane with verdict rule; (c) measure both                               | (c), bias to (b)                       | Rail                     | Phase 0 exit  |
| D-4  | Is the scope split a confirmation moment          | (a) internal; (b) reviewable                                                                                            | (a), (b) behind a flag                 | `better:implement` owner | Phase 2 start |
| D-5  | How `better:implement` reports                    | (a) chat; (b) `run.md` in the spec directory                                                                            | (b)                                    | `better:implement` owner | Phase 2 start |
| D-6  | `**[Agent: name]**` convention without `tasks.md` | (a) carry into `run.md`; (b) drop, report agent choice                                                                  | (b) unless D-4 = (b)                   | `better:implement` owner | Phase 2       |
| D-7  | Hire's fate                                       | (a) `better:hire` foundation step; (b) `better:implement` hires on demand; (c) leaves the path                          | (b)                                    | Daria, Rail              | Phase 4       |
| D-8  | Sources: location and shape                       | (a) one section in product definition; (b) intent in product definition + operations in architecture; (c) separate file | (b)                                    | unassigned               | Phase 3 start |
| D-9  | Memory and sources: one story or two              | one / two                                                                                                               | two, shared home                       | Rail                     | Phase 3 start |
| D-10 | `better` stays a plugin or becomes core           | Decided 2026-09-18: becomes core; that release is AWOS 2.0. Open: does the installer install the plugin during 1.x      | plugin via installer during 1.x        | Daria                    | Phase 3 beta  |

---

## Owners

**Team (sync and PR authorship).** Rail (Ralfidze): Pillar 1 evaluation and #205; recruitment model and effort (#207, `awos-recruitment#94`); memory (Pillar 4); competitive analysis. kmakarychev-dev: implement guardrails (#209) and the profiler (#210) — _inferred from PR authorship, not assigned at the sync_. Daria: Phase 0, this roadmap, `gaps.md`. **Unassigned:** `better:tech`, `better:implement` (the largest item), `better:architecture`, `better:product`, sources (Pillar 5), CI/CD (Pillar 6).

---

## Cross-cutting rules

Carried from the predecessor plan and still in force: lint and test updates ship in the same PR as the change they pin; removals of user-visible commands ship with idempotent, `--dry-run`-validated migrations and the graceful shutdown as their compatibility story; the `major` label is reserved for the release that makes `better` core (AWOS 2.0, Phase 4) — every release before it is a 1.x `minor`, PR #200 included (Team, 2026-09-18); each PR body names the principle or direction it serves; the user-file policy governs every retirement; awos-qa lockstep is recorded per phase with an owner and a target and lands once the surface settles; a new gap found during any phase is recorded in `gaps.md` first, then scheduled here; a gap is closed only when the flow closes it. Two additions: **every `better` command ships with its lint contracts and its awos-qa scenarios in the same phase** (the three-reviewer pass found the method's central promises uncheckable because the behaviour did not exist — the `better` versions are where they start to exist); and **the `better` plugin version moves as one deliberate commit per phase**, three files together, until D-10 collapses the line.

---

## Corrections to the input brief

Recorded so the brief is not re-used as a source for these points.

- **"Tasks read the `hired_agents` file for work assignment."** Not so — agent selection is by introspection of the `Agent` tool's description block in tech, tasks, and implement; `hired-agents.md` has no reader. See 2.3.
- **"Pillar 0: full removal list is missing."** The list was decided and executed in Phase 0; what remains is scheduled above. See Phase 0's table.
- **"No working tool exists for profiling agents from JSON-L session logs."** PR #210 is one, verified on two real runs. See 1.4.
- **"Recruitment: the template should generate agents with Model: Sonnet and lowered effort."** In review as PR #207 with companion `awos-recruitment#94`; both fields are host-native frontmatter. See 1.6.
- **"Prototype exists" (Pillar 1).** It is PR #205, with six reported runs. See 0.1.
- **"Location: code.md."** No such file exists in awos; the candidates are `architecture.md` and `product-definition.md`. See 3.3.
- **"Hire has its own deprecation decision."** It does not — its fate is undecided (reverted 2026-09-17). See D-7.

---

## Appendix A — User-file policy (decided 2026-09-09; amended 2026-09-17)

_awos deletes only what awos wrote and the user never touched; anything carrying user intent is preserved and surfaced, never silently removed._ Every retirement in Phase 4 follows this table.

| Class | Files                                                                        | Treatment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `.awos/` internals                                                           | Migrations delete freely — the existing overwrite contract. **Graceful shutdown** for retired commands: the local command body is replaced with a removal notice wherever the command or its wrapper is present, so calling it answers that the feature left AWOS instead of running a frozen copy; nothing of the user's is deleted; the orphaned template under `.awos/templates/` is removed, since nothing reads it once the command is a notice. `context/product/roadmap.md` is the team's own tool — never created, updated, or marked by AWOS; both spec commands keep offering a maintained roadmap's incomplete items as topic candidates indefinitely, with no sunset. |
| 2     | Wrappers in `.claude/commands/awos/`                                         | A wrapper byte-identical to any shipped 1.x version is _rewritten_ to the 2.0 removal wrapper (its palette description says the command was removed; it still resolves to the notice, so calling it answers — deleting it would turn the graceful answer into the host's "unknown command"). A customized wrapper is preserved untouched and resolves to the same notice. Deleting either file is the user's move; the notice and the one-time update announcement name both.                                                                                                                                                                                                     |
| 3     | User content (`context/product/*.md`, generated flow commands, `sources.md`) | Never touched; **explicitly disowned** in the upgrade guide and the plugin README ("yours to keep, move, or delete").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Notes:

- Class 3's disownment answers the memory direction's orphaned-document regression without destroying confirmed user intent.
- The marketplace registration in user settings follows the same rule: removed when it is exactly the entry the installer wrote, left-and-notified otherwise.
- Mechanics: `replace_content` carries an `if_sha256` guard (the hashes of every shipped 1.x wrapper), so class 2 is handled by migration 003; the copy step never touches wrappers it no longer ships. The same migration carries the one-time user announcement (`notice`), so the installer holds no product knowledge of removed commands. Migrations are idempotent and `--dry-run` validated; a failed `optional` migration warns and halts version advancement without stopping the install.
