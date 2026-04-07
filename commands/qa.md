---
description: Optional full-audit QA command — coverage analysis, gap detection, regression suite management.
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
2. If empty, target all spec directories under `context/spec/`.
3. Announce: "Running QA audit for: [scope]."

## Step 2: Discover frameworks

1. Read `context/product/architecture.md` for declared testing stack per layer.
2. Fall back to auto-detection via dependency files: `package.json`, `requirements.txt`, `go.mod`, `Gemfile`, `pyproject.toml`, `pom.xml`.

## Step 3: Load test registry

Read `context/qa/list-of-tests.md`. If it does not exist, create it from the template at `.awos/templates/qa-context-template.md` (or create an empty registry if template is absent).

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

For each acceptance criterion in the functional spec(s) in scope:

1. Check which pyramid layers have coverage (unit / integration / e2e / contract).
2. Check whether each covered layer has a negative test counterpart.
3. Record gaps:
   - Layer with no tests at all → `MISSING LAYER`
   - Layer with only positive tests → `MISSING NEGATIVE`

## Step 6: Generate missing tests

For each gap identified in Step 5:

1. Write the missing test following RED validation discipline (following `testing-expert` execution mode Step 3):
   - Write test → confirm it FAILS for the right reason → confirm it PASSES.
2. Add `@layer`, `@spec`, `@regression` (if appropriate) annotations using appropriate comment syntax for the language.
3. Update `context/qa/list-of-tests.md` with the new entry, performing the overlap check:
   - Same behavior, same layer → UPDATE existing entry instead of adding new.
   - Broader test needing splitting → DEPRECATE old (annotate with `@deprecated` using appropriate comment syntax for the language), add focused replacements.
   - Partial overlap → keep both, annotate relationship in Notes column.

Append net-new entries using this format:

```markdown
| File | Test Name | Layer | Positive/Negative | @regression | Status | Notes |
|------|-----------|-------|-------------------|-------------|--------|-------|
| path/to/test_file.py | test_function_name | unit | negative | yes | OK | |
```

## Step 7: Run tests (with user confirmation)

1. Count all tests in scope. Use `AskUserQuestion` with the following question and options:
   ```
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
| Spec | Unit | Integration | E2E | Contract | ACs Covered |
|------|------|-------------|-----|----------|-------------|
| [spec] | X/Y | X/Y | X/Y | X/Y | X/Y (Z%) |

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

# CONSTRAINTS

- Never modify production code.
- Never auto-deprecate tests whose spec was deleted — always flag for human review.
- Always ask for user confirmation before running tests (use `AskUserQuestion`).
- Generate a diff suggestion for stale tests — do not auto-rewrite them.
- Never skip the overlap check when updating `list-of-tests.md`.
