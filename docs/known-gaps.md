# Known Gaps — Living Registry

Gaps between what the philosophy and docs promise and what the flow actually does.

- **Division of labor:** diagnosis and evidence live here; the plan lives in `refactoring-roadmap.md`; verdicts on existing components live in `philosophy-alignment.md`.
- **Lifecycle:** add gaps as they are found; an entry leaves this file only when the flow actually closes it. Every entry names its roadmap phase, or is marked **unscheduled**.
- **Spec baseline:** "the spec" in this registry means `/better:spec` — THE spec command (Daria, 2026-09-09), WIP status notwithstanding; it folds into core as roadmap Phase 6B.
- **History:** opened 2026-09-08 during the PR #194 review; extended 2026-09-09.

## Index

| #   | Gap                                                        | Roadmap                     |
| --- | ---------------------------------------------------------- | --------------------------- |
| 1   | `[NEEDS CLARIFICATION]` markers invisible downstream       | Phase 7, item 1             |
| 2   | No confirmation story for unattended runs                  | Phase 7, item 2             |
| 3   | Nothing keeps completed specs current                      | Phase 7, item 4             |
| 4   | Philosophy's contracts have no enforcement                 | Phase 7, item 3             |
| 5   | Legacy in-repo audit pending removal                       | Phase 8 (last, gated)       |
| 6   | Update Mode never re-gathers                               | Unscheduled                 |
| 7   | Changed agreements lose their why                          | Phase 7, item 5             |
| 8   | Architecture decisions flatten their alternatives          | Phase 7 (rides memory work) |
| 9   | Intent sources beyond the interview are unread             | Unscheduled                 |
| 10  | Roadmap removal presumes a tracker no command reads        | Unscheduled                 |
| 11  | First-time-right — principle 1's measure — is unmeasurable | Unscheduled                 |
| 12  | The spec→tech seam is unchecked                            | Unscheduled                 |
| 13  | Derived human views exist only at the spec step            | Unscheduled                 |
| 14  | People as an intent source are unreachable                 | Unscheduled                 |

## 1. `[NEEDS CLARIFICATION]` markers are invisible downstream

- **Observed:** `commands/spec.md` (Step 6) leaves unresolved markers in the saved spec and says "the user — or `/awos:tech` — can resolve them later." No downstream command mentions the markers at all: `tech.md`, `tasks.md`, `implement.md`, and `verify.md` contain zero references to `NEEDS CLARIFICATION` (verified by grep). Same for `/better:spec`'s markers.
- **Why it matters:** attended runs mask the gap — the human resolves markers interactively. In an unattended chain (`claude -p`, `AWOS_UNATTENDED`) an assumption is drafted, labeled, turned into a tech spec, built, and verified against acceptance criteria derived from the unconfirmed assumption itself. The label marks the content as an assumption to any reader who looks — and no downstream reader looks. Breaks the confirmed-before-built contract (principles 3, 4) precisely where it matters most.
- **Fix sketch:** `/awos:tech` opens by resolving markers (attended) or carrying each into the tech spec as an explicit named assumption (unattended); `/awos:implement` flags tasks realizing unconfirmed assumptions; `/awos:verify` reports which criteria rest on them.
- **Roadmap:** Phase 7, item 1.

## 2. No confirmation story for unattended runs

- **Observed:** the flow is engineered to _survive_ `claude -p` — deliverables written before any question that could end the turn, interviews skipped under `AWOS_UNATTENDED` — but nothing replaces the confirmation those questions were for. A spec produced unattended is indistinguishable, to every downstream command, from one a human confirmed line by line.
- **Why it matters:** awos should eventually run as an automated action (CI-triggered, scheduled). Without deferred confirmation, automation quietly downgrades "agreement" to "assumption" — the philosophy's central moment has no asynchronous equivalent.
- **Fix sketch:** a `Draft`/`Confirmed` status stamped in the spec. Unattended runs stop after spec + tech and emit the artifacts for async review — naturally as a PR, where **approving the PR is the confirmation** and the next run builds. `/awos:implement` refuses an unconfirmed spec without an explicit override (used by CI and `awos-qa`).
- **Roadmap:** Phase 7, item 2.

## 3. Nothing keeps completed specs current

- **Observed:** PR #194 removes the README tip to delete specs after implementation (it contradicted principle 8), but no mechanism replaces the advice: stale specs still accumulate and confuse agents, `/awos:verify` marks Completed and nothing absorbs the knowledge, and no artifact describes the product's _current_ behavior as opposed to its history of intentions.
- **Why it matters:** the "toward memory" direction has no feature behind it. Users get the worst interim state — pruning advice gone, staleness problem intact.
- **Fix sketch:** a post-verify absorption step folding confirmed behavior into a living document (the product definition, or a dedicated current-behavior artifact); or an explicit spec lifecycle (active → absorbed → archived) owned by the flow.
- **Roadmap:** Phase 7, item 4.

