---
description: Implements one ticket end-to-end — fetches it, runs the AWOS chain, and delivers per the team's flow.
argument-hint: '[ticket ID, link, or file path]'
---

<!--
Skeleton consumed by /awos:flow. The generator replaces every [bracketed
instruction] with project-specific prose from context/product/delivery-flow.md,
omits stages the decisions rule out, and keeps the stage marker comments —
they let re-runs attribute manual edits to specific stages. Fixed prose
outside brackets survives into the generated command as-is.
-->

# Implement Ticket End-to-End

Takes one functional task from [source per §1 of delivery-flow.md] and drives it through spec, implementation, verification, review, and delivery until it is Done.

## Arguments

`$ARGUMENTS` — [expected ticket reference shape per §1: ID, URL, or file path]. If empty, ask the user.

<!-- awos:flow:stage=fetch-ticket -->

### Step 1: Fetch & Normalize the Ticket

[Connector-specific fetch using the chosen transport from §7 of delivery-flow.md, with its recorded fallback. Extract and keep: ticket ID, title, description, acceptance hints, link. For local-file or prompt-text sources this stage just reads/normalizes the input.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=resume-detection -->

### Step 2: Detect the Entry Point

[Per §1: if a spec directory for this ticket may already exist under `context/spec/`, inspect it and resume from the first missing artifact — skip `/awos:spec` if `functional-spec.md` exists, skip `/awos:tech` if `technical-considerations.md` exists, and so on. Omit this stage entirely if specs never arrive pre-written.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=workspace -->

### Step 3: Prepare the Workspace

[Per §2–§3 of delivery-flow.md: verify `context/` is reachable and current; warn on a dirty working tree; create the branch (or worktree, per the recorded recipe) from the base branch using the team's naming convention; submodule init/update if required. Store the branch name as `BRANCH` and the ticket ID as `TICKET_ID` for later stages.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=specs -->

### Step 4: Generate Specs and Tasks

Run the AWOS commands sequentially, in the main context, passing the normalized ticket as context:

1. `/awos:spec` — [approval gate per the team's decision: present for review, or run straight through]
2. `/awos:tech` — [approval gate]
3. `/awos:tasks` — [approval gate]

Store the spec directory name (e.g. `007-tasks-api`) as `SPEC_NAME`.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=commit-specs -->

### Step 5: Commit Specs

[Per §3: stage `context/spec/{SPEC_NAME}/` in the repo that owns it and commit using the team's message convention, referencing `TICKET_ID`.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=implement -->

### Step 6: Implement via Subagents

Run `/awos:implement`. It delegates all coding to specialist subagents and tracks progress — do not implement tasks in the main context. Wait for all tasks to complete.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=verify -->

### Step 7: Verify

Run `/awos:verify` to validate the implementation against the spec's acceptance criteria. Address gaps before proceeding.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=commit-push -->

### Step 8: Commit & Push

Stage all changed files, excluding `.env`, credentials, and secrets. [Commit message convention per the team; pre-commit hook failures: fix and amend.] Push `BRANCH` to the remote.

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=review -->

### Step 9: Review

[Per §4 of delivery-flow.md: the team's gates in their recorded order — static checks, local AI review (delegated to a subagent, findings presented to the user, never auto-fixed), remote PR creation and human review with the wait-or-poll policy, environment/soak/compliance gates. If the flow includes a local AI review with human edits, also diff the user's edits against the original review and suggest CLAUDE.md amendments for generalizable corrections.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=delivery -->

### Step 10: Deliver

[Per §5: deployment mode, batching/feature flags, approvals, version bumps. Omit what the decisions rule out; stop at the recorded hand-off point for manual or scheduled deployment.]

<!-- /awos:flow:stage -->

<!-- awos:flow:stage=close-ticket -->

### Step 11: Close the Loop

[Per §5's definition of Done: transition the ticket using the chosen transport, attach the recorded evidence (PR link, deploy confirmation), and report the final state to the user.]

<!-- /awos:flow:stage -->

---

<!-- awos:flow:generated date=[YYYY-MM-DD] source=context/product/delivery-flow.md -->
