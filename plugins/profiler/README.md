# profiler

Profiles `/awos:implement` runs from the Claude Code session transcripts, so that "it ran for eight hours" becomes "generation 4.0 h, tools 3.0 h of which tests 0.8 h, one 54-minute hang on `playwright-cli close | tail`, and 1.1 h with no activity on the machine".

## Install

```
/plugin install profiler@awos-marketplace
```

## Use

```
/profiler:implement                 # asks: report, watch, or list sessions
/profiler:implement report          # profile the latest run in the current project
/profiler:implement report --run all
/profiler:implement report --session <id> --run 3
/profiler:implement watch           # live: completions, stalls, idle, summaries
/profiler:implement sessions        # which sessions contain implement runs
```

The skill runs `scripts/profile-implement.mjs` (Node, no dependencies) and interprets its Markdown report. The script can be run on its own:

```sh
node plugins/profiler/scripts/profile-implement.mjs report --cwd /path/to/project --json profile.json
```

## What the report contains

- **Where the time went:** subagent model generation, subagent tool execution, test and typecheck runs, hung tool calls, orchestrator generation, time waiting on the user, idle gaps, and how much of the wall-clock had 0, 1, 2, or 3+ subagents running.
- **Rates:** working agents versus delegators and empty spawns, median active wall-clock per working agent, seconds of generation per API turn, output tokens per turn, share of turns carrying a thinking block, median orchestrator handoff.
- **Long gaps** in the main session, each classified as machine active or inactive by checking whether any transcript on the machine has a line inside the gap.
- **Hangs and stalls:** single tool waits over 10 minutes (20 for test commands), with the command; during a live run, agents currently silent on a tool call.
- **Agents on the orchestrator model:** built-in agent types that ran on the session model and effort instead of a specialist's.
- **Delegation chains:** agents that called the `Agent` tool, with what they spawned.
- **A per-agent table** with depth, model, wall, model, tool, and test time, turns, per-turn rates, longest wait, and status.

## How it measures

A run starts at `/awos:implement`. It ends at the orchestrator's completion line ("All tasks complete (100%)" or "Implementation run complete", also when paraphrased at the start of a line, such as "All 50 tasks complete (100%)", or a final report that closes with the pointer to `/awos:verify`), or when the user starts another `/awos:` command. Anything else the user types during the run — an answer to a question, `continue` after a dropped connection, `/login` — stays inside the run: the report lists these prompts and counts the time the run waited for them. Messages from background teammates, the host's usage-limit notices, and the echoed output of `/login` or a `!` shell command are not user prompts. A run with neither boundary counts as live only while some transcript in it was written in the last 30 minutes; otherwise it ends at its last activity.

Every transcript line has a timestamp. Model time is the gap before each assistant line, tool time the gap before each tool result, attributed to the tool by id. Turns are deduplicated by message id and output tokens taken as the max seen, because streaming writes several lines per turn. Thinking text is redacted in transcripts, so the thinking share counts turns that carry a thinking block. Gaps over 30 minutes are idle and excluded from every bucket, except a wait on a tool result, which is a hang unless nothing on the machine was active.

The transcript format is internal to Claude Code and may change between versions. The script is defensive about every field, and `tests/profiler-script.test.js` runs it against a synthetic session so a format drift fails loudly.

## Version

Independent of the other plugins. Moves as three files together: `.claude-plugin/plugin.json`, the marketplace entry, and the `EXPECTED_PROFILER_PLUGIN_VERSION` pin in `tests/lint-prompts.test.js`.
