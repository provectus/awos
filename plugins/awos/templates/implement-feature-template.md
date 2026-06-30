---
description: Implements one feature end-to-end — fetches its requirements, runs the AWOS chain, and delivers per the team's flow.
argument-hint: '[feature — ticket ID, link, or file path]'
---

<!--
Skeleton consumed by /awos:flow. The generator replaces every [bracketed
instruction] with project-specific prose from context/product/delivery-flow.md,
omits stages the decisions rule out, and keeps the stage marker comments —
they let re-runs attribute manual edits to specific stages. Fixed prose
outside brackets survives into the generated command as-is. The stage markers
are HTML comments: never nest them. If the generated file needs a header
comment of its own that mentions the markers, write them in prose (stage
markers of the form awos:flow:stage=name) — never put a literal arrow-close
inside an outer comment, or it closes early and breaks the file.
-->

# Implement a Feature End-to-End

Takes one feature — its requirements from [source per §1 of delivery-flow.md], wherever they come from — and drives it through spec, implementation, verification, review, and delivery until it is Done.

## Notifications

[Per §9 of delivery-flow.md: on each recorded transition (e.g. spec ready, change request opened, gates passed, merged, deployed, blocked-and-waiting), post a short status to the team channel via its §7 transport — so the team stays aware as the flow runs unattended. Omit this section entirely if §9 records "none".]

## Arguments

`$ARGUMENTS` — [expected ticket reference shape per §1: ID, URL, or file path]. If empty, resume from the next incomplete item in `context/product/roadmap.md` (the first unchecked `- [ ]`, as `/awos:spec` does); if the roadmap is missing or fully complete, ask the user.

## Context Discipline

A flow this long degrades in one context window — judgment is worst exactly where it matters most, at review time. Per §8 of delivery-flow.md:

- Run every isolatable stage in a subagent (a subagent can invoke `/awos:*` commands via the Skill tool; its context is discarded on completion). Subagent reports must be terse — paths, verdicts, counts — never full document or review content.
- After each completed stage, append an entry to `context/spec/{SPEC_NAME}/flow-log.md`: the stage name, what was produced and where (paths, branch, commit, change-request link), any decisions taken along the way, and which stage comes next. The log is the flow's memory outside the context window — a fresh session (after a restart, a crash, or an unattended hand-off between sessions) resumes by reading this one small file instead of re-deriving state from the whole repo. That is what keeps the window small across a long flow: nothing needs to stay in context once it is in the log.
- Never launch a nested headless session (`claude -p`) from this command — permission modes, PATH, and timeouts differ per machine. Unattended chaining belongs to the trigger setup (§6), outside this command.
- Tell every dispatched subagent: tools are functional — do not test them or make exploratory calls; every call needs a purpose. Run each delegated stage on the model tier recorded in §8 — the fast tier for mechanical transport work, the strongest for judgment.

<!-- awos:flow:stage=fetch-ticket -->

### Step 1: Fetch & Normalize the Ticket

