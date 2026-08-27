# /awos:quick

> Executes a small ad-hoc task end-to-end — plans, delegates, summarizes — without the full spec cycle.

**Shortcut:** `/awos:q` — identical behavior, shorter to type.

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
3.  **Creates a task directory** under `context/quick/[YYYYMMDD]-[slug]/`.
4.  **Optionally discusses** the approach and surfaces assumptions (if you chose Discuss or Full).
5.  **Optionally researches** approaches and pitfalls via a read-only agent (if you chose Research or Full).
6.  **Picks a specialist subagent** — reusing the same specialists as `/awos:implement`, matched by technology and intent (falls back to `general-purpose` for config, docs, scripts, and other generic work). When multiple match, prefers the narrower specialist.
7.  **Validates DRY** — checks whether the task parallels existing structure and defaults to reuse over duplication before planning.
8.  **Writes a short PLAN.md** — goal, approach, DRY check, steps, definition of done, and the chosen specialist agent.
9.  **Loads project context** — checks for `product-definition.md`, `architecture.md`, and `roadmap.md`. If they exist, the subagent is instructed to read them before starting and align changes with the product and architecture.
10. **Delegates execution** with full plan context and clear verification criteria.
11. **Optionally validates** the result against the definition of done (if you chose Full).
12. **Writes SUMMARY.md** — outcome, files changed, verification result, and status.
13. **Offers to commit** — in a git repo, asks before committing and never commits without your explicit choice; in a non-repo project, skips the commit step and leaves the changes on disk.
14. **Reports** the slug, what was done, files changed, and points to the task directory.

## Subcommands

| Subcommand      | What it does                                             |
| --------------- | -------------------------------------------------------- |
| `list`          | Lists all quick tasks with their date and status.        |
| `status <slug>` | Shows a task's plan file, status, goal, and last action. |
| `resume <slug>` | Resumes an in-progress quick task from its plan.         |

## Key behaviors

- **Strictly an orchestrator.** Like `/awos:implement`, it delegates all code changes to specialist subagents — it never writes code itself.
- **Context-aware.** When AWOS context files exist (product definition, architecture, roadmap), the subagent reads them before starting — so even quick tasks stay aligned with the project's design decisions. This also applies to resumed tasks.
- **DRY-first.** Before writing the plan, checks whether the task parallels existing structure and defaults to extracting shared logic rather than duplicating.
- **Depth is a question, not a flag.** The command asks how thorough to be at the start, so quality gates are opt-in per run without memorizing flags.
- **Asks before committing.** Changes are only committed when you explicitly choose to.
- **Separate from the roadmap.** Quick tasks are tracked in `context/quick/`, never in `context/spec/` or the roadmap.

## Common misconceptions

- **"This replaces the spec cycle."** No. Use it for contained, one-off work. Roadmap features still belong in the full `spec → tech → tasks → implement → verify` cycle.
- **"It writes the code."** No — it plans and delegates to a specialist subagent, exactly like `/awos:implement`.
- **"It commits automatically."** No. It always asks first.

## Example usage

```text
# Good — plan and execute a contained task:
> /awos:quick Fix the Docker rate-limit failure by using the Artifactory proxy

# Same thing using the shortcut:
> /awos:q Fix the Docker rate-limit failure by using the Artifactory proxy

# Good — investigate the approach before planning:
> /awos:quick Add request retry with backoff to the API client
# (then choose "Research first" when asked)

# Good — audit accumulated quick tasks:
> /awos:q list

# Good — resume an in-progress task:
> /awos:q resume add-request-retry
```

## What happens next

The task's `PLAN.md` and `SUMMARY.md` remain under `context/quick/[YYYYMMDD]-[slug]/` as a lightweight record. Use `/awos:quick list` to audit accumulated tasks and `/awos:quick resume <slug>` to continue any that were left unfinished.
