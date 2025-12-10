# Technical Specification: Cross-Repository Integration

- **Functional Specification:** `context/spec/002-cross-repo-integration/functional-spec.md`
- **Status:** Draft
- **Author(s):** Poe (Technical Architect)

---

## 1. High-Level Technical Approach

The Cross-Repository Integration feature is implemented as a **prompt-based solution** following the existing AWOS command pattern. No changes to the Node.js installer are required.

**Core Architecture Decision:** Create a **shared Repository Scanner subagent** (`subagents/repo-scanner.md`) that handles the mechanics of scanning repositories. Commands read the registry file directly and only call the scanner when deeper context is needed from specific repos.

**Separation of Concerns:**

- **Registry File:** Contains all repo metadata - commands read it directly using the Read tool
- **Scanner:** Called on-demand to fetch additional content from specific repos
- **Commands:** Read registry, decide if more context needed, delegate to scanner, process results

**Key Principle:** No hardcoded registry structure in commands. Commands treat `registry.md` as a document to read and interpret, making the registry format easy to evolve.

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1. Repository Scanner Subagent

**File:** `subagents/repo-scanner.md`

A simple, focused agent that scans repositories and returns raw file contents.

#### ROLE

Repository Scanner - A utility agent that reads files from repositories regardless of their type (local or GitHub).

#### INPUTS

| Parameter    | Required | Description                                      |
| ------------ | -------- | ------------------------------------------------ |
| `repo_type`  | Yes      | `local` or `github`                              |
| `repo_path`  | Yes      | Filesystem path (local) or `owner/repo` (GitHub) |
| `scan_depth` | Yes      | `quick` (docs only) or `full` (everything)       |
| `scope`      | No       | Optional scope to narrow the scan                |

**Scope Options (optional, can combine):**

- `files`: List of specific file paths to read (e.g., `["README.md", "context/product/product-definition.md"]`)
- `patterns`: Glob patterns to match (e.g., `["context/spec/**/*.md", "*.json"]`)
- `search`: Text pattern to search for (e.g., `"authentication"`)

If no scope provided, scanner uses default patterns based on `scan_depth`.

#### OUTPUTS

Returns raw file contents as a list:

```
[
  { "path": "README.md", "content": "..." },
  { "path": "context/product/product-definition.md", "content": "..." },
  ...
]
```

No summarization. No interpretation. Just raw content.

#### PROCESS

1. **Determine Access Method:**
   - If `repo_type` is `local`: Use Glob, Grep, Read tools
   - If `repo_type` is `github`: Use GitHub MCP tools

2. **Resolve Scope:**
   - If `scope.files` provided: Read those specific files
   - If `scope.patterns` provided: Find files matching patterns, read them
   - If `scope.search` provided: Search for pattern, return matching files with context
   - If no scope: Use defaults based on `scan_depth`:
     - `quick`: `README.md`, `CLAUDE.md`, `*.md` in root, `docs/**/*.md`, `context/**/*.md`, config files
     - `full`: All files (with token warning)

3. **Execute Scan:**

   **For Local Repos:**
   - Use Glob tool to find files matching patterns
   - Use Read tool to get file contents
   - Use Grep tool if search pattern provided

   **For GitHub Repos:**
   - Use `mcp__github__get_file_contents` for specific files
   - Use `mcp__github__search_code` for pattern searches
   - Handle MCP unavailability gracefully (return error status)

4. **Return Results:**
   - Return list of file paths and their raw contents
   - If any files couldn't be read, include error status for those files
   - No processing, summarization, or interpretation

### 2.2. Command Updates

Each command adds a step for cross-repo context loading. Commands read the registry directly and only call the scanner when more context needed. Spec-level commands like `/awos:spec`, `/awos:tech`, `/awos:tasks`, and `/awos:implement` can call the scanner for spec-related repos to get more context about specific functionality or integration of repos.

#### Pattern for All Commands

Add as **Step 1** (renumber existing steps):

```markdown
### Step 1: Load Cross-Repository Context

1. **Read Registry:** Use the Read tool to check if `context/registry.md` exists.
   - If it doesn't exist, skip to Step 2 (no error, no message).
   - If it exists, read and interpret its contents to understand:
     - What repositories are registered
     - Their types, paths, and status
     - Relationships and dependencies
     - AWOS context if available

2. **Determine Context Needs:** Based on the current command's purpose, decide if additional context is needed from any registered repos.

3. **Fetch Additional Context (if needed):** For repos where deeper context would help:

   Use the Task tool to delegate to `repo-scanner` subagent with:
   - `repo_type`: interpreted from registry
   - `repo_path`: interpreted from registry
   - `scan_depth`: `quick`
   - `scope`: specific files or patterns relevant to this command

4. **Process Results:** Receive raw file contents from scanner. Summarize and organize internally.

5. **Use Context Silently:** Apply this context throughout the conversation to inform suggestions and decisions.

**Do NOT display ecosystem summaries to the user.**
```

