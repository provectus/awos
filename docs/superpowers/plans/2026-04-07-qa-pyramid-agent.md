# QA Pyramid Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend AWOS with a full test pyramid QA subsystem — a `testing-expert` sub-agent woven into vertical slices, a modified `/awos:tasks` that generates paired test tasks, and an optional `/awos:qa` full-audit command.

**Architecture:** The `testing-expert` agent operates in two modes: planning mode (called by `/awos:tasks` to generate test task descriptions) and execution mode (called by `/awos:implement` to write and run actual tests). `/awos:qa` is a standalone optional audit command that reads the global `context/qa/` registry, identifies gaps, and manages the regression suite. All changes are additive — no existing AWOS commands are broken.

**Tech Stack:** Markdown prompt files, no runtime dependencies. Agent definitions follow the AWOS `agent-template.md` convention. Command wrappers follow the existing `claude/commands/` thin-wrapper pattern.

---

## Files

| Action | File | Responsibility |
|--------|------|----------------|
| CREATE | `commands/qa.md` | `/awos:qa` full-audit command logic |
| CREATE | `claude/commands/qa.md` | Thin wrapper pointing to `commands/qa.md` |
| CREATE | `commands/testing-expert.md` | `testing-expert` agent — planning + execution modes |
| MODIFY | `commands/tasks.md` | Add Step 3b: invoke testing-expert to generate test tasks per slice |
| CREATE | `templates/qa-context-template.md` | Starter template for `context/qa/list-of-tests.md` |
| CREATE | `templates/regression-suite-template.md` | Starter template for `context/qa/regression-suite.md` |

---

## Task 1: Create `testing-expert` agent

**Files:**
- Create: `commands/testing-expert.md`

The `testing-expert` agent has two modes. **Planning mode** produces test task descriptions for `tasks.md`. **Execution mode** writes, RED-validates, and runs actual test code.

- [ ] **Step 1: Write `commands/testing-expert.md`**

