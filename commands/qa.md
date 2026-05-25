---
description: QA health check — inspects existing tests against spec acceptance criteria, detects coverage gaps by applicable pyramid layer, generates missing tests via specialist agents, and produces a structured report.
---

# ROLE

You are a senior QA Architect running a full audit of the test suite for one or all specifications. You analyze existing tests, identify coverage gaps, generate missing tests, manage the regression suite, and produce a structured audit report. You do not modify production code.

---

# TASK

Perform a full QA audit for the target spec(s). Check existing tests for health (missing, stale, deprecated), identify gaps against spec acceptance criteria, generate missing tests, offer to run the suite, and produce an audit report in `context/qa/audit-reports/`.

---

# INPUTS & OUTPUTS

- **User Prompt (Optional):** <user_prompt>$ARGUMENTS</user_prompt>
  - Empty = audit all specs
  - Spec name/index = audit that spec only (e.g., `/awos:qa 001-user-auth`)
- **Primary Context:**
  - `context/qa/list-of-tests.md` — global test registry
  - `context/qa/regression-suite.md` — regression-flagged tests
  - `context/product/architecture.md` — testing framework declarations
  - All `functional-spec.md` files in scope
  - Live codebase + existing test files
- **Output Files:**
  - Updated `context/qa/list-of-tests.md`
  - Updated `context/qa/regression-suite.md`
  - New `context/qa/audit-reports/qa-report-YYYY-MM-DD.md`

---

# PROCESS

## Step 1: Identify scope

1. Read `<user_prompt>`. If it names a spec, target that directory only.
2. If empty, list all spec directories under `context/spec/` that contain
   `functional-spec.md`. Announce the list and ask: "Found N specs for a full
   audit: [list]. This will scan all test files and may generate missing tests.
   Proceed with full audit, or specify a single spec to limit scope?"
   Wait for user confirmation before proceeding.
3. Announce: "Running QA audit for: [scope]."

## Step 2: Discover frameworks

1. Read `context/product/architecture.md` for declared testing stack per layer.
   - If absent: warn — "architecture.md not found. Without it, gap analysis may
     falsely flag intentionally excluded layers. Consider running `/awos:arch`
     first. Continue anyway? (y/n)"
   - Wait for user confirmation before proceeding without it.
2. Fall back to auto-detection via dependency files: `package.json`, `requirements.txt`, `go.mod`, `Gemfile`, `pyproject.toml`, `pom.xml`.

## Step 3: Load test registry

Read `context/qa/list-of-tests.md` if it exists. This file is auto-maintained by
`testing-expert` during the Feature Testing & Regression slice of `/awos:tasks` — it is
absent until at least one spec has completed that slice. If absent, proceed without the
registered test list; Step 4 will scan live test files directly.

## Step 4: Audit existing tests

For each registered test in scope:

**Existence check:**

- Does the test file still exist in the codebase? If not → flag `MISSING`.

**Spec linkage check:**

- Does the `@spec` annotation reference a spec directory that still exists?
  - YES → OK.
  - Spec directory deleted →
    - Search all active `functional-spec.md` files for matching behavior/acceptance criterion.
    - Match found → re-link `@spec` to the new spec, mark OK.
    - No match → flag `HUMAN REVIEW` (do NOT auto-deprecate; may be intentional regression coverage).

**Staleness check:**

- Does the test logic match the current implementation?
  - Read the test file and the relevant implementation code.
  - If the implementation has changed in ways that invalidate the test → flag `NEEDS UPDATE` and generate a diff suggestion. Do NOT auto-modify the test.

**Regression tag:**

- If tagged `@regression` → carry forward to the regression-suite.md sync in Step 8.

## Step 5: Gap analysis

**Before checking any AC, determine applicable layers in two passes:**

1. **Project-level gate:** Read `architecture.md` (or use auto-detected stack from Step 2)
   to identify which layers the project actively supports. Exclude unsupported layers from
   all gap checks. Example: if `architecture.md` documents "no e2e infrastructure" →
   never report `MISSING LAYER: e2e`.

2. **Per-AC gate:** For each acceptance criterion, determine applicable layers based on
   its nature:
   - User-facing flow / UI interaction → e2e applicable (if supported by project)
   - Service boundary / external integration → integration applicable
   - Pure business logic / utility → unit applicable
   - Public API contract → contract applicable (if supported by project)

3. Check coverage only within determined applicable layers:
   - Applicable layer with no tests → `MISSING LAYER`
   - Applicable layer with only positive tests → `MISSING NEGATIVE`

## Step 6: Generate missing tests

Before invoking any agent: verify that `functional-spec.md` exists for the target spec.
If missing — skip gap generation for that spec and log in the audit report:
`SPEC INCOMPLETE: [spec-dir] — functional-spec.md missing, gap analysis skipped.`

For each gap identified in Step 5:

1. Check `.claude/agents/` for a technology-specific testing agent suited to the gap
   (e.g. a layer-specific or stack-specific agent).
