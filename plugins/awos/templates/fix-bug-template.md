---
description: Fixes one bug end-to-end — diagnoses the root cause, applies a scoped fix with a regression test, re-verifies the touched criteria, and amends the spec when behavior changed.
argument-hint: '[bug — report ID, link, or description]'
---

<!--
Skeleton consumed by /awos:flow, generated alongside implement-feature.md from
the same context/product/delivery-flow.md decision record. The generator
replaces every [bracketed instruction] with project-specific prose from the
decision record, omits stages the decisions rule out, and keeps the stage
marker comments — they let re-runs attribute manual edits to specific stages.
Fixed prose outside brackets survives into the generated command as-is. The
stage markers are HTML comments: never nest them. If the generated file needs
a header comment of its own that mentions the markers, write them in prose
(stage markers of the form awos:flow:stage=name) — never put a literal
arrow-close inside an outer comment, or it closes early and breaks the file.

This is the lighter sibling of implement-feature.md: the three heavy feature
stages (author functional-spec, author tech-considerations, decompose into
vertical slices) collapse into diagnose → fix, and verification is scoped to
the acceptance criteria the bug touched instead of the full set. It reuses
delivery-flow.md §2 git flow, §3 topology, §4 review gates, §5 delivery/merge,
§6 trigger, §7 tooling, §8 context strategy, §9 notifications — only the middle
changes.
-->

# Fix a Bug End-to-End

Takes one bug — its report from [source per §1 of delivery-flow.md, a bug report rather than a feature ticket] — and drives it through diagnosis, a scoped fix with a regression test, re-verification of the touched acceptance criteria, and delivery until it is closed. On the way it keeps the owning spec honest: when the fix changes documented behavior, it amends that spec rather than letting it drift.

## Notifications

[Per §9 of delivery-flow.md: on each recorded transition (e.g. root cause found, fix pushed, change request opened, gates passed, merged, closed, blocked-and-waiting), post a short status to the team channel via its §7 transport. Omit this section entirely if §9 records "none".]

## Arguments

`$ARGUMENTS` — [expected bug reference shape per §1: a report ID, URL, or a free-text description]. If empty, ask the user.

## Context Discipline

A flow degrades in one long context window. Per §8 of delivery-flow.md:

- Run every isolatable stage in a subagent (a subagent can invoke `/awos:*` commands via the Skill tool; its context is discarded on completion). Subagent reports must be terse — paths, verdicts, counts — never full diff, log, or review content.
- After each completed stage, append an entry to `context/spec/{SPEC_NAME}/flow-log.md` (or `context/fix-log-{BUG_ID}.md` when the bug maps to no spec): the stage name, what was produced and where (paths, branch, commit, change-request link), the classification verdict once known, any decisions taken, and which stage comes next. The log is the flow's memory outside the context window — a fresh session resumes by reading this one small file.
- Never launch a nested headless session (`claude -p`) from this command — permission modes, PATH, and timeouts differ per machine. Unattended chaining belongs to the trigger setup (§6), outside this command.
- Tell every dispatched subagent: tools are functional — do not test them or make exploratory calls; every call needs a purpose. Run each delegated stage on the model tier recorded in §8 — the fast tier for mechanical transport work, the strongest for judgment (diagnosis, classification, review).

This command is an orchestrator. It diagnoses and decides, but the code change goes through a delegated specialist — **do not edit code in the main context**.

<!-- awos:flow:stage=fetch-bug -->

### Step 1: Fetch & Normalize the Bug

[Connector-specific fetch using the chosen transport from §7 of delivery-flow.md, with its recorded fallback — reuse §1, but the source is a bug report rather than a feature ticket. Extract and keep: bug ID, title, the reported symptom, reproduction steps if given, affected area, link. For description-only sources this stage just normalizes the input. Store the bug ID as `BUG_ID`.]

