---
description: Implements one feature end-to-end — fetches its requirements, runs the AWOS chain, and delivers per the project's delivery flow.
argument-hint: '[feature — ticket ID, link, or file path]'
---

<!--
Skeleton consumed by /awos:flow. The generator replaces every [bracketed
instruction] with project-specific prose from context/product/delivery-flow.md,
omits stages the decisions rule out, and keeps the stage marker comments —
they let re-runs attribute manual edits to specific stages. Fixed prose
outside brackets survives into the generated command as-is.

This entire comment is instructions to the generator: do NOT copy it, or any
adaptation of it, into the generated file. The generated command starts at the
frontmatter and carries no top-of-file comment — provenance lives in the
footer marker, and "re-run /awos:flow to change a decision" belongs in the
intro paragraph, one sentence, not a comment block. The generated command must
also be self-contained: never reference the sibling command ("same as
/fix-bug") — the commands know nothing about each other at run time.

The stage markers are HTML comments: never nest one inside another — an inner
arrow-close ends the outer comment early and breaks the rest of the file.
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
- After each completed stage, append an entry to `context/spec/{SPEC_NAME}/flow-log.md`: the stage name, what was produced and where (paths, branch, commit), any decisions taken along the way, and which stage comes next. `SPEC_NAME` exists once the specs stage creates the spec directory — the stages before it (fetch, resume-detection, workspace) are cheap and re-runnable, so they log nothing; logging starts with the specs stage, and the log's first entry records the ticket ID/title so resume can match a log to its feature. The log is the flow's memory outside the context window — a fresh session (after a restart, a crash, or an unattended hand-off between sessions) resumes by reading this one small file instead of re-deriving state from the whole repo. That is what keeps the window small across a long flow: nothing needs to stay in context once it is in the log. The log is committed with the work (Step 9 stages it alongside the code), so it must never become an uncommittable leftover: **once the change request is opened — or the change is merged — stop writing to the tracked log**, since a commit adding log lines is unwelcome on a change request under review and impossible once it merges, so a late append would strand a change that can never reach it. From that point report late-stage progress to the user and via §9 notifications, and resume the remote stages from remote state (the open/merged change request and the ticket status), which the resume-detection stage already inspects. The close stage leaves a clean working tree and never writes a final entry it cannot commit.
- Never launch a nested headless session (`claude -p`) from this command — permission modes, PATH, and timeouts differ per machine. Unattended chaining belongs to the trigger setup (§6), outside this command.
- Tell every dispatched subagent: tools are functional — do not test them or make exploratory calls; every call needs a purpose. Run each delegated stage on the model tier recorded in §8 — the fast tier for mechanical transport work, the strongest for judgment.
- A subagent's report is a claim, not a fact. Before acting on a report that names files and lines, asserts a root cause, or reports a test outcome, spot-check it — read the named lines, run the named test — rather than relaying it verbatim into the next stage.
- Every fixed-choice interaction with the user — a per-run choice the decisions left open (e.g. main repo vs. worktree), an approval gate verdict, keep/drop on review findings, the merge confirmation — goes through `AskUserQuestion` with the recorded default marked, never a prose question. Plain prose is only for inherently free-form input (a feature description, a file path).
- An unanswered `AskUserQuestion` (the harness returns `No response after 60s` — its guard so unattended runs never hang) is handled by run mode. Read the `AWOS_UNATTENDED` environment variable: when it is set (the §6 trigger setup exports it for cron/`/loop`/`claude -p` drivers), a no-answer is expected — take the safe default and continue. When it is unset the run is interactive, and a timeout usually means the user is thinking or briefly away, not that they have no preference — re-ask the question once, then proceed naming the default you took so they can correct it. A timeout never authorizes an irreversible step: the merge confirmation treats an unanswered prompt as a no in either mode.

## Self-Improvement Loop

This command is maintained through its own runs. When a run exposes a defect in the flow itself — a recorded fact disproven by reality (a "no X" claim, a dead link, a wrong state name), a missing step (an undocumented bootstrap, a transition chain), or a stage instruction that had to be worked around — fix the flow **in the same run**:

1. Patch the affected file(s) right in this working copy: this command file, `context/product/delivery-flow.md` (correct the fact where it is recorded), or the reused skill.
2. Stage those edits in the commit-push stage alongside the code change — same branch, same change request. Never park flow fixes for a separate change request; a flow that shipped its work while still carrying a known-wrong instruction has not finished the job. A defect found after the change request is open waits: report it as pending in the close-out, and the next run applies it at the workspace stage.
3. Record the correction in the flow log — with the observation that disproved the old text — and promote it into the decision record's **Local Customizations** section, so a future `/awos:flow` regeneration preserves it instead of resurrecting the defect.
4. Two kinds of defect are not yours to fix. A delivery _decision_ (a gate, the merge policy, the autonomy level) belongs to whoever owns the team's process — report the friction and leave the change to a `/awos:flow` re-run. A defect in how `/awos:flow` generated this command cannot be fixed here — tell the user so they can report it to the AWOS repo.

<!-- awos:flow:stage=fetch-ticket -->

### Step 1: Fetch & Normalize the Ticket

[Connector-specific fetch using the chosen transport from §7 of delivery-flow.md, with its recorded fallback. Extract and keep: ticket ID, title, description, acceptance hints, link. For local-file or prompt-text sources this stage just reads/normalizes the input.]

[Ticket sources: also fetch the **surrounding context** §1 recorded — the **epic/parent ticket's description, remote links, attachments, and linked conversations** (tracker remote links, attached design docs or screenshots, a referenced Confluence/Notion page, a linked chat thread) via the §7 transports — and read the reachable ones. This is what pre-seeds `/awos:spec` so its interview opens warm instead of cold: the epic frames the "why", a design link or screenshot pins the "what". Fold the reachable material into the normalized bundle, and **list anything linked but unreachable** in it instead of silently skipping — the specs stage then knows context is missing rather than assuming the description is complete. Step 4 passes this normalized bundle to `/awos:spec` as context, so the richer material flows through without a second fetch. Omit this paragraph for local-file or prompt-text sources, and skip any surrounding-context source §1 records as "none".]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=resume-detection -->

### Step 2: Detect the Entry Point

Start with a cheap preflight on the fast model tier (per §8): is this feature **already done**? Check the status across every source §1 records (tickets can live in more than one place) before doing any work — if the tracker ticket is in a Done/closed state, or the owning AWOS spec is already `Completed` (or all its `tasks.md` items are `[x]`), or a merged change request exists, report that and stop. Don't re-run the chain over work that is already delivered. Then: `SPEC_NAME` is not known yet on a fresh run — glob `context/spec/*/flow-log.md` and match this feature by the ticket ID/title in each log's first entry; if one matches, read it first — it names the last completed stage and carries the branch, commit, and change-request state. The log is a convenience, not ground truth: for the spec-generation stages the on-disk artifacts win when they disagree with the log (a manual or partial rerun can leave it stale) — cross-check `context/spec/` and, if they differ, resume from the first missing artifact and repair the log to match before continuing. Past spec generation there is no such artifact to scan, so the log is the only resume signal. [Per §1: if a spec directory for this feature may already exist under `context/spec/`, inspect it and resume from the first missing artifact — skip `/awos:spec` if `functional-spec.md` exists, skip `/awos:tech` if `technical-considerations.md` exists, and so on. Omit the pre-written-spec handling if specs never arrive pre-written.] Resume is a dispatch, not a re-run: when the log (or an on-disk artifact) names the last completed stage, continue from the stage after it — completed stages are skipped, not repeated.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=workspace -->

### Step 3: Prepare the Workspace

[Per §2–§3 of delivery-flow.md: verify `context/` is reachable and current; warn on a dirty working tree; create the branch from the base branch using the project's naming convention; submodule init/update if required. For a worktree: invoke the project's own worktree command, skill, or init script when §2 records one, otherwise execute the §2 isolation recipe — bring-up steps included — verbatim. Never improvise worktree preparation in-run: real prep is bigger than `git worktree add` (installs, codegen, env files, service/network isolation), and the recorded recipe or project script is the tested path. Store the branch name as `BRANCH` and the ticket ID as `TICKET_ID` for later stages.] Uncommitted AWOS artifacts — `context/product/delivery-flow.md` and this command file, left by `/awos:flow` — are an expected dirty-tree cause; surface them as such rather than treating them as a blocker.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=specs -->

### Step 4: Generate Specs and Tasks

Run the AWOS commands sequentially, passing the normalized ticket as context. [Per §8: which of the three stay in the main context and which run in a subagent — a command that interviews the user must stay in main; a non-interactive one runs in a subagent returning the artifact path and a one-line verdict.] Honor the Step 2 entry point: skip any command whose artifact already exists on disk — and skip its approval gate with it. Resume from the first missing artifact; never regenerate or re-gate a completed stage.

1. `/awos:spec` — [approval gate per §4's gate decision]
2. `/awos:tech` — [approval gate per §4's gate decision]
3. `/awos:tasks` — [no gate unless §4 records one] — proceed straight to implementation; the task list stays revisable by re-running `/awos:tasks`.

Store the spec directory name (e.g. `007-tasks-api`) as `SPEC_NAME`.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=commit-specs -->

### Step 5: Commit Specs

[Per §3: stage `context/spec/{SPEC_NAME}/` in the repo that owns it and commit using the project's message convention, referencing `TICKET_ID`.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=implement -->

### Step 6: Implement via Subagents

Run `/awos:implement` [per §8: in the main context if it dispatches subagents itself — a command that dispatches subagents cannot run inside one]. It delegates all coding and tracks progress — do not implement tasks in the main context. Wait for all tasks to complete.

After `/awos:implement` reports all tasks complete, spot-check the plan's testing slice the way any subagent claim is checked. Each testing subagent proves the tests it writes with RED validation (the plan's own wording: must fail before implementation is confirmed done); this stage is the orchestrator's independent spot-check of one test, not a re-proof of the suite: pick a test guarding the new behavior, set the change it covers aside (revert or stash the implicated hunks), run the test and watch it fail, then restore the tree exactly and watch it pass. A test that stays green with the feature removed asserts behavior the codebase already had — send it back to the testing specialist to retarget rather than counting it as coverage. Honor the `<!-- skip-tests: true -->` marker: if the spec's `tasks.md` carries it, no testing slice was generated and there is nothing to spot-check.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=verify -->

### Step 7: Verify

Run `/awos:verify` [per §8: in a subagent if it is non-interactive], returning the verdict and the list of gaps. Address gaps before proceeding.

Running the app to verify is the flow's job, not the user's. [If §2/§3 recorded a shared resource the app binds — a port a running service holds, a single database, a device — the workspace guardrail reserves it for normal work, but verification still needs a real render: reclaim the resource (stop and restart the service, alternate port, throwaway instance) or drive the project's §5 deploy/run step and verify against it, per the sanctioned verification path §2/§3 records. Don't hand the user a `run` command or defer a drivable criterion to a later manual deploy — manual confirmation is only for a criterion the agent genuinely cannot render here.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=local-review -->

### Step 8: Local Review

The review must stay independent of this conversation's authorship bias — it never happens inline in the orchestrator's own window, which just drove the implementation:

- [Per §4 and the §8 context strategy, one of two shapes — decided at generation time by inspecting the review automation, never at run time. The project has a review skill/command that itself dispatches subagents (most do): the orchestrator invokes it from the **main context** via the Skill tool — its own reviewer subagents provide the fresh, unbiased contexts; do not wrap it in a subagent, since agents do not nest and this orchestrator already occupies the coordinator slot. Otherwise: dispatch a dedicated **reviewer subagent** with the fixed verbatim prompt written here at generation time.]
- The invocation is fixed: pass it verbatim. Do not add run-time focus areas drawn from what you implemented or suspect — the author framing the review is the bias.
- The reviewer writes its findings to a review file and returns only the verdict, the finding count by severity, and that file's path — never the full review body. The generated reviewer subagent writes to a fixed path, `context/spec/{SPEC_NAME}/review.md`; a reused project review command may write elsewhere — capture whatever path it used.
- **Lead the review presentation to the user with that path on its own line** — e.g. `Review file: context/spec/{SPEC_NAME}/review.md` — before the verdict and the findings. A fixed opening line is surfaced reliably; a path appended after a long findings list gets dropped (the recurring failure this guards against). Record the same path in this stage's flow-log entry, so it survives outside the chat even if the line is missed.
- Collect the keep/drop decisions on the findings with `AskUserQuestion`. The agent that applies accepted findings reads the review file and the diff fresh — relay the user's decisions, not your own summary of the findings.

[Per §4 of delivery-flow.md: static checks, then the local AI review — the reviewer subagent's verbatim prompt, derived from §4 at generation time: the diff range, the spec paths, the project's review rules; findings presented to the user, never auto-fixed; accepted findings applied before anything is pushed. If §4 includes the human-edit loop, also diff the user's edits against the original review and suggest CLAUDE.md amendments for generalizable corrections. If §4 records change-request-first timing, move this stage after Step 9 instead and run the review concurrently with the remote gates — faster wall-clock, at the cost of an extra CI run on unreviewed code.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=commit-push -->

### Step 9: Commit & Push

Write this stage's flow-log entry **before** staging so the log rides in this commit — this is the flow-log's last committed state (see Context Discipline). Then stage only what this flow produced or touched — the delegated code changes, the flow log, spec/context artifacts, and any Self-Improvement Loop edits. Never a blanket `git add -A`: pre-existing dirty-tree files the workspace stage warned about stay unstaged; surface any unexpected changed file instead of staging it. Never stage `.env`, credentials, or secrets. [Commit message convention per the project; pre-commit hook failures: fix and amend.] Push `BRANCH` to the remote.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=remote-gates -->

### Step 10: Remote Gates

This stage opens the change request. The flow log was finalized at commit-push — **do not append to the tracked flow-log from here on** (Context Discipline): a commit adding log lines is unwelcome on a change request under review, and impossible once it merges. Report gate progress to the user and via Notifications instead; once the change request exists, resume relies on the remote state, not the log.

[Per §2 sync policy: before opening the change request, fetch the target branch and verify the branches merge cleanly — a dry-run merge or rebase. On conflicts: delegate resolution to a subagent (per §8), re-run the local gates on the resolved result, and push.]

[Per §4: open the change request via the chosen transport from §7. Then wait on every remote gate concurrently rather than in sequence — CI checks (e.g. `gh pr checks`, `glab ci status`, the Azure DevOps CLI), the automatic reviewer's pass (address its findings), human review (wait-or-poll policy), environment/soak/compliance gates — and join them all before merge. On CI failure, per the recorded policy: delegate diagnosis and the fix to a subagent (per §8) working from the failed job's logs, push, re-check until green — or report the first results and hand off. For a repo with no code host, the local test/lint suite already served as the gate — omit this stage, along with any other gate §4 rules out.]

[Per §5's ticket-state map (omit for ticketless sources): transition the ticket to the in-review state when the change request opens, and back to the needs-work state if a gate or review fails — so the developer sees it — re-advancing it when the gates go green again. Follow the recorded transition chain for each event (including intermediate hops), not just the target state name.]

Wait with the `Monitor` tool, never foreground `sleep` loops: a poll loop that emits each gate's terminal result and exits when all are settled, its timeout sized to the typical pipeline duration recorded in §4, the poll interval 30s+ against remote APIs, and the filter covering every terminal state — failures and cancellations, not just success, because a monitor that only greps the success marker stays silent through a failed run. Apply §4's max-wait & escalation policy when a poll window expires without the gates settling — auto-relaunch the monitor, or ask the human past the recorded threshold; never wait forever.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=merge -->

### Step 11: Merge

[Per §2: the target branch may have moved while the gates ran — re-check mergeability via the chosen transport or a fresh fetch + dry-run merge. If the branch no longer merges cleanly: sync per the recorded policy (resolution delegated per §8), push, and return to Step 10 — the remote gates run again on the new commit before any merge.]

[Per §5 merge policy: a human merges — the flow's delivery work ends at this ready-to-merge hand-off: skip the flow-merge and proceed to the close stage, which reports the ready-to-merge state as the terminal evidence — or the flow merges via the chosen transport from §7: the platform's merge capability, or a plain `git merge` + push for a repo without a code host.]

Merging is irreversible. Even when the recorded policy lets the flow merge, ask the user for confirmation in this run (`AskUserQuestion`: merge / don't merge), after showing that every gate is green. A skipped or unanswered confirmation means do not merge — proceed to the close stage with the ready-to-merge state as the evidence.

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

Leave a clean working tree: do not write a closing flow-log entry (the log was finalized at commit-push and the change request is now open or merged — a new entry could never be committed into it). If any flow-created artifact is still uncommitted, surface it in the report rather than leaving it behind — an uncommitted leftover after a merged or in-review change request is a bug, not a record.

<!-- /awos:flow:stage -->

---

<!-- awos:flow:generated date=[YYYY-MM-DD] version=[generator version constant from /awos:flow] source=context/product/delivery-flow.md -->
