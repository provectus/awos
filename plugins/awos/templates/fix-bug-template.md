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
- After each completed stage, append an entry to `context/spec/{SPEC_NAME}/flow-log.md` (or `context/fix-log-{BUG_ID}.md` when the bug maps to no spec): the stage name, what was produced and where (paths, branch, commit), the classification verdict once known, any decisions taken, and which stage comes next. The log is the flow's memory outside the context window — a fresh session resumes by reading this one small file. It is committed with the work (commit-push stages it alongside the code), so it must never become an uncommittable leftover: **once the change request is opened — or the change is merged — stop writing to the tracked log.** New commits are unwelcome on a change request under review or already merged, so a late append would strand a change that can never reach it. From that point, report late-stage progress (gate results, merge, close-out evidence) to the user and via §9 notifications, and resume the remote stages from remote state — the open/merged change request and the ticket status, which the resume-detection stage already inspects. The close stage leaves a clean working tree and never writes a final entry it cannot commit.
- Never launch a nested headless session (`claude -p`) from this command — permission modes, PATH, and timeouts differ per machine. Unattended chaining belongs to the trigger setup (§6), outside this command.
- Tell every dispatched subagent: tools are functional — do not test them or make exploratory calls; every call needs a purpose. Run each delegated stage on the model tier recorded in §8 — the fast tier for mechanical transport work, the strongest for judgment (diagnosis, classification, review).
- A subagent's report is a claim, not a fact. Before acting on a report that names files and lines, asserts a root cause, or reports a test outcome, spot-check it — read the named lines, run the named test. The diagnose and regression-test stages spell out their specific checks; the principle applies to every delegated report.
- An unanswered `AskUserQuestion` (the harness returns `No response after 60s` — its guard so unattended runs never hang) is handled by run mode. Read the `AWOS_UNATTENDED` environment variable: when it is set (the §6 trigger setup exports it for cron/`/loop`/`claude -p` drivers), a no-answer is expected — take the safe default and continue. When it is unset the run is interactive, and a timeout usually means the user is thinking or briefly away, not that they have no preference — re-ask the question once, then proceed naming the default you took so they can correct it. A timeout never authorizes an irreversible step: the merge confirmation and the divergence spec-amendment confirmation each treat an unanswered prompt as a no in either mode.

This command is an orchestrator. It diagnoses and decides, but the code change goes through a delegated specialist — **do not edit code in the main context**.

## Flow Self-Correction

When a run disproves something this flow believes — a hook fires that this file says doesn't exist, the tracker rejects a recorded transition, a fresh worktree fails on an unrecorded bring-up step — classify the defect and route it. Never work around it silently: a flow carrying a known-wrong instruction between runs is a time bomb for the next engineer.

- **Fact defect** — a recorded fact in `context/product/delivery-flow.md` (Project Setup, tooling inventory, transition chains, the worktree recipe, probe results) is false. Correct facts, never decisions: fix the fact in the decision record, update the affected stage prose in every generated command that embeds it, and append a Generation Log entry naming the correction and the disproving evidence (the command output or API response that contradicted the record). A correction without reproducible evidence is not applied. Because the fact is fixed in the decision record itself, regeneration re-derives the right prose — this is not a Local Customization. Apply corrections only while the flow can still commit (before the change request opens — the flow-log discipline), so they ship in the same commit and the PR review sees them; discovered later, report the correction as pending in the close-out and let the next run apply it at the workspace stage. Interactive runs show the correction diff for a quick confirm; unattended runs apply fact corrections and announce them via Notifications.
- **Decision friction** — a delivery-flow.md _choice_ (a gate, the autonomy level, the merge policy, a §1–§9 decision) caused the problem. Never edit a decision: report what happened to the user and record which dimension produced friction, for the flow owner to take into a `/awos:flow` re-run. Decisions belong to whoever owns the team's delivery process, not to a run of this command.
- **Generator defect** — the flaw is in how `/awos:flow` generated this command, not in this project's facts. Don't edit; report it as feedback to the AWOS maintainers.

<!-- awos:flow:stage=fetch-bug -->

### Step 1: Fetch & Normalize the Bug

