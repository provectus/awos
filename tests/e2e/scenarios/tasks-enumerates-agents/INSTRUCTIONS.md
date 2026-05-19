# Scenario: tasks-enumerates-agents

This validates that `/awos:tasks` discovers specialist subagents by scanning `.claude/agents/`, not by guessing.

The temp project has been seeded with:

- `.claude/agents/python-expert.md` (a Python/FastAPI specialist)
- `.claude/agents/react-expert.md` (a React/TypeScript specialist)
- `context/spec/001-test-feature/functional-spec.md` — user profile picture upload
- `context/spec/001-test-feature/technical-considerations.md` — Python + React tech spec

## Steps

1. Open a new terminal: `cd {{WORKDIR}} && claude "/awos:tasks 001-test-feature"`
2. Let Claude work to completion. It should:
   - Read the functional spec and technical considerations
   - Scan `.claude/agents/*.md` and parse frontmatter
   - Produce `context/spec/001-test-feature/tasks.md` with `**[Agent: python-expert]**` and `**[Agent: react-expert]**` markers on the relevant sub-tasks
3. When the command finishes, return to this terminal and run:

   ```sh
   bun run e2e:verify
   ```

## What "pass" looks like

The verifier looks for evidence of two contracts:

1. **Discovery happened.** Either `Glob`/`Read` against `.claude/agents/`, or a delegation to the built-in `Explore`/`Agent` whose prompt mentions `.claude/agents`. Tolerant union — any of these proves the prompt's instruction was followed.
2. **Output is wired up.** `context/spec/001-test-feature/tasks.md` exists and contains both `**[Agent: python-expert]**` and `**[Agent: react-expert]**` markers.

If either contract is missed, the verifier prints the recent tool-call trace so you can see what Claude did instead.
