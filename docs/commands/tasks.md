# /awos:tasks

> Breaks the Tech Spec into a task list for engineers.

## What it does

This command creates an actionable task list by breaking down the technical specification into small, incremental, end-to-end slices. Each task is assigned to a specialist subagent. It produces:

- `context/spec/[index]-[name]/tasks.md`

## Prerequisites

- The target spec directory must contain both `functional-spec.md` and `technical-considerations.md`.

## How it works

1. **Identifies the target spec**: Uses your prompt or asks you to choose from available specs.
2. **Analyzes both specs**: Reads the functional and technical specifications to understand both "what" and "how".
3. **Creates vertical slices**: Generates a list of tasks where each main task is a small, end-to-end piece of functionality — not a horizontal layer.
4. **Assigns agents**: Each sub-task gets a specialist agent assignment (e.g., `**[Agent: python-expert]**`) based on the technology involved.
5. **Adds verification steps**: Each slice includes test scenarios that agents must verify using real tools (browser MCP, curl, shell, etc.).
6. **Presents for review**: Shows the full task list for your approval before saving.

## Key behaviors

- **Vertical slicing is the core principle.** Each task delivers end-to-end functionality — database + API + UI together for one small feature. The application must remain runnable after each task.
- **No horizontal tasks.** "Do all database work" followed by "Do all API work" is explicitly prohibited. Instead: "Slice 1: Display placeholder avatar" → "Slice 2: Upload and display real avatar".
- **Agent assignment.** Every sub-task includes a `**[Agent: agent-name]**` tag. Tasks that don't match any specialist get assigned to `general-purpose`, with a recommendation table flagging these gaps.
- **Testable slices.** Each slice must be verifiable. The command identifies required MCPs/services for testing and warns if any are missing.
- **Incremental delivery.** After each slice is implemented, you should be able to start the app and see progress.

## Common misconceptions

- **"Tasks should be organized by layer."** No. "All database migrations" then "all API endpoints" then "all UI components" is the horizontal anti-pattern. Each task should cut through all layers for one small feature.
- **"Each task is a big feature."** Tasks should be the smallest possible end-to-end increment. If a task touches more than 2-3 files per layer, it's probably too big.
- **"I can skip verification steps."** Verification is how agents confirm their work. Without it, bugs accumulate silently across slices.

## Example usage

```bash
# Good — let it auto-detect the spec:
> /awos:tasks

# Good — specify the target spec:
> /awos:tasks 001-user-auth
```

## What happens next

Run `/awos:implement` to start executing the tasks.