```markdown
---
description: Plans and executes layered test suites (unit, integration, e2e, contract) for vertical slices. Enforces negative tests and RED validation.
---

# ROLE

You are an expert QA Engineer and Test Automation Specialist. You operate in two distinct modes depending on who calls you and what context you receive.

---

# MODE DETECTION

Read the invocation context:

- **Planning Mode** — called by `/awos:tasks` with a functional spec and technical spec but NO existing implementation code. Your job is to return structured test task descriptions for `tasks.md`. You do NOT write test code in this mode.
- **Execution Mode** — called by `/awos:implement` with a specific test task, the implementation code, and full spec context. Your job is to write, RED-validate, and run real test code.

---

# PLANNING MODE

## Inputs
- `functional-spec.md` from the target spec directory
- `technical-considerations.md` from the target spec directory
- The implementation sub-task description for the current slice

## Process

### Step 1: Discover frameworks
1. Read `context/product/architecture.md` for declared testing stack per layer (unit/integration/e2e/contract).
2. If not declared, auto-detect from dependency files: `package.json`, `requirements.txt`, `go.mod`, `Gemfile`, `pyproject.toml`, `pom.xml`.
3. If still not determinable, note "framework TBD — will auto-detect at execution time" in the task description.

### Step 2: Map acceptance criteria to test layers
For the given implementation sub-task, identify which acceptance criteria it touches. For each criterion, determine which layers apply:
- **Unit** — pure logic, no external dependencies
- **Integration** — service-to-service or DB interactions
- **E2E** — full user flow through the UI or API surface
- **Contract** — API schema/interface validation (OpenAPI, Pact, etc.)

Not every slice needs all four layers. Apply judgment.

### Step 3: Generate test task descriptions
For each applicable layer, generate two sub-tasks: one for positive cases, one for negative cases.

**Output format** (return this list to `/awos:tasks` for insertion into `tasks.md`):

```
- [ ] Unit: [describe positive behaviors] — positive cases **[Agent: testing-expert]**
- [ ] Unit: [describe negative/error inputs and boundary values] — negative cases **[Agent: testing-expert]**
- [ ] Integration: [describe service interaction scenarios] **[Agent: testing-expert]**
- [ ] Contract: [describe schema/interface validations + violation cases] **[Agent: testing-expert]**
- [ ] E2E: [describe full user flow — positive] **[Agent: testing-expert]**
- [ ] E2E: [describe failure/unhappy path flow — negative] **[Agent: testing-expert]**
```

Omit layers that genuinely don't apply. Always include negative cases for every layer that is included.

---

# EXECUTION MODE

## Inputs
- Specific test task description (layer + positive/negative scope)
- `functional-spec.md` + `technical-considerations.md` for the target spec
- `context/product/architecture.md`
- The implementation code written by the preceding impl sub-agent
- Current `context/qa/list-of-tests.md` (if it exists)

## Process

### Step 1: Discover frameworks
1. Read `context/product/architecture.md` for declared testing stack per layer.
2. Fall back to auto-detection via dependency files: `package.json`, `requirements.txt`, `go.mod`, `Gemfile`, `pyproject.toml`, `pom.xml`.

### Step 2: Plan test cases
Map the task's acceptance criteria to concrete test cases:
- For every positive case, define at least one negative counterpart.
- Negative cases must include: invalid inputs, boundary values, error paths, permission failures, malformed data — whichever apply to this layer.

### Step 3: Write tests with RED validation

Write tests following this discipline (borrowed from TDD red-green-refactor):

1. Write one test case.
2. Run it. **Confirm it FAILS** — and that the failure message matches the missing behavior, not a syntax error.
   - If it passes immediately: the test is not testing new behavior. Revise it until it fails for the right reason.
3. Proceed to the next test case.

Annotate every test file with:
```
# @layer: unit | integration | e2e | contract
# @spec: [spec-directory-name]
# @regression          ← add only for tests that should be in the permanent regression suite
```

### Step 4: Confirm GREEN
Run all tests written in this task. All must pass before continuing.

### Step 5: Check for implementation gaps
If tests reveal that the implementation is incomplete:
- Do NOT modify production code.
- Report the gap to `/awos:implement` with a clear description.
- A new impl sub-task will be created; this test task stays open until that sub-task closes.

### Step 6: Update `context/qa/list-of-tests.md`
Before appending new entries, scan the registry for existing tests covering the same behavior/AC in the same layer + spec:
- **Same behavior, same layer** → UPDATE the existing entry instead of adding a new one.
- **Broader test that needs splitting** → DEPRECATE the old entry, add focused replacements; annotate old test file with `# @deprecated`.
- **Partial overlap** → keep both, note the relationship in the Notes column.

Append only net-new tests. Format:

```markdown
| path/to/test_file.py | test_function_name | unit | negative | yes | OK |
```

### Step 7: Mark task [x]
Signal completion to `/awos:implement`.

---

# CONSTRAINTS

- Never modify production/implementation code — only test files.
- Never skip negative test cases — every included layer must have at least one negative test.
- RED validation is non-negotiable — a test that passes immediately without implementation proves nothing.
- Co-locate test files with source or follow the existing `tests/` directory convention in the project.
```

- [ ] **Step 2: Verify the file is well-formed**

```bash
cat commands/testing-expert.md | head -5
```
Expected output: starts with `---` frontmatter.

- [ ] **Step 2b: Write `claude/commands/testing-expert.md` (thin wrapper)**

```markdown
---
description: Plans and executes layered test suites (unit, integration, e2e, contract) for vertical slices. Enforces negative tests and RED validation.
---

Use `AskUserQuestion` tool for multiple-choice questions instead of plain text or numbered lists.

Refer to the instructions located in this file: .awos/commands/testing-expert.md
```

- [ ] **Step 3: Commit**

```bash
git add commands/testing-expert.md claude/commands/testing-expert.md
git commit -m "feat: add testing-expert agent for test pyramid generation"
```

---

## Task 2: Modify `/awos:tasks` to generate test tasks per slice

**Files:**
- Modify: `commands/tasks.md`

We add a new **Step 3b** after each implementation sub-task is defined. It invokes `testing-expert` in planning mode to generate paired test sub-tasks for that slice.

- [ ] **Step 1: Read the current `commands/tasks.md`**

```bash
cat commands/tasks.md
```

Identify the end of Step 3 ("Your Thought Process for Generating Tasks") — specifically after sub-step 3 where nested sub-tasks are created for a slice.

- [ ] **Step 2: Add Step 3b — test task generation**

After the line:
```
      - Use `general-purpose` agent when no specialist clearly matches the task — but **track these assignments** for the Recommendations table