[Connector-specific fetch using the chosen transport from §7 of delivery-flow.md, with its recorded fallback. Extract and keep: ticket ID, title, description, acceptance hints, link. For local-file or prompt-text sources this stage just reads/normalizes the input.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=resume-detection -->

### Step 2: Detect the Entry Point

Start with a cheap preflight on the fast model tier (per §8): is this feature **already done**? Check the status across every source §1 records (tickets can live in more than one place) before doing any work — if the tracker ticket is in a Done/closed state, or the owning AWOS spec is already `Completed` (or all its `tasks.md` items are `[x]`), or a merged change request exists, report that and stop. Don't re-run the chain over work that is already delivered. Then: if `context/spec/{SPEC_NAME}/flow-log.md` exists, read it first — it names the last completed stage and carries the branch, commit, and change-request state. The log is a convenience, not ground truth: for the spec-generation stages the on-disk artifacts win when they disagree with the log (a manual or partial rerun can leave it stale) — cross-check `context/spec/` and, if they differ, resume from the first missing artifact and repair the log to match before continuing. Past spec generation there is no such artifact to scan, so the log is the only resume signal. [Per §1: if a spec directory for this feature may already exist under `context/spec/`, inspect it and resume from the first missing artifact — skip `/awos:spec` if `functional-spec.md` exists, skip `/awos:tech` if `technical-considerations.md` exists, and so on. Omit the pre-written-spec handling if specs never arrive pre-written.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=workspace -->

### Step 3: Prepare the Workspace

[Per §2–§3 of delivery-flow.md: verify `context/` is reachable and current; warn on a dirty working tree; create the branch (or worktree, per the recorded recipe) from the base branch using the team's naming convention; submodule init/update if required. Store the branch name as `BRANCH` and the ticket ID as `TICKET_ID` for later stages.] Uncommitted AWOS artifacts — `context/product/delivery-flow.md` and this command file, left by `/awos:flow` — are an expected dirty-tree cause; surface them as such rather than treating them as a blocker.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=specs -->

### Step 4: Generate Specs and Tasks

Run the AWOS commands sequentially, passing the normalized ticket as context. [Per §8: which of the three stay in the main context and which run in a subagent — a command that interviews the user must stay in main; a non-interactive one runs in a subagent returning the artifact path and a one-line verdict.]

1. `/awos:spec` — [approval gate per §4's gate decision]
2. `/awos:tech` — [approval gate per §4's gate decision]
3. `/awos:tasks` — [no gate unless §4 records one] — proceed straight to implementation; the task list stays revisable by re-running `/awos:tasks`.

Store the spec directory name (e.g. `007-tasks-api`) as `SPEC_NAME`.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=commit-specs -->

### Step 5: Commit Specs

[Per §3: stage `context/spec/{SPEC_NAME}/` in the repo that owns it and commit using the team's message convention, referencing `TICKET_ID`.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=implement -->

### Step 6: Implement via Subagents

Run `/awos:implement` [per §8: in the main context if it dispatches subagents itself — a command that dispatches subagents cannot run inside one]. It delegates all coding and tracks progress — do not implement tasks in the main context. Wait for all tasks to complete.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=verify -->

### Step 7: Verify

Run `/awos:verify` [per §8: in a subagent if it is non-interactive], returning the verdict and the list of gaps. Address gaps before proceeding.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=local-review -->

### Step 8: Local Review

The review must stay independent of this conversation's authorship bias:

- The reviewer's prompt below is fixed: pass it verbatim. Do not add run-time focus areas drawn from what you implemented or suspect — the author framing the review is the bias.
- The reviewer writes its findings to a review file and returns only the verdict, the finding count by severity, and that file's path — never the full review body. The generated reviewer subagent writes to a fixed path, `context/spec/{SPEC_NAME}/review.md`; a reused project review command may write elsewhere — capture whatever path it used.
- **Lead the review presentation to the user with that path on its own line** — e.g. `Review file: context/spec/{SPEC_NAME}/review.md` — before the verdict and the findings. A fixed opening line is surfaced reliably; a path appended after a long findings list gets dropped (the recurring failure this guards against). Record the same path in this stage's flow-log entry, so it survives outside the chat even if the line is missed.
- The agent that applies accepted findings reads the review file and the diff fresh — relay the user's keep/drop decisions, not your own summary of the findings.

[Per §4 of delivery-flow.md: static checks, then the local AI review — the reviewer subagent's verbatim prompt, derived from §4 at generation time: the diff range, the spec paths, the project's review rules; findings presented to the user, never auto-fixed; accepted findings applied before anything is pushed. If §4 includes the human-edit loop, also diff the user's edits against the original review and suggest CLAUDE.md amendments for generalizable corrections. If §4 records change-request-first timing, move this stage after Step 9 instead and run the review concurrently with the remote gates — faster wall-clock, at the cost of an extra CI run on unreviewed code.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=commit-push -->

### Step 9: Commit & Push

Stage all changed files, excluding `.env`, credentials, and secrets. [Commit message convention per the team; pre-commit hook failures: fix and amend.] Push `BRANCH` to the remote.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=remote-gates -->

### Step 10: Remote Gates

[Per §2 sync policy: before opening the change request, fetch the target branch and verify the branches merge cleanly — a dry-run merge or rebase. On conflicts: delegate resolution to a subagent (per §8), re-run the local gates on the resolved result, and push.]

[Per §4: open the change request via the chosen transport from §7. Then wait on every remote gate concurrently rather than in sequence — CI checks (e.g. `gh pr checks`, `glab ci status`, the Azure DevOps CLI), the automatic reviewer's pass (address its findings), human review (wait-or-poll policy), environment/soak/compliance gates — and join them all before merge. On CI failure, per the recorded policy: delegate diagnosis and the fix to a subagent (per §8) working from the failed job's logs, push, re-check until green — or report the first results and hand off. For a repo with no code host, the local test/lint suite already served as the gate — omit this stage, along with any other gate §4 rules out.]

[Per §5's ticket-state map (omit for ticketless sources): transition the ticket to the in-review state when the change request opens, and back to the needs-work state if a gate or review fails — so the developer sees it — re-advancing it when the gates go green again.]

Wait with the `Monitor` tool, never foreground `sleep` loops: a poll loop that emits each gate's terminal result and exits when all are settled, its timeout sized to the typical pipeline duration recorded in §4, the poll interval 30s+ against remote APIs, and the filter covering every terminal state — failures and cancellations, not just success, because a monitor that only greps the success marker stays silent through a failed run. Apply §4's max-wait & escalation policy when a poll window expires without the gates settling — auto-relaunch the monitor, or ask the human past the recorded threshold; never wait forever.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=merge -->

### Step 11: Merge

[Per §2: the target branch may have moved while the gates ran — re-check mergeability via the chosen transport or a fresh fetch + dry-run merge. If the branch no longer merges cleanly: sync per the recorded policy (resolution delegated per §8), push, and return to Step 10 — the remote gates run again on the new commit before any merge.]

[Per §5 merge policy: a human merges — stop here and report the ready-to-merge state — or the flow merges via the chosen transport from §7: the platform's merge capability, or a plain `git merge` + push for a repo without a code host.]

Merging is irreversible. Even when the recorded policy lets the flow merge, ask the user for confirmation in this run, after showing that every gate is green. A skipped or unanswered confirmation means do not merge — report the ready-to-merge state and stop.

[Per §5 post-merge CI: pipelines triggered by the merge on the base branch — watch them via the chosen transport and, per the recorded policy, fix failures forward or report them. Omit if nothing runs on merge.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=delivery -->

### Step 12: Deliver

[Per §5: deployment mode, batching/feature flags, approvals, version bumps. Omit what the decisions rule out; stop at the recorded hand-off point for manual or scheduled deployment.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=close-ticket -->

### Step 13: Close the Loop

[Per §5's definition of Done: gather the recorded evidence (change-request link, merge commit, deploy confirmation) and report the final state to the user. When the source has tickets, also transition the ticket using the chosen transport and attach the evidence; omit the transition entirely for ticketless sources — the report to the user is the close.]

Include the local review in the reported evidence — it is a real gate but gets buried in the logs otherwise. From the local-review stage's flow-log entry, report: the review **verdict**, the **finding count** (by severity), the **review file path** (`context/spec/{SPEC_NAME}/review.md`, or the path a reused review command used), and that a manual keep/drop gate ran over the findings. The path lets the user re-open the full review without re-running.

<!-- /awos:flow:stage -->

---

<!-- awos:flow:generated date=[YYYY-MM-DD] source=context/product/delivery-flow.md -->
