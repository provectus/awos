---
name: implement
description: >-
  Profile /awos:implement and /better:implement runs from Claude Code session transcripts: where the
  wall-clock went (model generation, tools, tests, hangs, idle), per-subagent
  rates, context fill and compactions per agent, delegation chains, agents
  leaking onto the orchestrator model, and a
  live watch that flags hung commands while a run is in progress. Use when an
  implement run feels slow, when comparing two runs, or when someone asks
  "what is it doing" during a run.
argument-hint: '[report|watch|sessions] [--session <id>] [--run <n|all>]'
---

# Implement Run Profiler

You explain where an `/awos:implement` or `/better:implement` run spent its time. The numbers come from a deterministic script; your job is to run it, read its report, and turn it into a diagnosis the user can act on. You never compute durations yourself from transcript lines, and you never edit a transcript.

## Inputs

- **Profiler script:** `${CLAUDE_PLUGIN_ROOT}/scripts/profile-implement.mjs` (bundled with this plugin; requires `node` on PATH, no dependencies).
- **Transcripts:** Claude Code writes them under `~/.claude/projects/<slug>/`, where the slug is the project's working directory with every non-alphanumeric character replaced by `-`. The script resolves this from the current directory; pass `--projects <dir>` to point elsewhere.
- **Arguments:** `$ARGUMENTS`. A mode (`report`, `watch`, `sessions`), an optional `--session <id>`, and an optional `--run <n|all>` (default: the latest run in the most recent session that has one).

## Step 1: Preflight

Run `command -v node`. If it is missing, tell the user the profiler needs a Node runtime and stop.

If the mode is not given, ask with `AskUserQuestion`:

1. **Report on the last run** — profile the most recent completed or in-progress run.
2. **Watch the run in progress** — arm a live monitor that reports completions and stalls.
3. **List sessions** — show which sessions contain implement runs, to pick one.