## 4. The philosophy's behavioral contracts have no enforcement

- **Observed:** `philosophy.md` states contracts that are checkable in principle — assumptions labeled, confirmation before build, verification against the agreement — but nothing asserts them. Repo history demonstrates the failure mode: the audit engine needed a three-layer circuit-breaker because prose instructions were repeatedly reverted under headless pressure.
- **Why it matters:** CONTRIBUTING calls these "the principles every change is measured against," and nothing measures.
- **Fix sketch:** awos-qa behavioral assertions for the checkable contracts (unattended spec run ⇒ a marker per assumption; implement over unresolved markers ⇒ flagged). Lint checks where greppable — e.g. once gap 1 is fixed, `tech.md` must reference the marker convention.
- **Roadmap:** Phase 7, item 3.

## 5. The legacy in-repo audit is pending removal

- **Observed:** the in-repo AI-readiness audit is legacy — its successor is a standalone audit in a separate repository. Nothing in the repo marks this yet. The decision dissolves the philosophy tension ("not a code-quality or engineering-metrics tool"): once the audit is gone, the denial is simply true.
- **Why it matters:** until removal, the repo carries a large deprecated surface — the engine, the committed ~26 MB `dist/`, the manual plugin version line and its lint discipline, the engine test layer in CI, the QA harness, the `repo-auditor` agent, the `standards-refresh` skill, and audit references throughout the docs.
- **Interim scoring bug:** with `/awos:roadmap` removed (PR #200), the audit's SDD-02 check still counts `context/product/roadmap.md` among the three required foundational documents — every correct greenfield project scores a permanent WARN, and existing projects keep earning credit for a file no command maintains anymore. The fix (drop roadmap.md from SDD-02's required set in standards.toml + the SDD detector, rebuild `dist/`, patch plugin bump) ships as a dedicated follow-up PR — the roadmap's Phase-5 triage rule classifies wrong-score bugs as fix-worthy, so this does not wait for Phase 8.
- **Roadmap:** Phase 8 — deliberately **last**, gated on the successor passing beta; the in-repo audit stays operational until then. The plugin and marketplace machinery retire with it. _(An earlier sketch here — keep `/awos:flow`, repoint brownfield docs — is superseded: flow goes in Phase 1, brownfield docs in Phase 2, and the successor pointer lands with Phase 8, whose gate makes it announceable by definition.)_

## 6. Update Mode never re-gathers

- **Observed:** `/awos:product`'s Update Mode revises the definition from the conversation alone — nothing re-reads the code or any other source on a re-run. After the foundation exists, the definition moves only by interview while the product keeps changing.
- **Why it matters:** the memory direction's advancing test is "the product's _current_ behavior is available to the agent, not only its history of intentions." A definition that can only drift fails it structurally; every later spec inherits the drift.
- **Fix sketch:** Update Mode runs the same gather step Creation Mode runs, diffs findings against the recorded definition, and surfaces drift for confirmation.
- **Roadmap:** unscheduled — intersects the Open question (a modeless gather step would naturally run on update too); decide together.

## 7. Changed agreements lose their why

- **Observed:** when an agreed requirement changes, spec update mode rewrites the spec in place; the trigger, driver, and impact are kept nowhere. _(Kernel of closed PR #122 — real problem, wrong shape: a parallel ledger nothing reads.)_
- **Why it matters:** principle 8 — knowledge produced by a change outlives the change, and the _why_ of a reversal is the knowledge most needed later, when someone proposes reverting the revert.
- **Fix sketch:** the owning spec's update mode records its own amendment rationale inline, so the agreement carries its history.
- **Roadmap:** Phase 7, item 5.

## 8. Architecture decisions flatten their alternatives

- **Observed:** `architecture.md` records what was decided, not the alternatives considered or why they lost. _(Kernel of closed PR #123 — same verdict: real problem, parallel-ledger shape. Its user-confirmed multi-select for candidate bullets is worth reusing.)_
- **Why it matters:** principle 8 (the rationale is the knowledge) and principle 7 (a reviewer cannot evaluate a decision whose alternatives are invisible).
- **Fix sketch:** `/awos:architecture` captures alternatives-considered and rationale inside `architecture.md` itself for each material decision.
- **Roadmap:** rides Phase 7's memory work unless scheduled earlier.

## 9. Intent sources beyond the interview are unread

- **Observed:** in-repo history — ADRs, changelogs, design docs — and test assertions (the closest thing existing code has to recorded acceptance criteria) are never mined as intent evidence. The record of past decisions sitting inside the repo is invisible to every command.
- **Why it matters:** the discovery direction's advancing test is "a source of intent that awos reads on its own"; the rationale names "a decision made months ago" as exactly where intent hides. These sources exist in most real repos and cost no setup to read.
- **Fix sketch:** the gather step (whatever shape the Open question settles on) includes in-repo decision records; spec-time research treats test assertions on touched behavior as prior acceptance criteria to confirm or supersede.
- **Roadmap:** unscheduled — depends on the Open question's resolution.

## 10. Roadmap removal presumes a tracker no command reads

- **Observed:** the rationale for removing `/awos:roadmap` — "the backlog belongs to the team's tracker; spec takes its topic from a ticket" — presumes tickets are reachable, but no command reads a tracker, and nothing is scheduled to. Post-refactor, spec's topic comes from user prose alone.
- **Why it matters:** the removal's justification quietly depends on an integration that exists nowhere. The ticket is the single most common place a feature's intent starts. This is also the first instance of a wider class: principle 9 describes a plugs-into posture (backlog, branching, review, deploy, tickets), and awos currently plugs into none of them — it ignores them.
- **Fix sketch:** spec-time topic intake accepts a ticket reference and reads it through the host's connected tools (introspection, per the sources-dissolution decision), asking the human only what the ticket does not answer.
- **Roadmap:** unscheduled — Phase 7 sweep candidate.

## 11. First-time-right — principle 1's measure — is unmeasurable

- **Observed:** principle 1 says "the measure of awos is whether what ships is what was wanted, the first time." Nothing can compute that measure for an awos project: verify→implement correction loops are not counted, rework after verification is invisible, and no artifact records whether a feature shipped right first time. The rationale's rework finding was a one-off internal measurement no awos project can reproduce.
- **Why it matters:** the framework asks to be judged by a number nobody can produce — and every direction's "advancing" claim ultimately appeals to it. Tension to respect: "not a code-quality or engineering-metrics tool" — a first-time-right signal about the method's own outcome is principle 1's instrument, not a code metric, but the line needs drawing deliberately.
- **Fix sketch:** the flow stamps its own loop count (corrections between implementation and verification, re-opened criteria) into the spec's lifecycle record — a byproduct of the work, not a dashboard.
- **Roadmap:** unscheduled.

## 12. The spec→tech seam is unchecked

- **Observed:** the spec checks its own work (the spec-verifier's blind pass — treating `/better:spec` as the current spec, per Daria 2026-09-09), and the final result is checked against the functional spec. But nothing verifies that the tech spec faithfully covers the functional spec — a silently dropped requirement surfaces only at final verification, the most expensive place. Phase 6's consolidation removes the tech→tasks seam; the spec→tech seam — the largest translation step in the flow — remains unchecked.
- **Why it matters:** principle 5 ("awos does not consider work done until it has made sure of it itself") currently holds at the path's ends but not at its seams; fidelity's "a deviation caught by the flow rather than by a person" applies to translations between artifacts too.
- **Fix sketch:** a coverage check at the end of `/awos:tech` — every functional requirement and acceptance criterion maps to something in the tech spec, unmapped ones surfaced as open questions (blind-verifier pattern reused from the spec step).
- **Roadmap:** unscheduled — Phase 7 sweep candidate.

## 13. Derived human views exist only at the spec step

- **Observed:** principle 6 says human-facing views are derived "whenever someone needs to review or make a decision." Treating `/better:spec` as the current spec, the spec confirmation has its rendered review page — and it is the only decision point in the flow that does. The product definition review, the architecture triage, and the verification verdict all use the agent-facing structured markdown as the human review surface.
- **Why it matters:** the agreement direction's advancing test is "the time to a confident yes or no goes down"; dual-audience documents are the exact compromise principle 6 was written against, at the moments where confirmation quality matters most.
- **Fix sketch:** extend the spec step's render pattern to the other confirmation moments — product definition, architecture decisions (with alternatives, per gap 8), and implement's verification verdict.
- **Roadmap:** unscheduled — Phase 7 sweep candidate.

## 14. People as an intent source are unreachable

- **Observed:** the rationale names four places intent lives — the ticket, the code, past decisions, and _the people who hold the pieces_. Even treating `/better:spec` as the current spec, its research lanes reach codebase, web, and KB — never people. Open questions and markers are addressed only to the keyboard-holder, and the philosophy explicitly retired the assumption that they hold the picture.
- **Why it matters:** discovery's "asking the human only what nobody else can answer" quietly assumes the right human is in the chair. When the answer lives with a PM or the person who took the customer call, awos has no mechanism at all — the fourth intent source is structurally unreachable.
- **Fix sketch:** cheapest first — the spec's open questions and labeled assumptions emitted as a shareable ask-list addressed to whoever can answer (the rendered review page is the natural carrier); answers fold back through the spec's update mode as ordinary confirmations.
- **Roadmap:** unscheduled.
