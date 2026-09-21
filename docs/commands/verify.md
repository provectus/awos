# /awos:verify

> Verifies spec completion — checks acceptance criteria, marks Status as Completed.

## What it does

This command validates that the implemented feature meets all acceptance criteria from the functional spec. When everything passes, it marks the spec as completed and updates the roadmap. It updates:

- `context/spec/[index]-[name]/functional-spec.md` — marks criteria `[x]`, sets Status to `Completed`.
- `context/spec/[index]-[name]/technical-considerations.md` — sets Status to `Completed`.
- `context/product/roadmap.md` — marks the corresponding roadmap item `[x]`.

## Prerequisites

- The target spec directory must contain `functional-spec.md`, `technical-considerations.md`, and `tasks.md`.
- All tasks in `tasks.md` must be marked complete (`[x]`).

## How it works

1. **Finds the target spec**: Uses your prompt to target a specific spec, or automatically finds the first spec where all tasks are done but Status isn't yet `Completed`.
2. **Verifies acceptance criteria**: Goes through each criterion in the functional spec and checks whether the implementation satisfies it.
3. **Marks completion**: If all criteria pass — updates Status to `Completed` in both spec files and marks the roadmap item as done.
4. **Reviews product context**: Checks whether the product definition, architecture, or roadmap documents need updates based on what was learned during implementation. If discrepancies exist, suggests specific commands to run.

## Key behaviors

- **Criterion-by-criterion verification.** Each acceptance criterion is checked individually. If any criterion fails, verification stops and reports what's missing.
- **Stops on failure.** If a criterion isn't met, the command reports which one failed and why — it doesn't skip or ignore failures.
- **Updates the roadmap.** Successful verification automatically marks the corresponding roadmap item as complete.
- **Quick mode for low-risk specs.** With the `<!-- quick-verify: true -->` marker in `tasks.md`, verification is a single test-suite run: if the suite is green, every criterion is marked complete and the spec is closed. Use it for small changes where a full criterion walk costs more than it catches.
- **Detects drift.** If the implementation diverged from what's documented (e.g., a new caching layer was added that's not in the architecture), it suggests running the appropriate `/awos:*` command to update the docs.

## Common misconceptions

- **"This runs automated tests."** Only in quick mode. By default it verifies acceptance criteria from the functional spec against the actual implementation; with `<!-- quick-verify: true -->` the test suite result is what closes the spec.
- **"I can verify before all tasks are done."** The command requires all tasks in `tasks.md` to be marked complete before it will proceed.
- **"Once verified, I'm done forever."** Verification marks this spec as complete, but if the implementation introduced changes to your architecture or product understanding, follow the suggested commands to update those docs.

## Example usage

```bash
# Good — auto-detect the next spec ready for verification:
> /awos:verify

# Good — target a specific spec:
> /awos:verify spec 002
```

## What happens next

Repeat the feature cycle (`/awos:spec` → `/awos:tech` → `/awos:tasks` → `/awos:implement` → `/awos:verify`) for the next roadmap item.
