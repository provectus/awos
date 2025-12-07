# Task List: Registry Command (`/awos:registry`)

**Status:** Complete

---

## Slice 1: Create minimal registry command that can create an empty registry file

- [x] Create `templates/registry-template.md` with basic structure (header, placeholder for repos)
- [x] Create `commands/registry.md` with ROLE, TASK, INPUTS/OUTPUTS sections and minimal PROCESS
- [x] Create `claude/commands/awos/registry.md` wrapper file that references the main command
- [x] Test: Run `/awos:registry` in a project without registry.md, verify registry creation flow

---

## Slice 2: Add local repository registration with path validation

- [x] Extend `commands/registry.md` PROCESS to auto-detect repo type from input
- [x] Add local repository flow with path validation (absolute, relative, sibling)
- [x] Add path validation logic with fallback to show sibling directories
- [x] Test: Register a local directory and verify it's added to registry.md

---

## Slice 3: Add basic repo analysis for local repos (documentation scan)

- [x] Add scan type selection prompt (quick vs full) to command
- [x] Implement quick scan: read README.md, CLAUDE.md, and other .md files
- [x] Add AWOS-enabled detection (check for context/ with product/ and spec/ subdirectories)
- [x] Generate 7-10 sentence summary from scanned documentation
- [x] Test: Register local repo and verify summary is generated

---

## Slice 4: Add tech stack detection and tag generation

- [x] Add config file detection (package.json, pyproject.toml, go.mod, Cargo.toml, etc.)
- [x] Parse detected config files to extract major tech stack (not complete list)
- [x] Implement tag generation (5-10 descriptive tags) in lowercase-with-hyphens format
- [x] Update registry-template.md to include Tech Stack, Tags, Key Features, Functionality & Documentation References sections
- [x] Test: Register repo with config files and verify tech stack/tags are detected

---

## Slice 5: Add analysis review and user editing

- [x] Add analysis presentation step showing complete entry following template format
- [x] Add confirmation prompt: "Does this summary look correct? Would you like to adjust anything before saving?"
- [x] Allow user to request changes, make edits, and repeat review until approved
- [x] Test: Register repo, modify summary during review, verify changes are saved

---

## Slice 6: Add AWOS-enabled repo deep analysis

- [x] If context/ folder exists with product/ and spec/ subdirectories, parse product-definition.md, roadmap.md, architecture.md
- [x] List specs found in context/spec/ folder with completion status
- [x] Check for registry.md in target repo to understand its dependencies
- [x] Add AWOS Context section with Product Vision, Current Phase, and Specs list
- [x] Test: Register AWOS-enabled repo and verify context is extracted

---

## Slice 7: Add GitHub MCP detection and installation guidance

- [x] Add MCP config check (read ~/.claude/mcp.json for "github" in mcpServers)
- [x] Add MCP verification call (mcp__github__* test call) to verify it works
- [x] Add MCP missing flow with installation guidance: "GitHub MCP required. Install with: claude mcp add github"
- [x] Add fallback: "Try again after installing, or clone locally instead?"
- [x] Test: Run GitHub flow without MCP, verify guidance is shown

---

## Slice 8: Add GitHub repository registration via MCP

- [x] Add GitHub URL/owner-repo parsing (accept owner/repo or https://github.com/owner/repo)
- [x] Implement GitHub repo analysis using MCP tools (get_tree, get_file_contents, search_code)
- [x] Reuse existing analysis/summary logic for GitHub repos
- [x] Test: Register public GitHub repo via MCP and verify registry entry

---

## Slice 9: Add update mode for existing registry

- [x] Add mode detection: check if registry.md exists
- [x] If exists, display existing repos and show menu (Add/Update repo / Remove repo / Exit)
- [x] Implement unified Add/Update flow with upsert pattern (auto-detect add vs update)
- [x] Update Last Updated timestamp on updates
- [x] Test: Open existing registry and update a repo entry

---

## Slice 10: Add remove operation

- [x] Implement "Remove repo" flow with numbered list selection
- [x] Add confirmation prompt before removal
- [x] Delete entry and clean up bidirectional relationships
- [x] Handle special case: delete registry file if last entry removed
- [x] Test: Remove a repo and verify deletion

---

## Slice 11: Add relationship detection

- [x] Scan dependency files (package.json, pyproject.toml, go.mod, Cargo.toml, etc.)
- [x] Cross-reference dependencies against registered repos by package name, GitHub path, or local path
- [x] Populate "Depends on" field from matches
- [x] Update "Used by" lists bidirectionally when saving entries
- [x] Clean up "Used by" lists when removing entries

---

## Slice 12: Add stale repo handling

- [x] On registry load, verify accessibility of repos not updated more than a week ago
- [x] For local repos: Check if the path exists on the filesystem
- [x] For GitHub repos: Attempt an MCP call to verify the repo is accessible
- [x] Mark inaccessible repos with `status: stale` and display warning
- [x] When updating a stale repo with valid path, status returns to `active`