#### Command-Specific Behavior

Each command interprets the registry and decides what additional context to fetch:

**Key Point:** Commands don't hardcode registry structure. They read it, interpret it as a document, and make decisions based on its content.

### 2.3. Registry Command Update

Update `commands/registry.md` to use the scanner for repository analysis:

**Changes to Step 4 (Repository Analysis):**

```markdown
### Step 4: Repository Analysis

#### 4.1. Scan Repository

Use the Task tool to delegate to `repo-scanner` subagent with:

- `repo_type`: determined from user input (local or github)
- `repo_path`: validated path from Step 3
- `scan_depth`: from user selection (quick/full)
- `scope`: (none - use defaults based on scan_depth)

#### 4.2. Process Results

Receive raw file contents from scanner.

Analyze the returned content to extract necessary information:

#### 4.3. Generate Entry

Use extracted information to populate the registry template.

#### 4.4. Present Analysis

Show the complete entry to user for review.
```

### 2.4. Files Created/Modified

| File              | Location     | Action | Description                        |
| ----------------- | ------------ | ------ | ---------------------------------- |
| `repo-scanner.md` | `subagents/` | Create | Shared repository scanner subagent |
| `product.md`      | `commands/`  | Modify | Add Step 1 for context loading     |
| `roadmap.md`      | `commands/`  | Modify | Add Step 1 for context loading     |
| `architecture.md` | `commands/`  | Modify | Add Step 1 for context loading     |
| `spec.md`         | `commands/`  | Modify | Add Step 1 for context loading     |
| `tech.md`         | `commands/`  | Modify | Add Step 1 for context loading     |
| `tasks.md`        | `commands/`  | Modify | Add Step 1 for context loading     |
| `implement.md`    | `commands/`  | Modify | Add Step 1 for context loading     |
| `registry.md`     | `commands/`  | Modify | Delegate scanning to repo-scanner  |

---

## 3. Impact and Risk Analysis

### System Dependencies

| Dependency        | Required              | Fallback                                              |
| ----------------- | --------------------- | ----------------------------------------------------- |
| Claude Code CLI   | Yes                   | None - framework requirement                          |
| GitHub MCP        | For GitHub repos only | Scanner returns error status; command skips that repo |
| Local file system | For local repos       | None - always available                               |
| Task tool         | Yes                   | Required for subagent delegation                      |
| Read tool         | Yes                   | Required for reading registry                         |

### Potential Risks & Mitigations

| Risk                    | Impact                      | Mitigation                                                |
| ----------------------- | --------------------------- | --------------------------------------------------------- |
| GitHub MCP unavailable  | Cannot scan GitHub repos    | Scanner returns error status; command skips that repo     |
| Large files             | Token limits exceeded       | Scanner can truncate large files or return error          |
| Many repos in registry  | Slow context loading        | Commands only call scanner when needed, not for all repos |
| Registry format changes | Commands might misinterpret | Commands read registry as document, no hardcoded parsing  |
| Invalid repo paths      | Scanner errors              | Return error status per repo, continue with others        |

---

## 4. Testing Strategy

### Manual Testing Scenarios

1. **Scanner with Local Repo:**
   - Call scanner with local repo, quick scan
   - Verify correct files returned
   - Verify raw content (no summarization)

2. **Scanner with GitHub Repo:**
   - Call scanner with GitHub repo
   - Verify MCP tools used correctly
   - Test MCP unavailable - verify error status returned

3. **Scanner with Specific Scope:**
   - Call scanner with `scope.files` list
   - Verify only specified files returned
   - Call scanner with `scope.patterns`
   - Verify pattern matching works

4. **Command without Registry:**
   - Run command without `context/registry.md`
   - Verify command proceeds normally
   - Verify no errors or messages about missing registry

5. **Command with Registry (No Deep Scan Needed):**
   - Create registry with repos
   - Run command where registry content is sufficient
   - Verify scanner is NOT called unnecessarily

6. **Command with Registry (Deep Scan Needed):**
   - Create registry with AWOS-enabled repos
   - Run command that needs spec details
   - Verify scanner is called for specific repos
   - Verify command uses context silently

7. **Registry Command:**
   - Run `/awos:registry` to add repo
   - Verify scanner is used for analysis
   - Verify results populate registry template

8. **Cross-Repo Search:**
   - Run command and request search across repos
   - Verify scanner called with search scope
   - Verify results aggregated correctly

### Acceptance Criteria Validation

All acceptance criteria from functional spec sections 2.1-2.14 should be tested during implementation.
