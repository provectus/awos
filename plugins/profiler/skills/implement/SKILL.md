---
name: implement
description: >-
  Profile /awos:implement runs from Claude Code session transcripts: where the
  wall-clock went (model generation, tools, tests, hangs, idle), per-subagent
  rates, delegation chains, agents leaking onto the orchestrator model, and a
  live watch that flags hung commands while a run is in progress. Use when an
  implement run feels slow, when comparing two runs, or when someone asks
  "what is it doing" during a run.
argument-hint: '[report|watch|sessions] [--session <id>] [--run <n|all>]'
---

# Implement Run Profiler

You explain where an `/awos:implement` run spent its time. The numbers come from a deterministic script; your job is to run it, read its report, and turn it into a diagnosis the user can act on. You never compute durations yourself from transcript lines, and you never edit a transcript.

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

`report` prints Markdown. Write the optional JSON to the session scratchpad, never into the user's project: transcripts contain prompts and code, and the profile is a derived view of them.

For `watch`, arm it with the `Monitor` tool, persistent, so each stdout line arrives as a notification. The script polls every five minutes and exits on its own when the orchestrator prints its completion line or the user sends the next prompt. Its lines are:

- `DONE <type> "<description>": …` — a working agent finished, with its wall, model, tool, and test time, turns, seconds per turn, tokens per turn, thinking share.
- `DONE (delegator) …` — an agent that handed its task to a nested agent; its own numbers are not meaningful.
- `EMPTY …` — a nested agent that finished within two turns without a tool call: a fork or skill invoked without a task.
- `STALL <type> "<description>": silent N min, waiting on <tool> <command>` — a real hang candidate.
- `IDLE …` — the orchestrator and every agent have been silent for 15 minutes; the run is waiting on the user or has stopped.
- `SUMMARY …` every 30 minutes, and `RUN ENDED …` once.

## Step 3: Read the report

Lead with the answer to "where did the time go", then the patterns below when the report shows them. Numbers go in a short table; keep prose to what changes the user's next action.

- **Inactive gap versus hang.** A long gap in the main session with `machine inactive` means no transcript on the machine has a line in that window; nothing was running. A gap with `machine active` and a `HANG` inside a subagent is a real stall, and the report names the command. Hung cleanup steps that pipe a daemon's own close or stop command into `tail`, `grep`, or `head` are the recurring shape; the Bash timeout does not end them.
- **Generation versus tools.** When subagent model generation dominates, the lever is turn count and thinking: seconds per turn near 10 with over half the turns carrying a thinking block is the high-effort profile, near 4 to 5 with a third of turns thinking is the low-effort profile. Context size is not a lever: subagent input is almost entirely cache reads and latency does not grow with context. When tool time dominates, look at the test-run count and seconds per run; a suite run on every iteration instead of once at the end is the usual cause.
- **Delegation chains.** A specialist that called the `Agent` tool forwarded its brief instead of doing the work. Each hop costs seconds, but a chain hides the real worker and, at depth, drops the specialist's effort setting. An agent file without `disallowedTools: Agent` makes this possible; a skill with `context: fork` makes a fork on every invocation.
- **Agents on the orchestrator model.** Built-in agent types such as `general-purpose` and `fork` have no agent file, so they run on the session's model and effort rather than the specialist's. Commits and one-off tasks routed there run several times slower per turn than the specialists.
- **Comparing runs.** Compare rates, not totals: seconds per turn, tokens per turn, thinking share, and median active wall-clock per working agent hold across specs of different size. Totals only compare when the spec is the same.

On a `STALL` event during `watch`, tell the user which agent is stuck, on which command, for how long, and what would release it (a process to kill, or stopping the agent). Do not kill processes or stop agents yourself; the user decides.

## Step 4: Report

Give the user the buckets table, the rates table when it changes what they would do next, the hangs and stalls with their commands, and one line per pattern above that applies. Then stop. If they want the guardrails that address a pattern, the framework's `/awos:implement` delegation prompt and the agent files under `.claude/agents/` are where they live.