[Crash-report source (per the Bug-fix Flow source decision — e.g. Crashlytics, Sentry): fetch the issue and its most recent events via the §7 transport for the crash tool, and use the title/subtitle as the problem statement. Map every app-frame in the stack to a real `file:line` in the local checkout (Grep/Read), ignoring system frames. **If the stack is unsymbolicated** (raw addresses, no file/line), say so explicitly and do not invent line numbers — the symbol file (dSYM/source map) for that build was likely not uploaded. Capture impact — affected versions, user count, first/last-seen — and prefer a source-typed branch name (e.g. `bug/crash-<short-id>`) per §2. The diagnose stage starts from this stack context. Omit this paragraph when the bug-fix source decision does not include crash reports.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=resume-detection -->

### Step 2: Detect the Entry Point

Same resume logic as implement-feature. Start with a cheap preflight on the fast model tier (per §8): is this bug already fixed — a merged change request, a recorded close? If so, report that and stop. Then, if a flow log for this bug exists (`context/spec/{SPEC_NAME}/flow-log.md`, or `context/fix-log-{BUG_ID}.md`), read it first — it names the last completed stage and carries the branch, commit, classification verdict, and change-request state, and is the resume signal for the middle stages that produce no scannable artifact.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=workspace -->

### Step 3: Prepare the Workspace

[Per §2–§3 of delivery-flow.md: verify `context/` is reachable and current; warn on a dirty working tree (uncommitted AWOS artifacts left by `/awos:flow` are an expected cause, not a blocker); create the branch (or worktree, per the recorded recipe) from the base branch using the team's naming convention; submodule init/update if required. Store the branch name as `BRANCH`.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=diagnose -->

### Step 4: Diagnose

Reproduce the bug and find the root cause. Delegate the investigation to the built-in `Explore` subagent or a debugging specialist via **[Agent: name]** (per §8 model tier — judgment work) — the orchestrator does not read the whole codebase or write code itself. The subagent returns terse: the reproduction, the root-cause location (file/function), and a proposed minimal fix shape. If the bug cannot be reproduced, report that and stop rather than guessing at a fix.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=classify -->

### Step 5: Classify — Conformance vs. Divergence

This gate decides whether the spec gets amended later, so it runs **before** any fix touches behavior. Locate the owning `context/spec/NNN-*/` for the affected behavior (read its `functional-spec.md`), then classify:

- **Conformance bug** — the code violates a _correct_ spec. The acceptance criteria were right; the code was wrong. → Fix the code and add a regression test; **do not** amend the spec.
- **Divergence** — the spec was wrong or incomplete, or the fix intentionally changes documented behavior. → Fix, add a regression test, and **amend** the owning spec in the `amend-spec` stage.

If the bug maps to **no** existing spec (legacy or cross-cutting behavior), do not fabricate one — record "no owning spec" and proceed without amendment. Record the verdict and the owning spec dir (or "none") in the flow log; later stages read it.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=fix -->

### Step 6: Fix

Delegate the code change to a specialist via **[Agent: name]** (chosen from §8 / the hired roster for the affected area) — the orchestrator never edits code itself. Keep the change scope-disciplined: a flat task list targeting the root cause, no vertical slicing, no opportunistic refactors beyond what the fix needs. Pass the subagent the root-cause findings from Step 4 and the classification, not a re-derivation.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=regression-test -->

### Step 7: Regression Test

Add one test that fails on the old code and passes on the fix, capturing the bug so it cannot silently return. Delegate it to the testing specialist via **[Agent: name]**. Honor the `<!-- skip-tests: true -->` marker: if the owning spec's `tasks.md` carries it (the team opted out of generated test suites), skip adding an automated test and note that the regression is covered by the look-and-feel check in the next stage instead.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=verify-criteria -->

### Step 8: Verify the Touched Criteria

Re-check **only** the acceptance criteria the bug touched, with `/awos:verify`'s evidence discipline — drive the UI/API for real, screenshot visual criteria to `docs/screenshots/`, and `AskUserQuestion` when a criterion can't be auto-verified. This is scoped: it does not re-run the whole acceptance set, does not flip the spec's Status, and honors `<!-- skip-tests: true -->` (look-and-feel walk-through only, no test suites). Report the criteria checked and their evidence.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=amend-spec -->

### Step 9: Amend the Spec (on divergence)

Conditional on the Step 5 verdict:

- **Conformance** — nothing to amend; the spec was already correct. Skip to the next stage.
- **Divergence** — invoke `/awos:spec` in update mode for the owning spec, passing the spec directory and a description of the behavior change (e.g. `/awos:spec amend spec NNN: <what changed and why>`). `/awos:spec`'s Mode Detection routes this to its Update Mode, which edits the affected acceptance criteria in place and appends a dated `## Change Log` entry — no new spec index is allocated, and a `Completed` Status is left untouched. Do not duplicate the amendment prose here; the amendment capability lives in core `/awos:spec`.

In either case, if the fix revealed that `product-definition.md` or `architecture.md` also drifted, surface the same `/awos:product <…>` / `/awos:architecture <…>` suggestions `/awos:verify` Step 5 emits — as suggestions, never auto-edits.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=commit-push -->

### Step 10: Commit & Push

Stage all changed files, excluding `.env`, credentials, and secrets. [Commit message convention per §2, referencing `BUG_ID`; pre-commit hook failures: fix and amend.] Push `BRANCH` to the remote.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=remote-gates -->

### Step 11: Remote Gates

[Per §2 sync policy: before opening the change request, fetch the target branch and verify the branches merge cleanly — a dry-run merge or rebase. On conflicts: delegate resolution to a subagent (per §8), re-run the local gates on the resolved result, and push.]

[Per §4: open the change request via the chosen transport from §7, then wait on every remote gate concurrently — CI checks, the automatic reviewer's pass (address its findings), human review (wait-or-poll policy), environment/soak/compliance gates — and join them before merge. On CI failure, per the recorded policy: delegate diagnosis and the fix to a subagent working from the failed job's logs, push, re-check until green — or report the first results and hand off. For a repo with no code host, the local suite already served as the gate — omit this stage and any other gate §4 rules out.]

Wait with the `Monitor` tool, never foreground `sleep` loops: a poll loop that emits each gate's terminal result and exits when all are settled, its timeout sized to the typical pipeline duration recorded in §4, the poll interval 30s+ against remote APIs, and the filter covering every terminal state — failures and cancellations, not just success.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=merge -->

### Step 12: Merge

[Per §2: the target branch may have moved while the gates ran — re-check mergeability via the chosen transport or a fresh fetch + dry-run merge. If it no longer merges cleanly: sync per the recorded policy (resolution delegated per §8), push, and return to Step 11 — the remote gates run again on the new commit before any merge.]

[Per §5 merge policy: a human merges — stop here and report the ready-to-merge state — or the flow merges via the chosen transport from §7, or a plain `git merge` + push for a repo without a code host.]

Merging is irreversible. Even when the recorded policy lets the flow merge, ask the user for confirmation in this run, after showing that every gate is green. A skipped or unanswered confirmation means do not merge — report the ready-to-merge state and stop.

[Per §5 post-merge CI: pipelines triggered by the merge on the base branch — watch them via the chosen transport and, per the recorded policy, fix failures forward or report them. Omit if nothing runs on merge.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=close-ticket -->

### Step 13: Close the Ticket

[Per §5's definition of Done: gather the recorded evidence and report the final state to the user. When the source has tickets, transition the bug to its closed/fixed state using the chosen transport and attach the evidence; omit the transition for ticketless sources — the report to the user is the close.]

Include the local review and the spec-amendment outcome in the reported evidence, so neither is buried in the logs. From the flow log, report: the review **verdict**, the **finding count** (by severity), the **review file path** (`context/spec/{SPEC_NAME}/review.md`, or the path a reused review command used), that a manual keep/drop gate ran over the findings, and — for a divergence fix — that the owning spec was amended (the criteria touched and the Change Log entry). The path lets the user re-open the full review without re-running.

[Crash-report source: optionally write a short investigation note back to the crash issue via the §7 transport — root cause, branch, files touched — but never auto-close it; a crash resolves on its own once a non-crashing build ships.]

<!-- /awos:flow:stage -->

---

<!-- awos:flow:generated date=[YYYY-MM-DD] source=context/product/delivery-flow.md -->