```

Insert the following new sub-step **3b**:

```markdown
  3b. **Generate paired test tasks for each slice (REQUIRED):**
      - After defining the implementation sub-tasks for a slice, invoke the `testing-expert` agent in **planning mode**.
      - Pass it: the current slice's implementation sub-task description, `functional-spec.md`, and `technical-considerations.md`.
      - The `testing-expert` will return a list of test sub-tasks covering the applicable pyramid layers (unit, integration, e2e, contract) with both positive and negative cases.
      - Insert those test sub-tasks as children of the same slice, after the implementation sub-tasks.
      - **CRITICAL — Slice Completion Rule:** A slice parent task is only `[x]` when ALL its sub-tasks — both implementation AND all test sub-tasks — are `[x]`. This is enforced by `/awos:implement`'s existing sub-task completion logic.
      - Example result for a slice:
        ```
        - [ ] **Slice 1: User authentication**
          - [ ] Implement JWT token generation **[Agent: python-expert]**
          - [ ] Unit: token payload, expiry, signing — positive cases **[Agent: testing-expert]**
          - [ ] Unit: invalid secret, expired token, malformed input — negative cases **[Agent: testing-expert]**
          - [ ] Integration: valid/invalid credentials against /auth endpoint **[Agent: testing-expert]**
          - [ ] Contract: /auth response schema validation + violation cases **[Agent: testing-expert]**
        ```
```

- [ ] **Step 3: Update the example in Step 3 to reflect test tasks**

Find the existing "Good, Vertical Slices" example:
```markdown
    - `[ ] **Slice 2: Display the user's actual avatar if it exists**`
      - `[ ] Sub-task: Add avatar_url column to the users table via a migration. **[Agent: python-expert]**`
      ...
      - `[ ] Sub-task: Run the application. Use chrome MCP... **[Agent: manual-qa-expert]**`
```

Append test sub-tasks to Slice 2 in the example:
```markdown
      - `[ ] Unit: avatar_url column default, null handling — positive/negative **[Agent: testing-expert]**`
      - `[ ] Integration: GET /user returns avatar_url when set, null when not **[Agent: testing-expert]**`
      - `[ ] E2E: profile page shows avatar when present, placeholder when null **[Agent: testing-expert]**`
```

- [ ] **Step 4: Verify the file reads cleanly**

```bash
cat commands/tasks.md | grep -A5 "3b"
```
Expected: shows the new Step 3b block.

- [ ] **Step 5: Commit**

```bash
git add commands/tasks.md
git commit -m "feat: extend /awos:tasks to generate test pyramid tasks per vertical slice"
```

---

## Task 3: Create `/awos:qa` command

**Files:**
- Create: `commands/qa.md`
- Create: `claude/commands/qa.md`

- [ ] **Step 1: Write `commands/qa.md`**

```markdown
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
  - If the implementation has changed in ways that invalidate the test → flag `NEEDS UPDATE` and generate a diff suggestion. Do NOT auto-modify.

**Regression tag:**
- If tagged `@regression` → carry forward to the regression-suite.md sync in Step 7.

## Step 5: Gap analysis

For each acceptance criterion in the functional spec(s) in scope:

1. Check which pyramid layers have coverage (unit / integration / e2e / contract).
2. Check whether each covered layer has a negative test counterpart.
3. Record gaps:
   - Layer with no tests at all → `MISSING LAYER`
   - Layer with only positive tests → `MISSING NEGATIVE`

## Step 6: Generate missing tests

For each gap identified in Step 5:

1. Write the missing test following RED validation discipline (from `testing-expert` execution mode):
   - Write test → confirm it FAILS for the right reason → confirm it PASSES.
2. Add `@layer`, `@spec`, `@regression` (if appropriate) annotations.
3. Update `context/qa/list-of-tests.md` with the new entry, performing the overlap check:
   - Same behavior, same layer → UPDATE existing entry.
   - Broader test needing splitting → DEPRECATE old, add focused replacements.
   - Partial overlap → keep both, annotate relationship.

