# /awos:quick

> Executes a small ad-hoc task end-to-end — plans, delegates, summarizes — without the full spec cycle.

## What it does

This command is a shorter path for one-off work that doesn't justify a full `spec → tech → tasks → implement → verify` cycle. Like `/awos:implement`, it acts as an orchestrator — it plans the task, delegates the coding to a specialist subagent, and tracks the outcome. It does **not** write code itself.

Quick tasks live in their own space, separate from planned features:

- `context/quick/[YYYYMMDD]-[slug]/PLAN.md` — the task goal, approach, steps, and definition of done.
- `context/quick/[YYYYMMDD]-[slug]/SUMMARY.md` — the outcome, files changed, and status (written after execution).

Nothing in `context/spec/` or the roadmap is touched.

## When to use it

- **Use `/awos:quick`** for a self-contained task that still needs a plan and a specialist: a focused bugfix, a small refactor, a config or dependency change, a one-off script, a contained enhancement.
- **Use the full cycle** for a roadmap feature — anything with multiple slices, cross-cutting acceptance criteria, or stakeholder-facing behavior worth specifying.
- **Skip AWOS entirely** for a trivial edit you can make in one step — Claude Code's built-in plan mode handles those.

## How it works

1.  **Restates the task** so you can confirm the intent.
2.  **Asks how thorough to be** — instead of flags, the command asks up front: _Plan and execute_ (default), _Discuss first_, _Research first_, or _Full_ (discuss + research + validate).
3.  **Optionally discusses** the approach and surfaces assumptions (if you chose Discuss or Full).
4.  **Optionally researches** approaches and pitfalls via a read-only agent (if you chose Research or Full).
5.  **Writes a short PLAN.md** — goal, approach, steps, definition of done, and the chosen specialist agent.
6.  **Picks a specialist subagent** — reusing the same specialists as `/awos:implement`, matched by technology and intent (falls back to `general-purpose`).
7.  **Delegates execution** with full plan context and clear verification criteria.
8.  **Optionally validates** the result against the definition of done (if you chose Full).
9.  **Writes SUMMARY.md** — outcome, files changed, verification result, and status.
10. **Offers to commit** — asks before committing; never commits without your explicit choice.

## Subcommands

| Subcommand      | What it does                                             |
| --------------- | -------------------------------------------------------- |
| `list`          | Lists all quick tasks with their date and status.        |
| `status <slug>` | Shows a task's plan file, status, goal, and last action. |
| `resume <slug>` | Resumes an in-progress quick task from its plan.         |

## Key behaviors

- **Strictly an orchestrator.** Like `/awos:implement`, it delegates all code changes to specialist subagents — it never writes code itself.
- **Depth is a question, not a flag.** The command asks how thorough to be at the start, so quality gates are opt-in per run without memorizing flags.
- **Asks before committing.** Changes are only committed when you explicitly choose to.
- **Separate from the roadmap.** Quick tasks are tracked in `context/quick/`, never in `context/spec/` or the roadmap.

## Common misconceptions

- **"This replaces the spec cycle."** No. Use it for contained, one-off work. Roadmap features still belong in the full `spec → tech → tasks → implement → verify` cycle.
- **"It writes the code."** No — it plans and delegates to a specialist subagent, exactly like `/awos:implement`.
- **"It commits automatically."** No. It always asks first.

## Example usage

```bash
# Good — plan and execute a contained task:
> /awos:quick Fix the Docker rate-limit failure by using the Artifactory proxy

# Good — investigate the approach before planning:
> /awos:quick Add request retry with backoff to the API client
# (then choose "Research first" when asked)

# Good — audit accumulated quick tasks:
> /awos:quick list

# Good — resume an in-progress task:
> /awos:quick resume add-request-retry
```

## What happens next

The task's `PLAN.md` and `SUMMARY.md` remain under `context/quick/[YYYYMMDD]-[slug]/` as a lightweight record. Use `/awos:quick list` to audit accumulated tasks and `/awos:quick resume <slug>` to continue any that were left unfinished.
