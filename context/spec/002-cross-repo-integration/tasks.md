# Tasks: Cross-Repository Integration

**Spec:** `context/spec/002-cross-repo-integration/`

---

## Slice 1: Repository Scanner Foundation

The scanner is the foundation - all other work depends on it.

- [x] **Task 1: Create `repo-scanner.md` subagent with local repo support**
  - [x] Subtask: Create `subagents/repo-scanner.md` with ROLE, INPUTS, OUTPUTS, PROCESS sections as defined in tech spec section 2.1. **[Agent: general-purpose]**
  - [x] Subtask: Implement local repo scanning logic using Glob, Grep, Read tools. Support `quick` and `full` scan depths with default patterns. **[Agent: general-purpose]**
  - [x] Subtask: Implement scope options (`files`, `patterns`, `search`) for targeted scanning. **[Agent: general-purpose]**
  - [x] Subtask: Test scanner manually with a local AWOS-enabled repo to verify correct file return. **[Agent: general-purpose]**

- [x] **Task 2: Add GitHub repo support to scanner**
  - [x] Subtask: Extend scanner to detect `github` repo type and use `mcp__github__get_file_contents` and `mcp__github__search_code` tools. **[Agent: general-purpose]**
  - [x] Subtask: Add graceful error handling when GitHub MCP is unavailable (return error status, don't fail). **[Agent: general-purpose]**
  - [x] Subtask: Test scanner manually with a GitHub repo (public repo like `anthropics/claude-code`). **[Agent: general-purpose]**

---

## Slice 2: Registry Command Integration

Validate the scanner works via the registry command before updating other commands.

- [x] **Task 3: Refactor `/awos:registry` to use repo-scanner**
  - [x] Subtask: Modify `commands/registry.md` Step 4 (Repository Analysis) to delegate scanning to `repo-scanner` subagent instead of inline scanning logic. **[Agent: general-purpose]**
  - [x] Subtask: Update Step 4 to process raw scanner results and extract registry metadata. **[Agent: general-purpose]**
  - [x] Subtask: Test `/awos:registry` with a local repo to ensure it still works correctly. **[Agent: general-purpose]**
  - [x] Subtask: Test `/awos:registry` with a GitHub repo to ensure scanner delegation works. **[Agent: general-purpose]**

---

## Slice 3: Cross-Repo Context Loading for Commands

Each command gets a new Step 1 for loading registry context. Commands are updated one at a time to validate the pattern.

- [ ] **Task 4: Add registry-aware context loading to `/awos:product`**
  - [ ] Subtask: Add Step 1 to `commands/product.md` that reads `context/registry.md` and interprets its contents (no hardcoded parsing). **[Agent: general-purpose]**
  - [ ] Subtask: Add logic to determine if additional context is needed and delegate to `repo-scanner` for specific repos. **[Agent: general-purpose]**
  - [ ] Subtask: Update existing steps to use cross-repo context silently (no ecosystem summary displayed). **[Agent: general-purpose]**
  - [ ] Subtask: Test `/awos:product` without registry file (should proceed normally). **[Agent: general-purpose]**
  - [ ] Subtask: Test `/awos:product` with registry file containing related repos. **[Agent: general-purpose]**

- [ ] **Task 5: Add registry-aware context loading to `/awos:roadmap`**
  - [ ] Subtask: Add Step 1 to `commands/roadmap.md` following the same pattern as product.md. **[Agent: general-purpose]**
  - [ ] Subtask: Include logic to fetch roadmap phases from AWOS-enabled repos when deeper context needed. **[Agent: general-purpose]**
  - [ ] Subtask: Test `/awos:roadmap` with and without registry. **[Agent: general-purpose]**

- [ ] **Task 6: Add registry-aware context loading to `/awos:architecture`**
  - [ ] Subtask: Add Step 1 to `commands/architecture.md` following the established pattern. **[Agent: general-purpose]**
  - [ ] Subtask: Include logic to analyze tech stack, shared libraries, API contracts from related repos. **[Agent: general-purpose]**
  - [ ] Subtask: Test `/awos:architecture` with and without registry. **[Agent: general-purpose]**

- [ ] **Task 7: Add registry-aware context loading to `/awos:spec`**
  - [ ] Subtask: Add Step 1 to `commands/spec.md` following the established pattern. **[Agent: general-purpose]**
  - [ ] Subtask: Include logic to fetch spec listings and suggest cross-repo references. **[Agent: general-purpose]**
  - [ ] Subtask: Test `/awos:spec` with and without registry. **[Agent: general-purpose]**

- [ ] **Task 8: Add registry-aware context loading to `/awos:tech`**
  - [ ] Subtask: Add Step 1 to `commands/tech.md` following the established pattern. **[Agent: general-purpose]**
  - [ ] Subtask: Include logic to analyze technical specs, code patterns, and API designs from related repos. **[Agent: general-purpose]**
  - [ ] Subtask: Test `/awos:tech` with and without registry. **[Agent: general-purpose]**

- [ ] **Task 9: Add registry-aware context loading to `/awos:tasks`**
  - [ ] Subtask: Add Step 1 to `commands/tasks.md` following the established pattern. **[Agent: general-purpose]**
  - [ ] Subtask: Include logic to analyze task breakdown patterns from similar implementations in related repos. **[Agent: general-purpose]**
  - [ ] Subtask: Test `/awos:tasks` with and without registry. **[Agent: general-purpose]**

- [ ] **Task 10: Add registry-aware context loading to `/awos:implement`**
  - [ ] Subtask: Add Step 1 to `commands/implement.md` following the established pattern. **[Agent: general-purpose]**
  - [ ] Subtask: Include logic to pass relevant cross-repo context to subagents (API clients, shared types, testing patterns). **[Agent: general-purpose]**
  - [ ] Subtask: Test `/awos:implement` with and without registry. **[Agent: general-purpose]**

---

## Slice 4: Cross-Repository Spec References

- [ ] **Task 11: Add cross-repo spec reference support**
  - [ ] Subtask: Update `/awos:spec` to recognize and validate `@[repo-name]/spec/[spec-folder-name]` syntax. **[Agent: general-purpose]**
  - [ ] Subtask: Add "Cross-Repo Dependencies" section generation when saving specs with references. **[Agent: general-purpose]**
  - [ ] Subtask: Test spec creation with cross-repo references. **[Agent: general-purpose]**

---

## Slice 5: Dependency Impact Analysis

- [ ] **Task 12: Add dependency impact warnings**
  - [ ] Subtask: Update `/awos:spec` and `/awos:tech` to check if current spec is referenced by other repos. **[Agent: general-purpose]**
  - [ ] Subtask: Display warning with list of affected repos when editing referenced specs. **[Agent: general-purpose]**
  - [ ] Subtask: Test impact analysis with specs that have cross-repo references. **[Agent: general-purpose]**