[Connector-specific fetch using the chosen transport from §7 of delivery-flow.md, with its recorded fallback — reuse §1, but the source is a bug report rather than a feature ticket. Extract and keep: bug ID, title, the reported symptom, reproduction steps if given, affected area, link. For description-only sources this stage just normalizes the input. Store the bug ID as `BUG_ID`.]

[Ticket sources: also fetch the ticket's **remote links, attachments, and linked conversations** (tracker remote links, attached screenshots, a linked chat thread) via the §7 transports and read the reachable ones — the report's real context often lives there, not in the description: a screenshot names WHICH surface renders the broken data while the description names another. List anything linked but unreachable in the normalized report instead of silently skipping it, so the diagnosis knows context is missing. Omit this paragraph for description-only sources.]

[Crash-report source (per the Bug-fix Flow source decision — e.g. Crashlytics, Sentry): fetch the issue and its most recent events via the §7 transport for the crash tool, and use the title/subtitle as the problem statement. Map every app-frame in the stack to a real `file:line` in the local checkout (Grep/Read), ignoring system frames. **If the stack is unsymbolicated** (raw addresses, no file/line), say so explicitly and do not invent line numbers — the symbol file (dSYM/source map) for that build was likely not uploaded. Capture impact — affected versions, user count, first/last-seen — and prefer a source-typed branch name (e.g. `bug/crash-<short-id>`) per §2. The diagnose stage starts from this stack context. Omit this paragraph when the bug-fix source decision does not include crash reports.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=resume-detection -->

### Step 2: Detect the Entry Point

Same resume logic as implement-feature. Start with a cheap preflight on the fast model tier (per §8): is this bug **already fixed**? Check the status across every source §1 records (bug reports can live in more than one place) before doing any work — if the tracker ticket is in a closed/fixed state, the crash issue is already resolved, or a merged change request exists, report that and stop rather than re-fixing. Then, if a flow log for this bug exists (`context/spec/{SPEC_NAME}/flow-log.md`, or `context/fix-log-{BUG_ID}.md`), read it first — it names the last completed stage and carries the branch, commit, classification verdict, and change-request state, and is the resume signal for the middle stages that produce no scannable artifact.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=workspace -->

### Step 3: Prepare the Workspace

[Per §2–§3 of delivery-flow.md: verify `context/` is reachable and current; warn on a dirty working tree (uncommitted AWOS artifacts left by `/awos:flow` are an expected cause, not a blocker); create the branch (or worktree, per the recorded recipe) from the base branch using the team's naming convention; submodule init/update if required. Store the branch name as `BRANCH`.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=diagnose -->

### Step 4: Diagnose

Reproduce the bug and find the root cause. Delegate the investigation to the built-in `Explore` subagent or a debugging specialist via **[Agent: name]** (per §8 model tier — judgment work) — the orchestrator does not read the whole codebase or write code itself. The subagent returns terse: the reproduction, the root-cause location (file/function), and a proposed minimal fix shape. If the bug cannot be reproduced, report that and stop rather than guessing at a fix.

A symptom rarely has exactly one renderer. The diagnosis is not done at the first root cause: it must enumerate **every surface that renders or consumes the symptom data** — grep for sibling composers of the same output (other builders of the same title/string, widgets showing the same records, backend notification builders) — and return a verdict per surface, affected or clean. One data gap routinely hides behind several surfaces; fixing the named one and shipping leaves the others to come back as "reopened".

The diagnosis report labels every claim **verified** (the subagent read the named `file:line`, or executed the reproduction) or **hypothesis** — and the orchestrator re-reads the named lines before accepting the fix shape, trimming it to what the code actually shows. A subagent report is a claim, not a fact: a road-test diagnosis proposed a three-file fix where re-reading the cited lines showed one changed line sufficed.

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

"Fails on the old code" is demonstrated, not asserted. The orchestrator verifies the test targets a **changed** site: revert the fix hunk (e.g. stash the fixed files), run the test and watch it fail, restore the fix, watch it pass — then record the fail→pass evidence in the flow log. A subagent can return a green-but-vacuous test that asserts a path that was already correct before the fix; green-on-old-code means the test captures nothing — reject it and have the specialist retarget the changed lines.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=verify-criteria -->

### Step 8: Verify the Touched Criteria

Re-check **only** the acceptance criteria the bug touched, with `/awos:verify`'s evidence discipline — drive the UI/API for real, screenshot visual criteria to `docs/screenshots/`, and `AskUserQuestion` only when a criterion has no agent-driven render path at all. This is scoped: it does not re-run the whole acceptance set, does not flip the spec's Status, and honors `<!-- skip-tests: true -->` (look-and-feel walk-through only, no test suites). Report the criteria checked and their evidence.

Running the app to verify is the flow's job, not the user's. [If §2/§3 recorded a shared resource the app binds — a port a running service holds, a single database, a device — the workspace guardrail reserves it for normal work, but this stage still verifies against a real render: reclaim the resource (stop the service, use an alternate port, spin a throwaway instance) or drive the project's own §5 deploy/run step and verify against that, per the sanctioned verification path §2/§3 records. Do not hand the user a `run` command to execute, and do not defer a drivable criterion to a later manual deploy — the manual `AskUserQuestion` fallback is only for a criterion the agent genuinely cannot render here.]

Scale the evidence to what changed. When the fix touched only the data or payload and the diff contains no render-path edits, the sanctioned evidence is the demonstrated failing→passing regression test plus a unit-level render of the changed data with mocks — standing up the full stack (backend, database, seeded data) to watch an unchanged render branch repeat itself is disproportionate. This tier applies only when the render path is provably untouched by the diff; a fix that edits the render path itself still drives the UI/API for real.

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

Write this stage's flow-log entry **before** staging so the log rides in this commit — this is the flow-log's last committed state (see Context Discipline). Then stage all changed files, excluding `.env`, credentials, and secrets. [Commit message convention per §2, referencing `BUG_ID`; pre-commit hook failures: fix and amend.] Push `BRANCH` to the remote.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=remote-gates -->

### Step 11: Remote Gates

From here the change request is open — **do not append to the tracked flow-log** (Context Discipline): a commit adding log lines is unwelcome on a change request under review, and impossible once it merges. Report gate progress to the user and via Notifications instead; resume relies on the remote state, not the log.

[Per §2 sync policy: before opening the change request, fetch the target branch and verify the branches merge cleanly — a dry-run merge or rebase. On conflicts: delegate resolution to a subagent (per §8), re-run the local gates on the resolved result, and push.]

[Per §4: open the change request via the chosen transport from §7, then wait on every remote gate concurrently — CI checks, the automatic reviewer's pass (address its findings), human review (wait-or-poll policy), environment/soak/compliance gates — and join them before merge. On CI failure, per the recorded policy: delegate diagnosis and the fix to a subagent working from the failed job's logs, push, re-check until green — or report the first results and hand off. For a repo with no code host, the local suite already served as the gate — omit this stage and any other gate §4 rules out.]

[Per §5's ticket-state map (omit for ticketless sources): transition the ticket to the in-review state when the change request opens, and back to the needs-work state if a gate or review fails, re-advancing it when the gates go green again. Follow the recorded transition chain for each event (including intermediate hops), not just the target state name.]

Wait with the `Monitor` tool, never foreground `sleep` loops: a poll loop that emits each gate's terminal result and exits when all are settled, its timeout sized to the typical pipeline duration recorded in §4, the poll interval 30s+ against remote APIs, and the filter covering every terminal state — failures and cancellations, not just success. Apply §4's max-wait & escalation policy when a poll window expires without the gates settling — auto-relaunch the monitor, or ask the human past the recorded threshold; never wait forever.

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

Leave a clean working tree: do not write a closing flow-log entry (the log was finalized at commit-push and the change request is now open or merged — a new entry could never be committed into it). If any flow-created artifact is still uncommitted, surface it in the report rather than leaving it behind — an uncommitted leftover after a merged or in-review change request is a bug, not a record.

<!-- /awos:flow:stage -->

---

<!-- awos:flow:generated date=[YYYY-MM-DD] version=[generator version constant from /awos:flow] source=context/product/delivery-flow.md -->