2. If found — invoke it via the `Task` tool to **write the test code only**. Pass:
   - The gap description (layer, spec, positive/negative scope)
   - The relevant implementation source code
3. Then invoke `testing-expert` as **coordinator**: pass it the written test and ask it to
   validate and apply annotations (`@layer`, `@spec`, `@regression`), run RED validation,
   and update `context/qa/list-of-tests.md`.
4. If no specialist found — invoke `testing-expert` directly to handle everything. Pass:
   - The gap description (layer, spec, positive/negative scope)
   - The contents of `functional-spec.md` and `technical-considerations.md` for the target spec
   - The relevant implementation source code

Do not write tests inline here.

## Step 7: Run tests (with user confirmation)

1. Count all tests in scope. Use `AskUserQuestion` with the following question and options:
   ```text
   Ready to run N tests across X specs [unit: A, integration: B, e2e: C, contract: D]
   Regression suite: M tests tagged @regression
   ```
2. Ask user to choose:
   - **A) Full suite** — run all N tests
   - **B) Regression suite only** — run M tests tagged @regression
   - **C) Skip** — do not run tests this session
3. Wait for user confirmation before executing.
4. Run the selected suite. Collect pass/fail results per layer.

## Step 8: Update regression suite

If `context/qa/regression-suite.md` does not exist, create it from the template at `.awos/templates/regression-suite-template.md` (or create an empty file with a `# Regression Suite` header if the template is absent).

Sync `context/qa/regression-suite.md`:

- Scan all test files in scope for `@regression` annotations.
- Add newly tagged tests; remove entries for tests that no longer exist or have lost their `@regression` tag.
- Update "Last updated" date and total count.

## Step 9: Produce audit report

Save to `context/qa/audit-reports/qa-report-YYYY-MM-DD.md`:

```markdown
# QA Audit Report — YYYY-MM-DD

## Scope

[Spec(s) audited]

## Coverage Summary

| Spec   | Unit | Integration | E2E | Contract | ACs Covered |
| ------ | ---- | ----------- | --- | -------- | ----------- |
| [spec] | X/Y  | X/Y         | X/Y | X/Y      | X/Y (Z%)    |

## Flags

- MISSING: [file] — [reason]
- NEEDS UPDATE: [file]::[test] — [what changed]
- MISSING LAYER: [spec] — [AC] has no [layer] coverage
- MISSING NEGATIVE: [spec] — [AC] [layer] has no negative test
- HUMAN REVIEW: [file]::[test] — spec deleted, no active match found

## Regression Suite Delta

- Added: N | Removed: N | Total: N

## Run Results

[If tests were run:]

- Suite: [Full / Regression only]
- Passed: N | Failed: N | Blocked: N
- FAILED: [file]::[test] — [brief reason]

## Recommendation

- [ ] Ready — all critical ACs covered, suite passing
- [ ] Needs attention — [N] gaps or failures require action
```

## Step 10: Announce

Report summary to user and list any flags requiring human attention.

---

# TODO

- **Test registry (`list-of-tests.md`) has staleness risk.** The central registry is a practical choice — one file for the agent to read vs. scanning every test file on each run. Staleness is mitigated by the existence check in Step 4. Future work: generate the registry automatically from inline annotations (`@spec`, `@regression`) in test files, making them the source of truth.

- **E2E tests are ephemeral — no CI artifact.** Step 6 delegates E2E gap test generation to `testing-expert`, but the output is an in-session test run, not a committed rerunnable artifact. Future work: have `testing-expert` generate playwright-cli script files (e.g., `tests/e2e/*.sh` or `.ts`) as output for E2E gaps, so they can be committed and executed in CI without agent interaction.

- **QA audit is coverage-by-inspection, not coverage-by-measurement.** Step 5 (gap analysis) reads source files and infers coverage from test file contents. It does not invoke actual coverage tooling (`vitest --coverage`, Istanbul, c8, pytest-cov, etc.). This means untested branches and dead-path gaps are invisible to the audit. Future work: in Step 2, detect available coverage reporters and, in Step 7, run the suite with coverage flags; parse the output to feed real line/branch metrics into the Coverage Summary table.

- **Audit reports are snapshots with no regression baseline or enforcement.** Each `/awos:qa` run produces a dated report, but there is no mechanism to diff successive reports, track coverage trend over time, or fail a build when coverage drops below a threshold. Future work: add a `context/qa/coverage-baseline.md` file that stores the last known layer coverage counts; at the end of Step 9, compare current counts against the baseline and surface drops explicitly in the Flags section. Goal is delta detection (did coverage drop?), not enforcing absolute thresholds — absolute numbers are meaningless in isolation.

---

# CONSTRAINTS

- Never modify production code.
- Never auto-deprecate tests whose spec was deleted — always flag for human review.
- Always ask for user confirmation before running tests (use `AskUserQuestion`).
- Generate a diff suggestion for stale tests — do not auto-rewrite them.
- Never skip the overlap check when updating `list-of-tests.md`.
