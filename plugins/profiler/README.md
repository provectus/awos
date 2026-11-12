# profiler

Profiles `/awos:implement` and `/better:implement` runs from the Claude Code session transcripts, so that "it ran for eight hours" becomes "generation 4.0 h, tools 3.0 h of which tests 0.8 h, one 54-minute hang on `playwright-cli close | tail`, and 1.1 h with no activity on the machine".

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
node plugins/profiler/scripts/profile-implement.mjs report --cwd /path/to/project --run-md context/spec/008-x/run.md
```

## What the report contains

- **Where the time went:** subagent model generation, subagent tool execution, test and typecheck runs, hung tool calls, orchestrator generation, time waiting on the user (typed prompts and `AskUserQuestion` answers), idle gaps, time the machine was asleep, and how much of the wall-clock had 0, 1, 2, or 3+ subagents running.
- **Rates:** working agents versus delegators and empty spawns, median active wall-clock per working agent, seconds of generation per API turn, output tokens per turn, share of turns carrying a thinking block, median orchestrator handoff, and the orchestrator's peak context (with its turn and time) and final context.
- **Context:** each compaction during work (a `compact_boundary` line the host wrote while the agent was working), with its time, agent, trigger, and tokens before and after. Compactions after a pause are named in one line: the host compacted a context whose prompt cache had expired, so they say nothing about the context size. The report gives no compaction count as a measure.
- **Long gaps** in the main session, each classified as machine active or inactive by checking whether any transcript on the machine has a line inside the gap.
- **Hangs and stalls:** single tool waits over 10 minutes (20 for test commands), with the command; during a live run, agents currently silent on a tool call.
- **Agents on the orchestrator model:** built-in agent types that ran on the session model and effort instead of a specialist's.
- **Delegation chains:** agents that called the `Agent` tool, with what they spawned.
- **A per-agent table** with depth, model, wall, model, tool, and test time, turns, per-turn rates, peak and final context, longest wait, and status.
- **Units** (`/better:implement` only): one row per unit of the run's `run.md` with its id, kind (work, verification, rework), title, the agent `run.md` planned and the agent type that ran it, attempts, active time, peak context, and `State`; a totals line with the time and share of work, verification, and rework; the `run.md` `Status` and any duplicated unit headings; the units no subagent in this session ran; and the subagents that are not a unit, such as a commit helper. For an `/awos:implement` run, or when `run.md` cannot be found or read, the report says so in one line.

## How it measures

A run starts at `/awos:implement` or `/better:implement`. It ends at the orchestrator's completion line ("All tasks complete (100%)" or "Implementation run complete", also when paraphrased at the start of a line, such as "All 50 tasks complete (100%)", or a final report that closes with the pointer to `/awos:verify`), or when the user starts any plugin command (`/awos:…`, `/better:…`, `/profiler:…`). Anything else the user types during the run — an answer to a question, `continue` after a dropped connection, a built-in command such as `/login` — stays inside the run: the report lists these prompts and counts the time the run waited for them. Messages from background teammates, the host's usage-limit notices, and the echoed output of `/login` or a `!` shell command are not user prompts. A run with neither boundary counts as live only while some transcript in it was written in the last 30 minutes; otherwise it ends at its last activity.

Every transcript line has a timestamp. Model time is the gap before each assistant line, tool time the gap before each tool result, attributed to the tool by id. Turns are deduplicated by message id and each usage field taken as the max seen, because streaming writes several lines per turn. The context at a turn is `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` (a missing field counts as 0); a turn with no input usage at all does not become the final context. Compactions are only the `compact_boundary` lines; the script does not infer them from a drop in the numbers. The host compacts a context that grew too large during work, and also a context that sat without a model request until its prompt cache expired. To tell them apart, each compaction gets the pause from the agent's previous model turn to the start of the compaction (the line's timestamp minus `durationMs`); a pause of 5 minutes or more marks it "after a pause". A tool result or a user prompt does not end the pause, because the cache ages from the last request: an orchestrator that waited 40 minutes on a subagent compacts after a pause, although the result arrived a second before. Thinking text is redacted in transcripts, so the thinking share counts turns that carry a thinking block. Gaps over 30 minutes are idle and excluded from every bucket, except a wait on a tool result, which is a hang unless nothing on the machine was active.

Two kinds of time are taken out of every gap before that. **Sleep:** on macOS the script reads `pmset -g log` (it keeps about a week; save it with `pmset -g log > pmset.log` and pass `--sleep-log pmset.log` for an older run, or `--sleep-log none` to turn it off). In every transcript of the session, the gap before an "API Error: Your computer went to sleep" line also counts as sleep. Sleep applies to all transcripts at once, so a tool call across a sleep is not a hang, and the report shows the run's wall-clock with the machine awake. **Questions:** from an `AskUserQuestion` call to its answer, the run is blocked on the user. That time is "waiting on the user", however long it is, and not idle or tool time.

**Units.** `/better:implement` keeps a checkpoint, `context/spec/<dir>/run.md`. The script takes the first such path in the run's lines of the main transcript and resolves it against the session's cwd (the first one the transcript records); `--run-md <path>` overrides it. From `run.md` it reads only `Status`, the `### Unit N.M` headings (`N.M` is a work unit, `N.Vk` a verification unit, `N.Rk` a rework unit, with the `§` criterion in the heading or in the `Rework-of:` line), and the `Agent:`, `State:`, and `Committed:` lines. A heading that occurs twice keeps its first block. Each top-level subagent of the run is matched by its description: "Unit 2.1 …" to unit 2.1, "Verify §2.1 …" to the verification unit for §2.1, "Rework §2.1 …" to the rework unit for §2.1; when several units of one kind share a criterion, they are taken in document order. Several subagents for one unit are attempts (a failed unit is delegated again). A nested agent belongs to its top-level ancestor's unit: its context counts toward the unit's peak, and its time is already inside the ancestor's. No time is read from `run.md`: a unit's active time is the sum of its attempts' active wall-clock, the Wall column of the per-agent table.

The transcript format is internal to Claude Code and may change between versions. The script is defensive about every field, and `tests/profiler-script.test.js` runs it against a synthetic session so a format drift fails loudly.

## Version

Independent of the other plugins. Moves as three files together: `.claude-plugin/plugin.json`, the marketplace entry, and the `EXPECTED_PROFILER_PLUGIN_VERSION` pin in `tests/lint-prompts.test.js`.
