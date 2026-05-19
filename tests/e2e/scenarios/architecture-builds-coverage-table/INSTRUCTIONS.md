# Scenario: architecture-builds-coverage-table

This validates that `/awos:architecture` scans `.claude/agents/` and produces a coverage table that marks each technology in the architecture as ✅ Exists or ⚠️ Missing depending on whether a matching specialist is registered.

The temp project has been seeded with:

- `.claude/agents/python-expert.md` — Python/FastAPI specialist (only Python is covered)
- NO `react-expert.md` (deliberate gap — the React row in the coverage table must come out as ⚠️ Missing)
- `context/product/product-definition.md` — small web app, Python backend + React frontend
- `context/product/roadmap.md` — phased roadmap that exercises both halves

## Steps

1. Open a new terminal and `cd {{WORKDIR}}`.
2. Run `claude` to start a Claude Code session.
3. Type: `/awos:architecture`
4. Let Claude work to completion. It will be interactive — answer the architecture questions in line with the product definition (Python/FastAPI backend, React frontend, PostgreSQL is fine). Steer it toward a stack where at least React is present and at least Python is present.
5. When the command finishes, return to this terminal and run:

   ```sh
   npm run e2e:verify architecture-builds-coverage-table {{WORKDIR}}
   ```

## What "pass" looks like

The verifier looks for evidence of two contracts:

1. **Inputs were read.** Both `context/product/product-definition.md` and `context/product/roadmap.md` were opened.
2. **Discovery happened.** Either `Glob`/`Read`/`LS`/`Grep` against `.claude/agents/`, or an `Agent`/`Explore` delegation whose prompt mentions the path. Same tolerant union as `tasks-enumerates-agents`.
3. **Output is wired up.** `context/product/architecture.md` exists and contains a coverage-table header row.
4. **Coverage table reflects reality.** At least one row marks a technology as ✅ Exists (Python row should match `python-expert.md`) and at least one row marks a technology as ⚠️ Missing (React, because no `react-expert.md` is installed).

If any contract is missed, the verifier prints the recent tool-call trace so you can see what Claude did instead.
