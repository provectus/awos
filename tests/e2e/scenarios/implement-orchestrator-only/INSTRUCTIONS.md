# Scenario: implement-orchestrator-only

This validates that `/awos:implement` behaves as an orchestrator — it delegates the actual coding to a subagent via the `Agent` tool and does NOT call `Edit`/`Write`/`MultiEdit` on source files itself.

The temp project has been seeded with:

- `.claude/agents/python-expert.md` — Python specialist
- `context/spec/001-test-feature/functional-spec.md` — tiny health-check spec
- `context/spec/001-test-feature/technical-considerations.md` — matching tech notes
- `context/spec/001-test-feature/tasks.md` — one slice with a `**[Agent: python-expert]**` sub-task plus a verification sub-task running `pytest tests/test_health.py`
- `src/` — empty directory ready to receive the implementation

## Steps

1. Open a new terminal: `cd {{WORKDIR}} && claude "/awos:implement 001-test-feature"`
2. Let Claude work to completion. It should:
   - Read the three spec files
   - Extract the `**[Agent: python-expert]**` marker
   - Delegate the actual coding to the `python-expert` subagent via the `Agent` tool
   - The orchestrator itself should not touch `src/` files with `Edit`/`Write`
3. When the command finishes, return to this terminal and run:

   ```sh
   bun run e2e:verify
   ```

## What "pass" looks like

The verifier looks for evidence of the orchestrator contract:

1. **Delegation happened.** At least one `Agent` (or legacy `Task`) tool call with a `subagent_type` set.
2. **The orchestrator did not write code itself.** No `Edit`/`Write`/`MultiEdit` calls on source files. Editing `tasks.md` to flip checkboxes is allowed — that is bookkeeping, not coding.
3. **Verification commands were passed through.** The delegation prompt mentions `<verification_commands>` or the concrete `pytest` command from `tasks.md`.
4. **F5 guards were attached to the delegation.** The prompt contains both `<scope_discipline>` and `<investigate_before_answering>` blocks (the F5 contract from `commands/implement.md`).
5. **The Agent marker survived in `tasks.md`.** The orchestrator may flip a checkbox but must not rewrite the marker line.