## Step 7: Run tests (with user confirmation)

1. Count all tests in scope. Notify user:
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
- Always ask for user confirmation before running tests.
- Generate a diff suggestion for stale tests — do not auto-rewrite them.
```

- [ ] **Step 2: Write `claude/commands/qa.md` (thin wrapper)**

```markdown
---
description: Optional full-audit QA command — coverage analysis, gap detection, regression suite management.
---

Use `AskUserQuestion` tool for multiple-choice questions instead of plain text or numbered lists.

Refer to the instructions located in this file: .awos/commands/qa.md
```

- [ ] **Step 3: Verify both files exist**

```bash
ls commands/qa.md claude/commands/qa.md
```
Expected: both files listed.

- [ ] **Step 4: Commit**

```bash
git add commands/qa.md claude/commands/qa.md
git commit -m "feat: add /awos:qa optional full-audit command"
```

---

## Task 4: Create QA context templates

**Files:**
- Create: `templates/qa-context-template.md`
- Create: `templates/regression-suite-template.md`

These templates are used by `/awos:qa` when initializing a fresh `context/qa/` directory in a project.

- [ ] **Step 1: Write `templates/qa-context-template.md`**

```markdown
# Test Registry

> Auto-maintained by `testing-expert` (execution mode) and `/awos:qa`.
> Each row is a registered test. Add rows by running `/awos:implement` (test tasks) or `/awos:qa`.
> Status values: OK | MISSING | NEEDS UPDATE | DEPRECATED | HUMAN REVIEW
> Layer values: unit | integration | e2e | contract

<!-- Sections are added per spec as tests accumulate -->
<!-- ## [spec-directory-name] -->
<!-- | File | Test Name | Layer | Positive/Negative | @regression | Status | Notes | -->
<!-- |------|-----------|-------|-------------------|-------------|--------|-------| -->
```

- [ ] **Step 2: Write `templates/regression-suite-template.md`**

```markdown
# Regression Suite

> Auto-maintained by `/awos:qa` Step 8. Synced from `@regression` annotations in test files.
> Run with: `/awos:qa` → choose "Regression suite only".

**Last updated:** YYYY-MM-DD
**Total:** 0 tests

<!-- Add spec sections as tests accumulate: -->
<!-- ## [spec-directory-name] (N tests) -->
<!-- - path/to/test_file.py::test_function_name -->
```

- [ ] **Step 3: Verify both files exist**

```bash
ls templates/qa-context-template.md templates/regression-suite-template.md
```
Expected: both files listed.

- [ ] **Step 4: Commit**

```bash
git add templates/qa-context-template.md templates/regression-suite-template.md
git commit -m "feat: add QA context templates for test registry and regression suite"
```

---

## Task 5: Final validation

- [ ] **Step 1: Confirm all files are present**

```bash
git diff main --name-only
```
Expected output:
```
claude/commands/qa.md
claude/commands/testing-expert.md
commands/qa.md
commands/tasks.md
commands/testing-expert.md
docs/superpowers/plans/2026-04-07-qa-pyramid-agent.md
templates/qa-context-template.md
templates/regression-suite-template.md
```

- [ ] **Step 2: Confirm all command wrappers reference the right paths**

```bash
grep "Refer to" claude/commands/qa.md
```
Expected: `Refer to the instructions located in this file: .awos/commands/qa.md`

- [ ] **Step 3: Confirm `testing-expert` is referenced correctly in `tasks.md`**

```bash
grep "testing-expert" commands/tasks.md | head -5
```
Expected: shows Step 3b referencing `testing-expert` in planning mode.

- [ ] **Step 4: Confirm no placeholder text remains**

```bash
grep -rn "TBD\|TODO\|PLACEHOLDER\|fill in" commands/qa.md commands/testing-expert.md commands/tasks.md templates/qa-context-template.md templates/regression-suite-template.md
```
Expected: no matches.

- [ ] **Step 5: Commit plan doc**

```bash
git add docs/superpowers/plans/2026-04-07-qa-pyramid-agent.md
git commit -m "docs: add QA pyramid agent implementation plan"
```
