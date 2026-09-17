# Gaps

- **Author:** Daria Garanina
- **Created:** 2026-09-17
- **Role:** where the path, as it exists on this branch, does not keep the method's promise. The plan that closes a gap lives in `refactoring-roadmap.md`; this document only names the gap, the evidence, and its status.

**Starting point.** The method promises one path — intent → confirmed understanding → implementation → verification — whose product is agreement ([Philosophy](../philosophy.md)). Each gap below is a place where the commands on this branch do not keep that promise, judged against the principles and the five directions ([Direction](../direction.md)), with the prompt step that shows it. Written from a blank page on 2026-09-17; the earlier registry (`known-gaps.md`) was deleted the same day and nothing here inherits its numbering or diagnoses.

**Status vocabulary.** _open_ — nobody owns it yet; _scheduled_ — a roadmap phase closes it; _undecided_ — closing it waits on a decision that has not been made.

## Intent: gathered, then confirmed

### 1. Core spec never looks at the code

- **Promise:** intent lives partly in "a behavior of the existing system that everyone assumes and nobody wrote down" ([Rationale](../rationale.md)); `awos` goes and finds it (principle 2).
- **Today:** `/awos:spec` Step 2 reads the product definition and whatever the prompt points at, then interviews. It does not read the codebase for the feature's current behaviour. `/better:spec` does — that is why it exists.
- **Evidence:** `commands/spec.md` Step 2 vs `plugins/better/commands/spec.md` research fan-out.
- **Status:** scheduled — Phase 6B folds `better:spec` into core.

### 2. Specs do not read each other

- **Promise:** a new piece of work starts from what the product already is (principle 8); `awos` asks the human only what nobody else can answer (discovery direction).
- **Today:** a new spec starts from the product definition and the prompt. Earlier functional specs — the product's confirmed behaviour — are not consulted, so "what does this leave unchanged?" cannot be answered and the interview re-asks what an earlier spec settled.
- **Evidence:** `commands/spec.md` Step 2 lists `product-definition.md` as the only document read; no reference to `context/spec/*/functional-spec.md` outside Update Mode.
- **Status:** open.

### 3. The product definition goes stale by design

- **Promise:** the method keeps project knowledge current itself rather than asking people to (principle 8; memory direction names "upkeep delegated to people" as the regression).
- **Today:** the only upkeep is `/awos:verify` Step 5, which _suggests_ a `/awos:product` or `/awos:architecture` command for the human to run by hand.
- **Evidence:** `commands/verify.md` Step 5 "Review Product Context".
- **Status:** open.

## Confirmed understanding

### 4. Open questions are not a gate

- **Promise:** what cannot be found is surfaced as an open question, never filled by guessing (principles 2 and 7), and understanding is confirmed before anything is built (principle 3).
- **Today:** spec marks unresolved details `[NEEDS CLARIFICATION: …]`, tech records assumptions, tasks records staffing gaps. Nothing downstream reads any of them — tech, tasks, implement and verify contain no reference to the markers — so a build can start on a spec with open questions still in it.
- **Evidence:** `grep "NEEDS CLARIFICATION" commands/*.md` matches only `spec.md`.
- **Status:** open. Cheap to close: `/awos:implement` already refuses a `tasks.md` carrying `<!-- not-user-reviewed -->`; the same check on unresolved markers is the same shape.

### 5. The confirmation moment is a full-document read

- **Promise:** derive focused human-facing views from the structured source whenever someone needs to review or decide (principle 6); "more content to review without more decisions to make" is the agreement direction's regression.
- **Today:** core has no human view; the reviewer confirms by reading the whole spec. `/better:spec` renders one (`render-spec.mjs`).
- **Evidence:** `commands/spec.md` Step 6 presents the saved markdown; the renderer exists only under `plugins/better/`.
- **Status:** scheduled with Phase 6B — listed on its own so the render is not dropped in the fold.

### 6. Amending the agreement does not reopen the build

