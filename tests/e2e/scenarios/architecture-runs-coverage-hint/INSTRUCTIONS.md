# Scenario: architecture-runs-coverage-hint

This validates that `/awos:architecture` saves the architecture, runs a verbal coverage hint, and defers the durable specialist coverage report to `/awos:hire`. The architecture file itself must NOT carry a coverage table.

The temp project has been seeded with:

- `.claude/agents/python-expert.md` — Python/FastAPI specialist (only Python is covered)
- NO `react-expert.md` (deliberate gap — the coverage hint should mention React as not covered, but Claude only reports it verbally; the persistent report is `/awos:hire`'s job)
- `context/product/product-definition.md` — small web app, Python backend + React frontend
- `context/product/roadmap.md` — phased roadmap that exercises both halves

## Steps

1. Open a new terminal: `cd {{WORKDIR}} && claude "/awos:architecture"`
2. Let Claude work to completion. It will be interactive — answer the architecture questions in line with the product definition (Python/FastAPI backend, React frontend, PostgreSQL is fine).
3. When the command finishes, return to this terminal and run:

   ```sh
   bun run e2e:verify
   ```

## What "pass" looks like

The verifier looks for evidence of the new (post-`c084e25`) contract:

1. **Inputs were read.** Both `context/product/product-definition.md` and `context/product/roadmap.md` were opened.
2. **Coverage hint happened.** `.claude/agents/` was looked at via `Glob`/`Read`/`LS`/`Grep` or an `Agent`/`Explore` delegation. (No deep frontmatter parsing required — `architecture.md` Step 4 explicitly says "without going deep, note how many of the listed technologies do not appear to have a matching specialist by description".)
3. **Architecture saved.** `context/product/architecture.md` exists.
4. **Boundary preserved.** `architecture.md` does NOT contain a `Technology | … | Status` markdown table. That report now lives in `context/product/agents.md`, written by `/awos:hire`.

If any contract is missed, the verifier prints the recent tool-call trace so you can see what Claude did instead.
