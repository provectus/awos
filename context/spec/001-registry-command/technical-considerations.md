# Technical Specification: Registry Command (`/awos:registry`)

- **Functional Specification:** `context/spec/001-registry-command/functional-spec.md`
- **Status:** Approved
- **Author(s):** Poe (Technical Architect)

---

## 1. High-Level Technical Approach

The `/awos:registry` command is implemented as a **prompt-based command** following the existing AWOS command pattern. No changes to the Node.js installer are required.

**Key Components:**
1. **Command File:** `commands/registry.md` with ROLE/TASK/INPUTS/OUTPUTS/PROCESS structure
2. **Wrapper File:** `claude/commands/awos/registry.md` for user customization layer
3. **Template File:** `templates/registry-template.md` defining the registry entry structure
4. **Output File:** `context/registry.md` storing the multi-repo index

**Integration Points:**
- **Local Repos:** Use Glob, Grep, and Read tools for file access
- **GitHub Repos:** Use official GitHub MCP server (`mcp__github__*` tools)
- **MCP Detection:** Check `~/.claude/mcp.json` config, then verify with test MCP call

---

## 2. Proposed Solution & Implementation Plan (The "How")

### 2.1. Files Created

| File | Location | Overwrite Behavior |
|------|----------|-------------------|
| `registry.md` | `commands/` | Always (framework core) |
| `registry.md` | `claude/commands/awos/` | Protected (user layer) |
| `registry-template.md` | `templates/` | Always (framework core) |

Files are automatically picked up by existing installer patterns.

### 2.2. Command File Structure (`commands/registry.md`)

The command follows the standard AWOS structure:

- **ROLE:** Repository Registry Manager named "Poe"
- **TASK:** Manage registry file at `context/registry.md`
- **INPUTS & OUTPUTS:**
  - Template File: `.awos/templates/registry-template.md`
  - User Prompt: `<user_prompt>$ARGUMENTS</user_prompt>`
  - Primary Input/Output: `context/registry.md`
- **PROCESS:** 7 main steps
  1. Mode Detection & Menu
  2. Get Repository
  3. Path Validation
  4. Repository Analysis (Scan Type, File Access, AWOS Detection, Scan Files, Generate Entry, Present Analysis)
  5. User Review
  6. Save to Registry (Upsert)
  7. Remove Repository

### 2.3. Registry Template Structure (`templates/registry-template.md`)

Each repository entry includes:

**Metadata:**
- Type: `local` | `github`
- Path: relative/absolute path or `owner/repo`
- Status: `active` | `stale`
- Last Updated: `YYYY-MM-DD HH:MM`
- AWOS Enabled: `yes` | `no`

**Sections:**
- **Summary:** 7-10 sentence comprehensive description
- **Tech Stack:** Major languages, frameworks, key dependencies (not complete list)
- **Tags:** 5-10 descriptive tags in lowercase-with-hyphens format
- **Key Features:** 3-10 main capabilities
- **Functionality & Documentation References:** Key file/folder locations
- **Relationships:** Depends on / Used by (bidirectional)
- **AWOS Context (if enabled):** Product Vision, Current Phase, Specs list with completion status

### 2.4. MCP Detection Logic

Two-step MCP detection:

1. **Config Check:** Read `~/.claude/mcp.json` for `"github"` in `mcpServers`
2. **Verification Call:** Attempt `mcp__github__*` test call to verify it works

**Fallback Flow:**
- If MCP not available: Show "GitHub MCP required. Install with: `claude mcp add github`"
- Offer: "Try again after installing, or clone locally instead?"
- If clone locally: Show git clone command and suggest registering local path

### 2.5. Local Repository Analysis Flow

Using Claude Code tools:

1. **Path Validation:** Normalize path (absolute, relative, or sibling directory)
2. **File Discovery:** Use Glob tool with patterns (`**/*.md`, `context/**/*`)
3. **Content Search:** Use Grep tool for content search
4. **File Reading:** Use Read tool to get file contents
5. **AWOS Detection:** Check for `context/` with `product/` and `spec/` subdirectories

### 2.6. GitHub Repository Analysis Flow

Using GitHub MCP tools:

1. **Parse Input:** Accept `owner/repo` or `https://github.com/owner/repo`
2. **Directory Structure:** Use `mcp__github__get_tree` or `mcp__github__list_files`
3. **File Contents:** Use `mcp__github__get_file_contents(owner, repo, path)`
4. **Code Search:** Use `mcp__github__search_code` if available

### 2.7. Relationship Detection

Detect dependencies on other registered repositories by:

1. **Reading Current Registry:** Parse existing entries for cross-referencing
2. **Scanning Dependency Files:**
   - `package.json` → dependencies, devDependencies, peerDependencies
   - `pyproject.toml` → project.dependencies, tool.poetry.dependencies
   - `go.mod` → require statements
   - `Cargo.toml` → dependencies
   - `composer.json`, `Gemfile`, `pom.xml`, `build.gradle`
3. **Cross-Referencing:** Match dependencies against registered repos by package name, GitHub path, or local path
4. **Bidirectional Updates:** When saving, update "Used by" lists in dependent repos

---

## 3. Impact and Risk Analysis

### System Dependencies

| Dependency | Required | Fallback |
|------------|----------|----------|
| Claude Code CLI | Yes | None - framework requirement |
| GitHub MCP | For GitHub repos only | Clone repo locally |
| Local file system | For local repos | None - always available |

### Potential Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| MCP not installed | Cannot access GitHub repos | Clear guidance to install or clone locally |
| Repo becomes inaccessible | Stale registry data | Mark as `status: stale` on registry load, keep entry |
| Large repo analysis | Slow/timeout | Offer quick vs full scan options |
| Conflicting repo names | Ambiguous references | Use full path/URL as unique identifier |
| Registry file corruption | Lost registry data | Registry is markdown, recoverable via git |

---

## 4. Testing Strategy

### Manual Testing Scenarios

1. **Fresh Registry Creation:**
   - Run `/awos:registry` with no existing registry.md
   - Verify prompt flow and file creation

2. **Local Repo Registration:**
   - Add sibling directory as local repo
   - Verify path validation and analysis

3. **GitHub Repo Registration (MCP available):**
   - Add public GitHub repo
   - Verify MCP calls and analysis

4. **GitHub Repo Registration (MCP missing):**
   - Remove GitHub MCP temporarily
   - Verify fallback guidance is shown

5. **AWOS-Enabled Repo Detection:**
   - Register repo that has context/ folder with product/ and spec/ subdirectories
   - Verify AWOS context (Product Vision, Current Phase, Specs) is parsed and shown

6. **Update Existing Entry:**
   - Modify a registered repo
   - Re-add/update via Add/Update option
   - Verify entry is updated with new Last Updated timestamp

7. **Stale Repo Handling:**
   - Delete a registered local repo directory
   - Open registry and verify stale marking and warning message

8. **Remove Repository:**
   - Remove a repo from registry
   - Verify entry is deleted and bidirectional relationships are cleaned up

### Acceptance Criteria Validation

All acceptance criteria from functional spec sections 2.1-2.11 have been tested during implementation.
