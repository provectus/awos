# Scenario: verify-runs-real-verification

This validates that `/awos:verify` enforces the F5 contract from `commands/verify.md`: it must actually run verification commands (or inspect the real artifact) before marking an acceptance criterion as satisfied. Textual reasoning over the spec is not verification.

The temp project has been seeded with:

- `context/spec/001-test-feature/functional-spec.md` — three acceptance criteria, all concretely verifiable (file existence, function return value, pytest run)
- `context/spec/001-test-feature/technical-considerations.md` — matches the spec
- `context/spec/001-test-feature/tasks.md` — all tasks already `[x]` so verify is the last step
- `src/health.py` — already implemented (criteria are real and pass)
- `tests/test_health.py` — pytest module asserting `health_check() == 'ok'`

## Steps

1. Open a new terminal and `cd {{WORKDIR}}`.
2. Run `claude` to start a Claude Code session.
3. Type: `/awos:verify 001-test-feature`
4. Let Claude work to completion. It should:
   - Read the functional spec and load the acceptance criteria
   - Actually verify each one — either by `Bash`ing pytest/python, by `Read`ing `src/health.py` to confirm the function exists, or by another concrete mechanism
   - Mark Status as `Completed` once everything passes
5. When the command finishes, return to this terminal and run:

   ```sh
   npm run e2e:verify verify-runs-real-verification {{WORKDIR}}
   ```

## What "pass" looks like

The verifier looks for evidence of three contracts:

1. **The functional spec was loaded.** A `Read` call hit `functional-spec.md`.
2. **At least one concrete verification mechanism was exercised.** Tolerant union: a real `Bash` invocation (pytest, python, node, curl, etc.), a `Read` on the implementation artifact (`src/health.py`), or a Playwright MCP call. The point is to confirm Claude touched the real artifact, not just reasoned about the spec.
3. **The spec was marked complete.** The functional spec now contains a `Status: Completed` line.

If any contract is missed, the verifier prints the recent tool-call trace so you can see what Claude did instead.