## Step 2: Run the script

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/profile-implement.mjs" sessions
node "${CLAUDE_PLUGIN_ROOT}/scripts/profile-implement.mjs" report [--session <id>] [--run <n|all>] [--json <scratchpad>/profile.json]
node "${CLAUDE_PLUGIN_ROOT}/scripts/profile-implement.mjs" watch [--session <id>] [--interval 300]
```

`report` prints Markdown. For a `/better:implement` run it finds `run.md` itself; pass `--run-md <path>` when the report says it could not. Write the optional JSON to the session scratchpad, never into the user's project: transcripts contain prompts and code, and the profile is a derived view of them.

For `watch`, arm it with the `Monitor` tool, persistent, so each stdout line arrives as a notification. The script polls every five minutes and exits on its own when the orchestrator prints its completion line or the user starts any plugin command (`/awos:…`, `/better:…`, `/profiler:…`). An answer to a question, `continue`, or a built-in command such as `/login` stays inside the run and is reported as a user prompt. Its lines are:

- `DONE <type> "<description>": …` — a working agent finished, with its wall, model, tool, and test time, turns, seconds per turn, tokens per turn, thinking share.
- `DONE (delegator) …` — an agent that handed its task to a nested agent; its own numbers are not meaningful.
- `EMPTY …` — a nested agent that finished within two turns without a tool call: a fork or skill invoked without a task.
- `STALL <type> "<description>": silent N min, waiting on <tool> <command>` — a real hang candidate.
- `IDLE …` — the orchestrator and every agent have been silent for 15 minutes; the run is waiting on the user or has stopped.
- `SUMMARY …` every 30 minutes, and `RUN ENDED …` once.

## Step 3: Read the report

The user comes with three questions: why did the run take so long, what cost the most, and what to change before the next run. Answer them in that order, each from the patterns below that the report shows. Give what the transcripts add, time and cost, and nothing the user already has: for a `/better:implement` run, its own report and `run.md` already list the `[?]` and `[ ]` criteria, the open items and what failed, so do not retell them; give the cost and name the unit. Numbers go in a short table; keep prose to what changes the user's next action.

- **Inactive gap versus hang.** A long gap in the main session with `machine inactive` means no transcript on the machine has a line in that window; nothing was running. A gap with `machine active` and a `HANG` inside a subagent is a real stall, and the report names the command. Hung cleanup steps that pipe a daemon's own close or stop command into `tail`, `grep`, or `head` are the recurring shape; the Bash timeout does not end them.
- **Sleep and questions are not work.** "Machine asleep" and "Waiting on the user" are already taken out of the other buckets; the run's work time is the wall-clock "with the machine awake" minus the user wait. When two runs are compared, compare that, not the wall-clock. A run that slept with `source: none` (not macOS, or no `pmset` history for that date) can still hide sleep in its buckets; say so.
- **Generation versus tools.** When subagent model generation dominates, the lever is turn count and thinking: seconds per turn near 10 with over half the turns carrying a thinking block is the high-effort profile, near 4 to 5 with a third of turns thinking is the low-effort profile. Context size is not a speed lever: subagent input is almost entirely cache reads and latency does not grow with context. When tool time dominates, look at the test-run count and seconds per run; a suite run on every iteration instead of once at the end is the usual cause.
- **Context fill.** The `### Agents` table has `Peak ctx` and `Final ctx` for each subagent, in thousands of tokens; the context at a turn is its input plus cache writes plus cache reads. The `### Rates` table gives the same for the orchestrator, with the turn of its peak, and the `### Context` section lists each compaction during work (time, agent, trigger, tokens before → after) and names the ones after a pause in one line. These are signals, not causes of lost time. A high orchestrator peak means it read subagent output or code into its own context instead of delegating by path; in a long unattended run that growth is what ends in a compaction. Any compaction means the agent's history was summarized at that time, so details of its brief or of earlier steps can be missing after it: check the work that agent did after the compaction. The two kinds point to different fixes. "During work" means the context outgrew itself: a subagent had a unit too large for one context, or the orchestrator read too much. "After a pause" means the host compacted a context that sat without a model request (waiting on the user, a long subagent, a long tool or a sleeping machine), whatever its size; the lever there is the wait, not the context. Only the listed compactions happened; do not infer one from a drop in the numbers.
- **Delegation chains.** A specialist that called the `Agent` tool forwarded its brief instead of doing the work. Each hop costs seconds, but a chain hides the real worker and, at depth, drops the specialist's effort setting. An agent file without `disallowedTools: Agent` makes this possible; a skill with `context: fork` makes a fork on every invocation.
- **Agents on the orchestrator model.** Built-in agent types such as `general-purpose` and `fork` have no agent file, so they run on the session's model and effort rather than the specialist's. Commits and one-off tasks routed there run several times slower per turn than the specialists.
- **Units (`/better:implement`).** The `### Units` section maps each subagent to the `run.md` unit it did; its times are the transcript's, the same as the Agents table. The orchestrator observes each unit's criteria in the running application itself, so that cost is not in a unit's Active time: it is in "Orchestrator after" and in the line that places the orchestrator's own work. For **what cost the most**, name the units with the most Active time, the checks with the most "Orchestrator after", and the totals line: verification and rework time went to what the first pass did not settle. For a check several times its unit's Active time, read that unit's `Evidence:` in `run.md` for what the check had to set up: data it inserted, a server it started or restarted, an account it could not get. That setup is the lever, because data or an environment the next run can reuse (seed data, a fixture, a test account the tech spec names) removes it. For a unit with more than one attempt and for a rework unit, give the time the extra attempt cost and its cause in one clause from `Evidence:`. A retry from the environment (a failing test, a dependency, a port, a hung command) shows in the Hangs section for the same agent. A rework that fixed the code against a clear criterion is the verification doing its job, not a finding. A planned agent the run replaced with `general-purpose` ran on the orchestrator's model: give its time and seconds per turn next to the specialists' and the `/awos:hire cover [spec]: need [expertise]` command. Units no subagent in this session ran were done in an earlier session (the run resumed) or not reached; profile that session too before you compare runs. A subagent that is not a unit (a commit helper, say) is overhead outside the plan. Duplicated unit ids mean `run.md` was rewritten by appending; the first heading is the one used. When the report says the Units section is not shown, say why in one line and go on.
- **Comparing runs.** Compare rates, not totals: seconds per turn, tokens per turn, thinking share, and median active wall-clock per working agent hold across specs of different size. Totals only compare when the spec is the same.

On a `STALL` event during `watch`, tell the user which agent is stuck, on which command, for how long, and what would release it (a process to kill, or stopping the agent). Do not kill processes or stop agents yourself; the user decides.

## Step 4: Report

Answer the three questions in order, each under its own short heading:

1. **Why so long:** the work time against the wall-clock and what the rest waited on (a sleeping machine, a question, an idle gap, a hang with its command); the buckets table, and the rates table only when it changes what they would do next.
2. **What cost the most:** the units and checks with the most time, each extra attempt and rework unit with its cost and cause, and each compaction during work with the agent it hit.
3. **What to change before the next run:** only the levers a number above supports, each with the time it would save: data or an environment for an expensive check, a missing specialist, an agent file that allows delegation, a question that waited (start the run when someone can answer, or settle the item before the run), a unit large enough to compact its agent.

When a question has nothing to report, say so in one line. Then stop. If they want the guardrails that address a pattern, the framework's `/awos:implement` delegation prompt and the agent files under `.claude/agents/` are where they live.