- **Promise:** the agreement is the contract for the build; a deviation from it is made visible sooner (principle 4; fidelity direction).
- **Today:** spec Update Mode edits acceptance criteria in place and, for a completed spec, leaves Status as `Completed`. Nothing marks the affected tasks as needing re-implementation or the spec as needing re-verification, so a changed agreement and an unchanged build coexist silently.
- **Evidence:** `commands/spec.md` Update Mode step 4 ("do not force a transition").
- **Status:** open.

## Implementation

### 7. Deviation is only caught if the subagent confesses

- **Promise:** a deviation from the agreement is caught by the flow rather than by a person, and sooner (fidelity direction; principle 5).
- **Today:** each subagent is told not to improvise (`<scope_discipline>`) and must cite evidence for completion claims, but nothing compares what was built against the agreement until `/awos:verify` runs at the end.
- **Evidence:** `commands/implement.md` Steps 3–4; the only post-task check is the orchestrator's spot-check of the subagent's own evidence.
- **Status:** open; overlaps the Phase 6A design question of how `implement` verifies as it goes.

### 8. Staffing has no answer on the path

- **Promise:** every task marker must resolve to an agent that can do the work (principle 4 presumes the specialist exists).
- **Today:** `/awos:tasks` surfaces a gap as an open question, `/awos:implement` substitutes a generalist and reports it, and `/awos:hire` — the only thing that closes the gap — sits outside the per-feature path with its fate undecided.
- **Evidence:** `commands/tasks.md` Steps 3b and 5; `commands/implement.md` Step 2; roadmap Phase 3 (reverted).
- **Status:** undecided — this _is_ the hire decision.

## Verification

### 9. Verify checks acceptance criteria, not the agreement as a whole

- **Promise:** verification checks the result against the agreement (principle 4), and the agreement is two documents: the functional spec and the confirmed technical plan.
- **Today:** `/awos:verify` marks each acceptance criterion against evidence — right as far as it goes — but the technical spec's confirmed design decisions and recorded assumptions are never checked against what was built.
- **Evidence:** `commands/verify.md` Step 3 iterates `functional-spec.md` criteria only; `technical-considerations.md` is loaded but not checked.
- **Status:** open.

### 10. Checking depends on a QA agent existing

- **Promise:** `awos` does not consider work done until it has made sure of it itself (principle 5) — unconditionally.
- **Today:** the Feature Testing & Regression slice is where `awos` checks its own work; without a QA-coded agent it runs under the generalist, or is dropped.
- **Evidence:** `commands/tasks.md` Step 3a and the Step 5 drop-the-slice option.
- **Status:** undecided — same root as gap 8.

## Surface

### 11. Two steps and two spec commands the target flow does not have

- **Promise:** a surface small enough that a newcomer can see the path in it (principle 9; smaller-surface direction).
- **Today:** `tasks` and `verify` are separate commands the target flow absorbs into `implement`; core `spec` and `better:spec` do the same step two ways.
- **Status:** scheduled — Phases 6A and 6B.

### 12. The audit and the sources skill sit off the path

- **Promise:** everything around the path is something `awos` plugs into, never something it provides (principle 9).
- **Today:** the AI-readiness audit measures repository hygiene; `configure-external-sources` records connection state in a file the human maintains.
- **Status:** scheduled — Phases 8 and 7.

## Above all of these

### 13. Nothing measures the outcome

- **Promise:** the measure of `awos` is whether what ships is what was wanted, the first time (principle 1).
- **Today:** no part of the path records whether that happened — no rework signal, no "verify passed on the first build" count, nothing a team could look at after ten features to know whether agreement is paying for itself. The audit measures something else. Every other gap here is argued from principles because there is no instrument to argue from outcomes.
- **Evidence:** absence — no command, artifact, or field carries an outcome.
- **Status:** open, and first in line for a decision on what the instrument is.

## Not carried over from the retired registry

- The brownfield "regressions" — the cost of a decision already made (Phase 2b), not a gap in the method.
- SDD-02's roadmap requirement — a bug in an off-path tool, tracked with the audit, not here.
