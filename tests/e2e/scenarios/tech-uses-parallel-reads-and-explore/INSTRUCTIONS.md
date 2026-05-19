# Scenario: tech-uses-parallel-reads-and-explore

This validates that `/awos:tech` follows the read-in-parallel and explore-via-Agent contract from `commands/tech.md`, Step 2:

- Reads `functional-spec.md` and `architecture.md` in parallel
- Scans `.claude/agents/` for specialist subagents
- Delegates codebase exploration to the built-in `Explore` agent rather than reading source itself

The temp project has been seeded with:

- `.claude/agents/python-expert.md` — Python/FastAPI specialist
- `context/product/architecture.md` — a small Python/FastAPI + PostgreSQL architecture
- `context/spec/001-test-feature/functional-spec.md` — "tag a snippet" feature
- `src/snippets/{models.py,api.py}` — a tiny existing codebase so `Explore` has something to find

## Steps

1. Open a new terminal: `cd {{WORKDIR}} && claude "/awos:tech 001-test-feature"`
2. Let Claude work to completion. It will be interactive — answer the high-level approach + per-section questions in line with the architecture (Python/FastAPI, PostgreSQL, JSON column or join table for the tags — either is fine).
3. When the command finishes, return to this terminal and run:

   ```sh
   bun run e2e:verify
   ```

## What "pass" looks like

The verifier looks for evidence of four contracts:

1. **Inputs were read.** `Read` calls hit both `functional-spec.md` and `architecture.md`.
2. **Reads were parallelized.** Both reads share the same `assistantUuid` in the session log (Claude issued them in one assistant turn, which is the parallel-tool-call pattern).
3. **Discovery happened.** `.claude/agents/` was scanned (Glob/Read/LS/Grep against it, or an Agent/Explore delegation referencing it).
4. **Code analysis was delegated.** At least one `Agent`/`Task` call had `subagent_type` matching `/Explore/i`.
5. **Output is wired up.** `context/spec/001-test-feature/technical-considerations.md` exists.
