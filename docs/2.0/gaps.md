# Gaps

- **Author:** Daria Garanina
- **Created:** 2026-09-17
- **Status:** Draft
- **Role:** where the path, as it exists on the Phase 0 branch (PR #200; evidence line numbers refer to it), does not keep the method's promise. The plan that closes a gap lives in [`roadmap-2.0.md`](roadmap-2.0.md); this document only names the gap, the evidence, and its status.

**Starting point.** The method promises one path — intent → confirmed understanding → implementation → verification — whose product is agreement ([Philosophy](../philosophy.md)). Each gap below is a place where what the Phase 0 branch (PR #200) ships does not keep that promise, judged against the eleven principles and the five directions ([Direction](../direction.md)), with the prompt step, script, or config that shows it. The earlier registry (`known-gaps.md`) was deleted on 2026-09-17 and nothing here inherits its numbering or diagnoses.

**Scope.** AWOS 2.0 carries the philosophy through the `better` plugin, which will hold updated versions of the core commands: `/better:spec` exists today; `better:product`, `better:architecture`, `better:tech`, and `better:implement` follow, each written to close the gaps its core predecessor carries. The target flow is `product → architecture`, then `spec → tech → implement`; `better:implement` is `tasks` + `implement` + `verify` in one command (decided 2026-09-18), so the gaps of all three core commands are assigned to it. Whether `hire` gets a `better` version is the open hire decision. The core commands are judged here as the baseline the `better` versions replace; `/better:spec` is judged as the spec step itself, and the retired core `commands/spec.md` is not judged. The coexistence of core and `better` commands during the transition is decided, not a gap. Everything else — wrappers and templates, both plugins, the installer, docs, and tests — is in scope.

**How this list was produced.** On 2026-09-18 three independent reviewers each read the philosophy, direction, and rationale in full and then the whole branch under the scope rule above, without seeing any earlier gap registry. Their lists were merged; **Raised by** records how many of the three found the gap independently. Three of three is strong signal; one of three is a defensible reading one reviewer had and the others did not.

**Status vocabulary.** _open_ — nobody owns it yet; _scheduled_ — a `roadmap-2.0.md` item closes it (cited by item number, D-N for a decision point); _undecided_ — closing it waits on a decision that has not been made.

**Closes in.** The `better` command whose new version is expected to close the gap. Where a gap spans a seam, every command on the seam is named — the producer that must emit something and the consumer that must honour it. _not a command_ marks gaps that live in the installer, docs, tests, or a plugin's positioning rather than in a prompt.

**Pattern.** `/better:spec` now has the strongest pre-write discipline in the repo — research from code, web, and knowledge base; open questions as markers; write before any dismissable ask; a blind read by a second agent. But everything it produces lands nowhere: the confirmed understanding is never recorded, the markers are read by no later command, the research notes are read by no later command, the verifier's residuals live in chat, and the provenance lives in a temp file that is deleted. Gaps 6 through 13 and 21 through 23 are that one seam viewed from different principles; closing it is a design brief for `better:tech` and `better:implement` as consumers, as much as for `better:spec` as producer. One caveat applies to the whole list: the measure of `awos` is whether what ships is what was wanted, the first time (principle 1), and no part of the path records whether that happened — no rework signal, no first-pass-verify count. Every gap here is therefore argued from principles, because there is no instrument to argue from outcomes. That absence is not itself a gap in the path (the method is explicitly not a metrics tool), but it is why this registry carries evidence and reviewer counts rather than measurements.

## Intent: gathered, then confirmed

### 1. Foundation documents are drafted from best-practice assumptions before any question is asked

- **Promise:** `awos` never fills a gap by guessing; what cannot be found is an open question (principle 2). The discovery direction names "an agent that resolves ambiguity by picking the plausible option" as the regression, verbatim.
- **Today:** `/awos:product` fills personas, success metrics, and boundaries "from reasonable best-practice assumptions", saves, then offers to refine; `/awos:architecture` picks "a sensible best-practice default" where the codebase gives no evidence; `/awos:tech` records "your best-fit option as an explicit `**Assumption:**`". Each is labeled, but a labeled guess carries no evidence and no marker anything downstream reads. `/better:spec` then reads `product-definition.md` as ground truth with no way to tell an interviewed section from a guessed one, so an unattended run seeds every spec from a fabricated product definition. The gather pass relocated to architecture collects the technology stack, not product behaviour, so it does not fill the product gap.
- **Evidence:** `commands/product.md:69-75,81-82`; `commands/architecture.md:67-76,111`; `commands/tech.md:32,92`; `plugins/better/commands/spec.md:76-77`; `docs/philosophy.md` principle 2; `docs/direction.md` "Toward discovery".
- **Raised by:** 3 of 3.
- **Closes in:** `better:product`, `better:architecture`, `better:tech` — open questions with evidence instead of labeled defaults; a section's provenance (interviewed / gathered / assumed) recorded in the document so `better:spec` can tell them apart.
- **Status:** scheduled — `roadmap-2.0.md` 1.2 (markers and section provenance), 3.1, 3.2. The product-is-interview-only decision is recorded in Phase 0; the product-discovery facet (no source read at product time) has no item yet.

### 2. Discovery is gated on a human-maintained manifest written by a skill in the audit plugin

- **Promise:** the discovery direction names "a file the human must maintain so that the agent can read it" as the regression, verbatim; which tools are connected is already known to the host (principle 10 — host primitives, no abstraction layer).
- **Today:** `/better:spec`'s knowledge-base lane and `/awos:architecture`'s doc retrieval run only if `context/sources/sources.md` carries `## Status: configured`. The skill that writes it is an eight-step wizard with its own status state machine; it lives in `plugins/awos` beside the audit, is called from no core command, and lost its restart-resume entry point in Phase 2b. So THE spec's knowledge-base lane requires installing the plugin the roadmap intends to delete, and a source connected after configuration is invisible until someone re-runs the wizard by hand.
- **Evidence:** `plugins/better/commands/spec.md:35,96`; `plugins/better/README.md:31`; `commands/architecture.md:82`; `plugins/awos/skills/configure-external-sources/SKILL.md:13,63-69,92-106`; PR #200 (Phase 2b record: the restart-resume entry point left with `product.md`); `docs/direction.md` "Toward discovery".
- **Raised by:** 3 of 3.
- **Closes in:** `better:spec`, `better:architecture` — introspect the host's connected tools instead of reading `sources.md`; the sources skill leaves the audit plugin or dissolves.
- **Status:** scheduled — `roadmap-2.0.md` 3.3.

### 3. Configured ticket and chat sources are never consulted; only documentation sources are

- **Promise:** intent lives in "code, tickets, past decisions, and other people" (principle 2); the rationale locates the missing half in "a ticket … a product manager, a customer conversation".
- **Today:** the knowledge-base lane dispatches only for sources with `Category: documentation`. Sources the user configured as `tickets` or `communication` are ignored unless a ticket id happens to appear in the prompt.
- **Evidence:** `plugins/better/commands/spec.md:75,96`; `plugins/awos/skills/configure-external-sources/SKILL.md:101` (categories `documentation|tickets|communication`); `docs/rationale.md`; `docs/philosophy.md` principle 2.
- **Raised by:** 1 of 3.
- **Closes in:** `better:spec` — the knowledge-base lane reads ticket and communication sources, not documentation only.
- **Status:** scheduled — `roadmap-2.0.md` 3.3, with the interim filter lift named there.

### 4. Egress consent is inconsistent: the web lane ships feature intent outward unconditionally, even unattended

- **Promise:** anything that makes documents richer without moving the outcome is waste (principle 1); `awos` is not "a way to discover what to build" ([Philosophy](../philosophy.md) "What awos Is Not").
- **Today:** knowledge-base retrieval sits behind an explicit privacy gate and artifact publishing behind a consent gate where silence means no. The web lane has neither: it is "always dispatched", "do not skip a lane because it 'seems unnecessary'", and runs in unattended mode — the current-understanding brief becomes search queries for every feature, including internal or proprietary ones where comparable-product research is wasted work, and its findings are drafted into requirements as working assumptions.
- **Evidence:** `plugins/better/commands/spec.md:92,95,105,192`; `plugins/awos/skills/configure-external-sources/SKILL.md:47-49`; `docs/philosophy.md` principles 1 and 2, "What awos Is Not".
- **Raised by:** 1 of 3.
- **Closes in:** `better:spec` — the web lane behind the same consent posture as the knowledge-base lane and artifact publishing, and skipped where comparable-product research cannot move the outcome.
- **Status:** scheduled — `roadmap-2.0.md` 1.10.

### 5. The legacy `roadmap.md` is a permanent human-maintained input to THE spec

- **Promise:** the discovery direction's regression, again; `awos` is not "a planning or backlog tool".
- **Today:** the topic question offers items from a user-curated `context/product/roadmap.md` "indefinitely — no sunset", while the upgrade guide tells the user to "tick shipped items yourself". A file the human maintains for the agent to read, on a command that otherwise finds intent on its own.
- **Evidence:** `plugins/better/commands/spec.md:84`; `roadmap-2.0.md` Appendix A (class 1: no sunset); `docs/2.0/upgrading-1.x.md:28`; `docs/direction.md` "Toward discovery".
- **Raised by:** 2 of 3.
- **Closes in:** none — decided; listed so the cost stays visible.
- **Status:** explicitly decided to keep; listed so the decision is visible next to its cost.

## Confirmed understanding

### 6. The agreement is never recorded, and nothing downstream requires it to have happened

- **Promise:** "There is always a moment where the human can see what the agent understood and say 'yes, that' or 'no, not that' before code is written" (principle 3); the confirmed understanding is the contract (principle 4). The agreement direction's regression is "a confirmation that is a formality". The rationale: "A specification nobody confirmed is a well-formatted guess."
- **Today:** `/better:spec` writes both files "without waiting for approval", resolves what markers it can, and ends; it never sets or transitions the spec's `Status`, and no downstream command reads one. The templates carry `Status: Draft | In Review | Approved | Completed`, but the only writer of any status is `/awos:verify` setting `Completed`. The one machine-enforced gate in the flow is `<!-- not-user-reviewed -->` on `tasks.md` — a document the target flow removes — so the flow enforces confirmation of the _plan_ while the spec, the actual agreement, has none. Under `AWOS_UNATTENDED` the interview is skipped entirely and the pipeline still proceeds to tasks with nothing in any file saying the spec was never confirmed.
- **Evidence:** `plugins/better/commands/spec.md:85,144,162`; `templates/functional-spec-template.md:4`; `templates/technical-considerations-template.md:19` "[Link to the approved Functional Spec document]" — nothing approves; `commands/implement.md:44`; `commands/tasks.md:131`; `commands/verify.md:51,74`; `docs/philosophy.md` principles 3 and 4; `docs/direction.md` "Toward agreement"; `docs/rationale.md:33`.
- **Raised by:** 3 of 3.
- **Closes in:** `better:spec` records the confirmation; `better:tech` and `better:implement` refuse a spec that does not carry it.
- **Status:** scheduled — `roadmap-2.0.md` 1.1 (D-1) and 2.1, 2.2 as the refusing consumers.

### 7. Open questions and assumptions die at the spec boundary

- **Promise:** what cannot be found is surfaced as an open question, never filled by guessing (principles 2 and 7); a deviation from the agreement is caught by the flow (fidelity direction).
- **Today:** `/better:spec` deliberately leaves `[NEEDS CLARIFICATION: …]` markers in the saved spec — everything past its question budget "stays a marker" — and hands off with "for the user — or `/awos:tech` — to resolve later". `/awos:tech` has no such step: it reads the spec as plain context and adds its own `**Assumption:**` labels, surfaced once in chat. `tasks`, `implement`, and `verify` contain no reference to either marker. `/awos:implement` pastes the full spec into every delegation, so a coding subagent receives an open question as if it were a requirement and resolves it the way the rationale warns about. Each foundation command uses a different, unread assumption convention, so the flow has no single notion of "unconfirmed".
- **Evidence:** `plugins/better/commands/spec.md:159,162`; `commands/tech.md:19-25,32,92`; `commands/product.md:81`; `commands/architecture.md:111`; `commands/implement.md:67,70`; `grep "NEEDS CLARIFICATION" commands/{tech,tasks,implement,verify}.md` — no hits; `docs/philosophy.md` principles 2 and 7.
- **Raised by:** 3 of 3.
- **Closes in:** `better:spec` emits; `better:tech` and `better:implement` read and refuse to build over an unresolved marker.
- **Status:** scheduled — `roadmap-2.0.md` 1.2, consumed in 2.1 and 2.2. Cheap to close: `/awos:implement` already refuses a `tasks.md` carrying `<!-- not-user-reviewed -->`; the same check on unresolved markers is the same shape.

### 8. The review page exists for one of five confirmation moments, hides the open questions, and goes stale

- **Promise:** derive focused human-facing views from the structured source whenever someone needs to review or decide (principle 6); make the missing parts reviewable (principle 7). The agreement direction's advance is "something a person had to hold in their head is now something they can read".
- **Today:** product, architecture, tech spec, and task plan reviews "present the saved" raw markdown. The one page that exists, `functional-spec.html`, has no treatment of `[NEEDS CLARIFICATION]` — zero occurrences in the renderer, no open-questions field in the view-model schema — so the open questions a reviewer most needs to see render as inline prose. The page shows a "N of M criteria verified" bar and a status chip frozen at spec time; `/awos:verify` later ticks criteria in the markdown and the page never re-renders. It is stamped as a snapshot that "does not update when the spec is later edited or verified" — a derived view that contradicts the source it claims to be a lens on.
- **Evidence:** `plugins/better/scripts/render-spec.mjs:31-49,764-800`; `plugins/better/commands/spec.md:175-182,209`; `plugins/better/README.md:48`; `commands/product.md:88`; `commands/architecture.md:131`; `commands/tech.md:92`; `commands/tasks.md:136`; `docs/philosophy.md` principle 6.
- **Raised by:** 3 of 3.
- **Closes in:** `better:spec` — open questions surfaced on the page, page regenerated from the source on every edit and verification; `better:product`, `better:architecture`, `better:tech`, `better:implement` — a derived view at each of their confirmation moments.
- **Status:** scheduled — `roadmap-2.0.md` 1.3 and 1.8 for the spec page; the other four confirmation moments in 2.1, 2.2 (D-5), 3.1, 3.2.

### 9. The blind verifier checks understandability only, runs once, and runs before the final edits

- **Promise:** `awos` does not consider work done until it has made sure of it itself, and where it cannot, it says so (principle 5); it looks for gaps in requirements and acceptance criteria and shows the evidence (principle 7).
- **Today:** the `spec-verifier` is told to "judge understandability, not product quality" and by design cannot see the interview, the product definition, or the research findings — so no step confirms that every `[code]`/`[kb]`/`[web]` finding landed in a requirement or was explicitly dropped, or that the spec does not contradict `product-definition.md`. It is dispatched exactly once; Step 9 then folds the user's answers into requirements and criteria and re-saves with no re-check, so the spec that goes downstream is the unverified edit. Findings the session does not fold in become "reported residuals" that exist only in the final chat message.
- **Evidence:** `plugins/better/agents/spec-verifier.md:20`; `plugins/better/commands/spec.md:152` "The verifier runs exactly once — do not re-dispatch it after folding fixes", `:161`, `:209`; `docs/philosophy.md` principles 5 and 7.
- **Raised by:** 3 of 3.
- **Closes in:** `better:spec` — verifier scoped to completeness against the gathered findings and the product definition, re-run after the final edits, residuals written into the spec.
- **Status:** scheduled — `roadmap-2.0.md` 1.7.

### 10. Provenance, decisions, and evidence live only in the disposable view-model, not in the structured source

- **Promise:** keep the structured source useful for agents and derive views from it (principle 6); every inference shows the evidence behind it (principle 7).
- **Today:** the per-requirement source badges (interview / code / web / knowledge base), the "decisions a reviewer might challenge", and "what each finding changed" are authored in-session into a view-model written to a temp file, rendered, and deleted; the markdown spec carries none of it (the template has an `Author` field and no provenance). This inverts principle 6: the derived view holds information the source lacks, and the source is what `/awos:tech` and the verifier actually read. The evidence trail cannot be regenerated once the run ends.
- **Evidence:** `plugins/better/commands/spec.md:168` "Write it as JSON to a temporary file outside the project", `:177-179`, `:201-209`; `plugins/better/scripts/render-spec.mjs` header ("an ephemeral file — authored in-session, never stored in the project"); `templates/functional-spec-template.md:3-5`; `docs/philosophy.md` principles 6 and 7.
- **Raised by:** 1 of 3.
- **Closes in:** `better:spec` — provenance, decisions, and evidence written into the markdown source; the page derived from it, not from an ephemeral view-model.
- **Status:** scheduled — `roadmap-2.0.md` 1.3.

### 11. Tech gates its write on per-section approvals and is exempt from the write-before-ask lint

- **Promise:** the deliverable must exist for a yes/no to happen (principle 3); `awos` checks its own work — here, its own prompts against the repo's write-before-any-dismissable-question contract (principle 5).
- **Today:** `/awos:tech` Step 3 asks section-by-section approval "before moving on", all before the Step 4 write; under `claude -p` a dismissed question ends the turn with no `technical-considerations.md`. The prompt's own editor note admits the INTERACTION rule is "necessary but not sufficient". `tasks` has the same shape (approval for an untestable slice before its write). The lint's producer list omits `tech.md` and only greps for phrases, so the suite is green while the contract is structurally unmet. `AWOS_UNATTENDED` is honoured only by the spec commands; product, architecture, tasks, and tech each infer "unattended" from a dismissed question and proceed on a different default.
- **Evidence:** `commands/tech.md:35,78,88`; `commands/tasks.md:46,62,130`; `tests/lint-prompts.test.js:414-450,2963-2969`; `grep AWOS_UNATTENDED commands/` — only the spec commands; `docs/philosophy.md` principles 3 and 5.
- **Raised by:** 3 of 3.
- **Closes in:** `better:tech` — write first, confirm after, honour `AWOS_UNATTENDED`; one unattended contract shared by every `better` command.
- **Status:** scheduled — `roadmap-2.0.md` 1.2 (one unattended contract) and 2.1.

### 12. The one enforced gate is a technical slice-plan review the intent holder cannot evaluate

- **Promise:** the agreement direction's regression is "a confirmation that is a formality because nobody could evaluate it".
- **Today:** the only review that blocks the build is "Looks good — keep it as saved / I want changes" on `tasks.md` — vertical slices with agent markers and verification commands. That is the wrong artifact for the human who holds intent; the artifact they can evaluate (the spec) has no gate (gap 6).
- **Evidence:** `commands/tasks.md:142-144`; `commands/implement.md:44`; `docs/direction.md` "Toward agreement".
- **Raised by:** 1 of 3.
- **Closes in:** `better:implement` — the gate moves from the plan to the confirmed spec (gap 6); whether a plan review survives at all is its design question.
- **Status:** scheduled — `roadmap-2.0.md` 2.2, D-4.

## Implementation

### 13. Coding subagents are told to "ask rather than guess" but have no one to ask

- **Promise:** open questions reach the human (principles 2 and 7).
- **Today:** the `<scope_discipline>` block ends "If something is unclear, ask rather than guessing." An `Agent`-dispatched subagent cannot reach `AskUserQuestion`; the orchestrator defines no protocol for a returned question, and its spot-check only confirms files exist and commands ran. A gap discovered mid-implementation has nowhere to go but a plausible fill.
- **Evidence:** `commands/implement.md:70,85-90`; `docs/philosophy.md` principles 2 and 7.
- **Raised by:** 2 of 3.
- **Closes in:** `better:implement` — a protocol for a subagent's question to reach the human, or to become a marker the run stops on.
- **Status:** scheduled — `roadmap-2.0.md` 2.2 (Run).

### 14. Delegation pastes whole document bodies and the orchestrator re-authors content

- **Promise:** the agreement is the contract (principle 4); the fidelity direction's advance is "implementation that needs less supervision to stay on the agreed path".
- **Today:** `/awos:implement` builds each delegation from "the full context from the three files" plus its own re-written "clear instructions on what code to write" and verification commands authored out of the tech spec. Every re-authoring step is a lossy copy between the agreed text and the builder; the roadmap records measured fidelity leaks from exactly this and names delegate-by-path as the design input.
- **Evidence:** `commands/implement.md:66-74`; `roadmap-2.0.md` 2.2 (delegate-by-path design input and the measured leaks); `docs/philosophy.md` principle 4.
- **Raised by:** 2 of 3.
- **Closes in:** `better:implement` — delegate by path to the agreement, not by pasted and re-authored bodies.
- **Status:** scheduled — `roadmap-2.0.md` 2.2 (delegate-by-path).

## Verification

### 15. Work is declared done before it is checked, and a failed criterion feeds nothing back

- **Promise:** implementation is judged by fidelity to the agreement (principle 4); `awos` does not consider work done until it has made sure of it itself (principle 5). The fidelity direction's advance is "a deviation from the agreement caught by the flow rather than by a person" and "fewer corrections between implementation and verification".
- **Today:** `/awos:implement`'s Step 4 spot-check confirms the report's files exist and the verification commands ran — it never compares the task's outcome to the criterion it realizes — then reports "All tasks complete (100%)". Checking against the agreement is a separate, optional command the human must remember to run. When `/awos:verify` finds an unmet criterion it "report[s] which criterion failed and what's missing, then stop[s]": no task is written back to `tasks.md`, nothing re-runs, and no record of the failure survives outside the chat.
- **Evidence:** `commands/implement.md:83-90,106`; `commands/verify.md:67`; `docs/philosophy.md` principles 4 and 5; `docs/direction.md` "Toward fidelity".
- **Raised by:** 3 of 3.
- **Closes in:** `better:implement` — verification is the loop's own exit criterion; a failed criterion becomes work, not a chat message.
- **Status:** scheduled — `roadmap-2.0.md` 2.2 (Verify).

### 16. Verify checks acceptance criteria, not the agreement as a whole

- **Promise:** verification checks the result against the agreement "rather than only whether the code works" (principle 4), and the agreement is two documents; the fidelity direction's regression is "an agent improvising beyond what was agreed".
- **Today:** `/awos:verify` walks the functional spec's acceptance criteria and nothing else. The spec's Out-of-Scope section is never checked; `technical-considerations.md` is loaded, then set to `Completed` without any comparison against what was built, so a build that honoured a wrong `**Assumption:**` passes. Improvisation that stays inside the criteria is invisible to the flow.
- **Evidence:** `commands/verify.md:13,56-61,74-75`; `templates/functional-spec-template.md:36-46`; `docs/philosophy.md` principle 4; `docs/direction.md:45`.
- **Raised by:** 2 of 3.
- **Closes in:** `better:implement` — verify against the whole agreement: acceptance criteria, Out-of-Scope, and the confirmed technical decisions and assumptions.
- **Status:** scheduled — `roadmap-2.0.md` 2.2 (Verify names Out-of-Scope and the confirmed technical decisions).

### 17. Verification is done three times by three mechanisms

- **Promise:** the smaller-surface direction's regression is "two ways to do the same step"; a newcomer should be able to see the path.
- **Today:** per-slice `Verify:` tasks, a mandatory Feature Testing & Regression slice that generates acceptance tests "against functional-spec.md", and `/awos:verify`, which disclaims being a test runner and checks the same criteria again by hand. None is the implement loop's own exit criterion, and a newcomer cannot tell which one is _the_ check against the agreement.
- **Evidence:** `commands/tasks.md:76,94-99`; `commands/verify.md:37`; `docs/direction.md` "Toward a smaller surface".
- **Raised by:** 1 of 3.
- **Closes in:** `better:implement` — one check against the agreement, not three.
- **Status:** scheduled — `roadmap-2.0.md` 2.2.

### 18. Dead confirmation vocabulary

- **Promise:** write for the reader (principle 6); "where it cannot make sure, it says so" (principle 5).
- **Today:** `verify` Step 6 reports "criteria marked `[?]`" for a "Verification disabled" mode that no step defines — Step 3's only outcomes are `[x]`, stop, or ask; "I verified manually" marks `[x]`, indistinguishable from an agent-verified criterion. Both templates enumerate `In Review | Approved` with no producer. Agents and humans read a state machine that has one live transition.
- **Evidence:** `commands/verify.md:98` vs `:59-68`; `templates/functional-spec-template.md:4`; `templates/technical-considerations-template.md:20`; `docs/philosophy.md` principles 5 and 6.
- **Raised by:** 2 of 3.
- **Closes in:** `better:spec` (a status the flow actually writes and reads) and `better:implement` (a distinguishable mark for criteria `awos` could not check).
- **Status:** scheduled — `roadmap-2.0.md` 1.1 and 2.2 (Verify).

### 19. `awos` prescribes a test regime and evidence conventions inside the user's project

- **Promise:** "improvements to code quality in general belong to the host tool" (principle 4); test suites are something `awos` plugs into, never provides (principle 9) — the ground on which PR #114 was closed.
- **Today:** `/awos:tasks` mandates a Feature Testing & Regression slice with `@spec`/`@regression` annotations "for long-term regression", artifacts "intentionally kept for the regression suite", RED-validation wording "downstream automations depend on", and a QA-agent selection order; `agent-template.md` bakes RED validation into every hired agent; `/awos:verify` writes screenshots into `docs/screenshots/` in the user's repo and declares git-ignoring it the user's one-time chore. The prompts prescribe what `docs/testing-strategies.md` disclaims ("does not mandate TDD, BDD, or any specific testing strategy"). When no QA-coded agent exists, the slice where `awos` checks its own work runs under the generalist, or is dropped.
- **Evidence:** `commands/tasks.md:65,91-99` and the Step 5 drop-the-slice option; `commands/verify.md:40`; `templates/agent-template.md:22-23`; `docs/testing-strategies.md:7`; PR #114 close comment (2026-09-10); `docs/philosophy.md` principles 4 and 9.
- **Raised by:** 2 of 3.
- **Closes in:** `better:implement` — acceptance-level proof of the agreement stays; ownership of the team's regression suite, RED-validation prescriptions, and the `docs/screenshots/` convention go.
- **Status:** scheduled — `roadmap-2.0.md` 2.2 ("Not in the command") for the command; the same prescriptions in `templates/agent-template.md` have no item yet — they ride the hire decision (D-7).

## Memory

### 20. Knowledge upkeep is delegated to people, and nothing records what the product now does

- **Promise:** "The method keeps that knowledge current itself rather than asking people to" (principle 8); "A new piece of work starts from what the product already is". The memory direction's three regressions all apply: "artifacts treated as disposable", "upkeep delegated to people", "a document nothing in the flow keeps current".
- **Today:** `/awos:verify` Step 5 detects drift between the implementation and the product or architecture documents and then "Tell[s] the user which command to run", skipping itself "if no significant implementation learnings" — a judgment nobody checks. Product and architecture Update Modes have a receiving side; nothing in the flow invokes it. `/better:spec` starts every feature from `product-definition.md` alone — its inputs list no prior spec, and the codebase lane's charge of "in-repo documentation" does not reliably reach earlier agreements or their Change Logs — so spec 007 knows nothing of what specs 001–006 established except by accident. After `verify` stamps a spec `Completed`, its confirmed behaviour is folded into nothing; the product definition's `Version: 1.0 / Status: Proposed` never transitions.
- **Evidence:** `commands/verify.md:77-92`; `commands/product.md:60`; `plugins/better/commands/spec.md:32-41,75-78,94`; `templates/product-definition-template.md:3-4`; `docs/philosophy.md` principle 8; `docs/direction.md` "Toward memory".
- **Raised by:** 3 of 3.
- **Closes in:** `better:implement` — fold confirmed behaviour into the product and architecture documents itself after verification; `better:spec` — read what earlier specs established.
- **Status:** scheduled — `roadmap-2.0.md` 3.4 (write side) and 0.1 (read side, PR #205).

### 21. `research-notes.md` is written for the tech phase, which never opens it

- **Promise:** keep the structured source useful for agents (principle 6); the memory direction's regression is "a document nothing in the flow keeps current".
- **Today:** the research lanes recover intent from code, web, and knowledge base; the raw technical form is filed in `research-notes.md` explicitly "preserved for the technical spec phase". `/awos:tech`'s inputs are the functional spec, `architecture.md`, and a fresh `Explore` of the code — it re-discovers what the spec phase already found and never sees the web or knowledge-base findings at all, which exist downstream only in translated user language. The command's own contract admits "nothing downstream depends on it".
- **Evidence:** `plugins/better/commands/spec.md:40,131`; `commands/tech.md:17-25,50-54`; `CLAUDE.md` ("nothing reads it automatically"); `docs/philosophy.md` principle 6; `docs/direction.md` "Toward memory".
- **Raised by:** 3 of 3.
- **Closes in:** `better:tech` reads `research-notes.md`, or `better:spec` stops writing it.
- **Status:** scheduled — `roadmap-2.0.md` 2.1.

### 22. THE spec has no amendment path of its own, and amending the agreement does not reopen the build

- **Promise:** knowledge produced by a change outlives the change (principle 8); the agreement is the contract for the build and a deviation from it is made visible sooner (principle 4; fidelity direction).
- **Today:** `/better:spec` refuses amendment-shaped prompts — "This command creates new specs only … point the user to `/awos:spec`" — so the only way to change a confirmed requirement after a bug fix or a decision reversal is the retired command, whose Update Mode has none of THE spec's rigor (no research, no blind verification, no review page); an amended agreement is confirmed with less care than the original. The template's Change Log is written by nothing in the better flow. And whichever command amends, nothing marks the affected tasks as needing re-implementation or the spec as needing re-verification: the retired Update Mode keeps a completed spec at `Completed` by explicit rule, `verify` auto-selects only specs not yet `Completed`, and `implement` auto-selects by incomplete items in `tasks.md`, which an amendment never touches. A changed agreement and an unchanged build coexist silently. This is the one place a downstream behaviour depends on something only the old spec produces.
- **Evidence:** `plugins/better/commands/spec.md:62`; `plugins/better/README.md:24`; `templates/functional-spec-template.md:50-54`; `commands/spec.md:66` ("do not force a transition"); `commands/verify.md:51`; `commands/implement.md:42`; `docs/philosophy.md` principles 4 and 8.
- **Raised by:** 3 of 3 for the missing amendment path; the reopen-the-build facet is carried over from the 2026-09-17 draft.
- **Closes in:** `better:spec` — an Update Mode with the same rigor as creation; `better:implement` — an amended agreement reopens the affected tasks and re-verification.
- **Status:** scheduled — `roadmap-2.0.md` 1.9 for the amendment path; the reopen-the-build facet is in 2.2's scope by gap number but not yet in its described shape.

## Surface

### 23. The `better` flow is unreachable through the shipped onboarding path

- **Promise:** "a surface small enough that a newcomer can see that path in it" (smaller-surface direction); the direction's advance is "a proven experiment folded into core and its predecessor removed".
- **Today:** not the coexistence point, which is decided, but the positioning while it lasts. `npx @provectusinc/awos` copies the core commands and registers the marketplace but does not install `better`; the user must discover `/plugin install better@awos-marketplace` alone, and the knowledge-base lane additionally needs the `awos` plugin. `README.md`, all of `docs/commands/`, `CONTRIBUTING.md`, the upgrade guide, and every next-command pointer in `architecture` and `hire` name the core commands; the word `better` appears nowhere in the README or the command docs; the plugin describes itself as "an experimental, higher-rigor take on /awos:spec". A person following the shipped docs never encounters the method's spec step today, and as `better:product`, `better:architecture`, `better:tech`, and `better:implement` land the same positioning will hide the whole method behind an unmentioned plugin install.
- **Evidence:** `README.md:38-44`; `docs/commands/spec.md`; `docs/2.0/upgrading-1.x.md:15`; `commands/architecture.md:145`; `commands/hire.md:257`; `plugins/better/README.md:9-15,31,61-63`; `plugins/better/commands/spec.md:2,10`; `src/config/setup-config.js:36-73`; `docs/direction.md:53`.
- **Raised by:** 3 of 3.
- **Closes in:** not a command — installer installs the `better` plugin as the path; README, `docs/commands/`, and next-command pointers name the `better` commands.
- **Status:** scheduled — `roadmap-2.0.md` 4.1 (D-10).

### 24. `/awos:hire` and the unconditional MCP registration provision the host, not the method

- **Promise:** team tooling is "something `awos` plugs into, never something it provides" (principle 9); `awos` is not "a Claude Code distribution or a bundle of best practices" ([Philosophy](../philosophy.md) "What awos Is Not"); the smaller-surface direction's regression is "a feature that serves the host tool rather than the method".
- **Today:** `hire` installs skills, MCP servers, pre-built agents, and lifecycle hooks (format-on-edit, lint and test gates, commit checks — delivery tooling the philosophy says `awos` plugs into) from a Provectus registry, proposes a "Solution Ownership" agent for "project tracking, analytics", and writes `context/product/hired-agents.md`, a coverage report read by no command that "goes stale as soon as `.claude/agents/` or `architecture.md` changes". The installer writes the registry's remote MCP endpoint into every project's `.mcp.json` as step 5 of 6, unconditionally, with no consent gate and no opt-out flag. `architecture` recommends hire "always"; `tech` emits pre-filled hire commands; `tasks` names `testing-expert` and the registry. Staffing itself has no answer on the path: `tasks` surfaces a gap as a question, `implement` substitutes a generalist, and the only thing that closes the gap sits outside the per-feature path. The roadmap records it as "kept as is, knowingly against the philosophy, until that decision is made".
- **Evidence:** `commands/hire.md:13,54,91-96,131-157,193-200`; `src/services/mcp-configurator.js:14-18`; `src/core/setup-orchestrator.js:103-110`; `commands/architecture.md:139-145`; `commands/tech.md:94`; `commands/tasks.md:87,139,150`; PR #200 (Phase 3 revert note, 2026-09-17); `docs/philosophy.md` principles 9 and 10, "What awos Is Not"; `docs/direction.md` "Toward a smaller surface".
- **Raised by:** 3 of 3.
- **Closes in:** undecided — whether `hire` gets a `better` version, or the step leaves the path, is the hire decision; the installer's MCP registration follows it.
- **Status:** undecided — this _is_ the hire decision, `roadmap-2.0.md` D-7 (Phase 4).

### 25. The audit is outside the path and scores 2.0 projects down for following 2.0

- **Promise:** `awos` is not "a code-quality or engineering-metrics tool" ([Philosophy](../philosophy.md) "What awos Is Not"); a check that is wrong is worse than none (principle 5); anything that does not move the outcome is waste (principle 1).
- **Today:** the audit is the bulk of the repo — engine, 26 MB of committed grammars, QA harness, the `standards-refresh` maintainer skill, three CI jobs, the marketplace machinery, and roughly half the lint tests. Its Spec-Driven-Development dimension still encodes 1.x: SDD-01 lists `roadmap` among the expected commands and SDD-02 requires `context/product/roadmap.md` "with at least one phase with checklist items", so a project on the 2.0 method is scored down for following it. The plugin README still positions the audit as the first onboarding step for existing codebases, and its closing step upsells installing `awos` — the tool measuring the tool.
- **Evidence:** `plugins/awos/skills/ai-readiness-audit/dimensions/spec-driven-development.md:11,19,31-38,75-81`; `plugins/awos/skills/ai-readiness-audit/detectors/spec_driven_development.ts:83`; `plugins/awos/skills/ai-readiness-audit/SKILL.md` Step 6; `plugins/awos/README.md:19`; `.github/workflows/quality-check.yml:72-104`; `roadmap-2.0.md` Phase 5 (acknowledged: the stale check rides until the audit retires); `docs/philosophy.md` "What awos Is Not".
- **Raised by:** 3 of 3.
- **Closes in:** not a command — `roadmap-2.0.md` Phase 5.
- **Status:** scheduled — `roadmap-2.0.md` Phase 5, gated on an external successor with no date.

### 26. Path commands provision the host mid-flow

- **Promise:** host primitives are used, not provisioned (principles 9 and 10).
- **Today:** `tasks` checks for "MCPs, services, and dependencies needed for testing", instructs the user to install what is missing, and emits an "Install browser MCP" recommendation table; `verify`'s evidence rules assume browser automation exists. The plan step becomes a tooling-setup step — the same serve-the-host pattern as hire, inside the path itself.
- **Evidence:** `commands/tasks.md:62,145-149`; `commands/verify.md:40`; `docs/philosophy.md` principles 9 and 10.
- **Raised by:** 1 of 3.
- **Closes in:** `better:implement` — no tooling-install asks inside the path.
- **Status:** scheduled — `roadmap-2.0.md` 2.2 ("Not in the command").

### 27. Three version lines with three-file lockstep each, and the method's spec behind marketplace machinery

- **Promise:** the smaller-surface direction — does this make the method more visible, or the tool bigger?
- **Today:** maintainers move three independent version lines (npm installer, `awos` plugin, `better` plugin), each pinned by a lint test that exists to force a three-file discipline; the installer registers a marketplace in every user's settings whose purpose is to host the legacy audit and the method's own spec.
- **Evidence:** `CLAUDE.md` plugin-version sections; `tests/lint-prompts.test.js:2049,2082`; `.claude-plugin/marketplace.json`; `src/services/marketplace-configurator.js`; `docs/direction.md` "Toward a smaller surface".
- **Raised by:** 1 of 3.
- **Closes in:** not a command — collapses when `better` becomes core (D-10) and the audit leaves (Phase 5).
- **Status:** scheduled — `roadmap-2.0.md` D-10 and Phase 5.

## `awos` checking its own work

### 28. The repo's own checks do not gate, and no test covers a method contract

- **Promise:** "Quality and the ability to check it advance together" — good work is not done until it can be checked (principle 5), applied to `awos` itself.
- **Today:** every test job in CI — unit/lint/fixtures, engine, coverage gate — carries `continue-on-error: true`; only Prettier can fail a PR, and the README's "flip to required after two consecutive green PR runs" has no owner. Layer 1 pins about ten fine-grained contracts on the retired core spec and one aggregate needle test on THE spec; `tests/README.md` does not list `plugins/better` in Layer 1's scope. The contracts the philosophy actually promises — a confirmation recorded, markers consumed downstream, verify checking the agreement, failures fed back — have no test because the behaviour does not exist (gaps 6, 7, 15). The behavioural suite in `awos-qa` is owed for every 2.0 prompt contract.
- **Evidence:** `.github/workflows/quality-check.yml:28-33,72-75,108-111`; `tests/README.md:26,58`; `tests/lint-prompts.test.js:2114,2826-3002`; `roadmap-2.0.md` 1.5 and 2.4; `docs/philosophy.md` principle 5.
- **Raised by:** 3 of 3.
- **Closes in:** not a command — CI gates flipped to blocking; lint scope extended to `plugins/better`; behavioural contracts for each `better` command land in `awos-qa` with the command.
- **Status:** scheduled — `roadmap-2.0.md` 1.5 and 4.4; awos-qa Phase B in 2.4.

### 29. Docs overclaim outcomes and still speak multi-host

- **Promise:** judged by outcome — documents that promise more than the outcome are waste (principle 1); "where it cannot make sure, it says so" (principle 5); "built for Claude Code, by design" (principle 10).
- **Today:** `README.md` still promises agents "execute large-scale features independently — ensuring results that are production-ready"; the implement docs say the agents "run the code and check results themselves"; the tech docs say "Nothing is silently assumed" while the prompt records best-fit options as assumptions when no one answers; verify's own constraints say look-and-feel needs the human. `.github/copilot-instructions.md` is a second-host agent file that misdescribes the installer ("copies files only if they don't exist"; commands copied to `.claude/commands/awos/`); `docs/testing-strategies.md` sends teams to `.cursor/instructions.md` and Copilot files and offers a copy-paste best-practices template; the README's "Customizing awos" section positions wrapper editing as the way to shape the method.
- **Evidence:** `README.md:5,70-105`; `docs/commands/implement.md:38-39`; `docs/commands/tech.md:26` vs `commands/tech.md:32`; `commands/verify.md:40`; `.github/copilot-instructions.md:31-34,95`; `docs/testing-strategies.md:84,86-130`; PR #167 close comment (multi-host adapters, principle 10); `roadmap-2.0.md` 4.5; `docs/philosophy.md` principles 1, 5, 10.
- **Raised by:** 3 of 3.
- **Closes in:** not a command — docs rewritten with the `better` commands as the path; multi-host files removed.
- **Status:** scheduled — `roadmap-2.0.md` 4.5.

## Not carried over from the retired registry

- The brownfield "regressions" — the cost of a decision already made (Phase 2b), not a gap in the method.
