# /awos:implement

> Runs tasks — delegates coding to sub-agents, tracks progress.

## What it does

This command acts as an engineering manager — it reads the task list, delegates each task to the appropriate specialist subagent, and tracks progress. It does **not** write code itself. It updates:

- `context/spec/[index]-[name]/tasks.md` — marks tasks `[x]` as they complete.

The actual code changes are made by the specialist subagents it delegates to.

## Prerequisites

- The target spec directory must contain `functional-spec.md`, `technical-considerations.md`, and `tasks.md`.
- At least one incomplete task (`[ ]`) must exist in `tasks.md`.

## How it works

1. **Finds the next task**: Scans spec directories in order, finds the first incomplete task. Or uses your prompt to target a specific spec/task.
2. **Loads full context**: Reads all three spec files (functional, technical, tasks) so the delegated agent has complete information.
3. **Extracts agent assignment**: Reads the `**[Agent: agent-name]**` tag from the task description to determine which specialist to delegate to.
4. **Delegates to subagent**: Sends a detailed prompt with full context and clear success criteria to the specialist agent (or `general-purpose` if no assignment found).
5. **Updates progress**: Marks the completed task `[x]` in `tasks.md`. If all sub-tasks under a parent are done, marks the parent too.
6. **Reports status**: Shows completion percentage (e.g., "5/12 tasks done (42%)").

## Key behaviors

- **Strictly an orchestrator.** The implement command is prohibited from writing, editing, or modifying any production code, configuration files, or database schemas. It only delegates and tracks.
- **Full context per delegation.** Each subagent receives the complete functional spec, technical spec, and task list — not just the task description. This ensures agents have all the context they need.
- **Automatic task progression.** When run without arguments, it automatically finds and starts the next incomplete task.
- **Parent/child task tracking.** When all sub-tasks under a parent are marked complete, the parent is automatically marked complete too.

## Common misconceptions

- **"This command writes the code."** No. It delegates to specialist subagents. The implement command is purely an orchestrator.
- **"I need to babysit every task."** You don't. Run `/awos:implement all the slices in the spec` and let it work through the entire list autonomously. Each slice has clear scope, verification criteria, and agent assignments — the agents run the code and check results themselves.
- **"I should micromanage the agents."** Trust the flow. Vertical slicing ensures each task is small and self-contained, and Claude Code can actually run the changes and verify that each slice meets its acceptance criteria.

## Example usage

```bash
# Good — auto-pick the next task:
> /awos:implement

# Good — implement all remaining tasks:
> /awos:implement Implement all tasks

# Good — target a specific phase:
> /awos:implement Implement Phase 2
```

## What happens next

When all tasks reach 100%, run `/awos:verify` to check acceptance criteria and mark the spec as completed.
