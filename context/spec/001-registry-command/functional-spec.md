# Functional Specification: Registry Command (`/awos:registry`)

- **Roadmap Item:** Phase 2 - Multi-Repository Registry
- **Status:** Approved
- **Author:** Poe (Product Analyst)

---

## 1. Overview and Rationale (The "Why")

### Problem Statement
AWOS currently operates within a single repository context. However, most real-world projects consist of multiple repositories (frontend, backend, infrastructure, shared libraries). When working on a feature that spans repos, AI agents lack visibility into related codebases, leading to:
- Incomplete context when generating code that depends on other repos
- Duplicate effort re-explaining cross-repo relationships
- Inconsistent architectural decisions across related services

### Solution
The `/awos:registry` command creates and manages a registry file (`context/registry.md`) that serves as an index of related repositories. This registry provides comprehensive metadata for other AWOS commands to:
1. Understand which repos are relevant to a given question or task
2. Know where to look for detailed answers (then scan those repos on-demand)
3. Track dependencies and relationships between repos

### Success Criteria
- Users can register local and GitHub repos within a single interactive session
- Other AWOS commands can query the registry to find relevant repos for cross-repo context
- Registry entries contain comprehensive metadata (summary, tech stack, tags, features, relationships) to enable quick lookups
- AWOS-enabled repos are detected and their context/ folders analyzed for product vision, roadmap phase, and specs

---

## 2. Functional Requirements (The "What")

### 2.1. Command Invocation

- **As a** user, **I want to** run `/awos:registry` **so that** I can manage my project's related repositories.
  - **Acceptance Criteria:**
    - [x] When I run `/awos:registry`, the command checks if `context/registry.md` exists
    - [x] If registry exists, show existing repos and prompt: "What would you like to do? (Add/Update repo / Remove repo / Exit)"
    - [x] If registry doesn't exist, prompt: "No registry found. Let's create your registry. Would you like to add a repository?"

### 2.2. Repository Input

- **As a** user, **I want to** specify a repository by path or URL **so that** I can register repos from different sources.
  - **Acceptance Criteria:**
    - [x] Ask what repository the user wants to add or update
    - [x] Accept GitHub URLs, owner/repo format, or local paths
    - [x] Auto-detect type based on input format
    - [x] If GitHub input detected, proceed to GitHub Repository Flow (2.4)
    - [x] If local path detected, proceed to Local Repository Flow (2.3)

### 2.3. Local Repository Flow

- **As a** user, **I want to** register a local repository **so that** I can link related projects on my machine.
  - **Acceptance Criteria:**
    - [x] Normalize and validate the provided path
    - [x] Support absolute paths (starts with `/`)
    - [x] Support relative paths (`../` or `./`)
    - [x] Support sibling directory names (try `../[input]`)
    - [x] If path is invalid, offer to show sibling directories or allow retry
    - [x] Once valid path confirmed, proceed to Repository Analysis

### 2.4. GitHub Repository Flow

- **As a** user, **I want to** register a GitHub repository **so that** I can link remote codebases.
  - **Acceptance Criteria:**
    - [x] Accept input in either format: `owner/repo` or `https://github.com/owner/repo`
    - [x] Parse the input to extract owner and repo name
    - [x] Read `~/.claude/mcp.json` for `"github"` in `mcpServers`
    - [x] If found, attempt an `mcp__github__*` test call to verify it works
    - [x] If GitHub MCP is available, proceed to Repository Analysis
    - [x] If GitHub MCP is NOT available, proceed to MCP Missing Flow (2.5)

### 2.5. MCP Missing Flow

- **As a** user, **I want to** be guided on how to install GitHub MCP **so that** I can access remote repos.
  - **Acceptance Criteria:**
    - [x] Display message: "GitHub MCP required. Install with: `claude mcp add github`"
    - [x] Ask: "Try again after installing, or clone locally instead?"
    - [x] If "Retry" selected, return to MCP detection
    - [x] If "Clone locally" selected, show `git clone https://github.com/{owner}/{repo}` command and suggest registering the local path after cloning

### 2.6. Scan Type Selection

- **As a** user, **I want to** choose the scan depth **so that** I can control how much analysis is performed.
  - **Acceptance Criteria:**
    - [x] Prompt: "How deep should I analyze this repository?"
    - [x] Option 1: "Quick scan" - Documentation, guides, and examples in all directories and subdirectories (README.md, CLAUDE.md, *.md, docs/, examples/, configuration files, etc.)
    - [x] Option 2: "Full scan" - Everything, each and every file (show token warning)
    - [x] If AWOS-enabled repo detected (context/ with product/ and spec/ subdirectories), automatically include context/ folder analysis

### 2.7. Repo Analysis Engine

- **As a** user, **I want** the command to analyze the repository **so that** I understand what the repo contains.
  - **Acceptance Criteria:**
    - [x] Scan documentation files: README.md, CLAUDE.md, and any other `.md` files with potential documentation
    - [x] If AWOS-enabled: Parse context/product/product-definition.md, roadmap.md, architecture.md
    - [x] If AWOS-enabled: Scan for all spec files in context/spec/, note filename and assess completeness
    - [x] If AWOS-enabled: Check for registry.md in that repo to understand its dependencies
    - [x] Detect tech stack from config files (package.json, pyproject.toml, go.mod, Cargo.toml, composer.json, Gemfile, pom.xml, build.gradle)
    - [x] Extract major languages, frameworks, and key dependencies (not complete list)
    - [x] Generate 5-10 descriptive tags in lowercase-with-hyphens format

### 2.8. Analysis Review

- **As a** user, **I want to** review the analysis results **so that** I can confirm the summary is accurate.
  - **Acceptance Criteria:**
    - [x] Display complete entry following template format with all sections
    - [x] Include: Summary (7-10 sentences), Tech Stack, Tags, Key Features, Functionality & Documentation References, Relationships
    - [x] If AWOS-enabled: Include Product Vision, Current Phase, and Specs list with completion status
    - [x] Ask: "Does this summary look correct? Would you like to adjust anything before saving?"
    - [x] Allow user to request changes, make edits, show updated entry, and repeat review
    - [x] Continue until user approves

### 2.9. Registry File Management

- **As a** user, **I want** the registry saved to `context/registry.md` **so that** other commands can access it.
  - **Acceptance Criteria:**
    - [x] Each repo entry includes: Name, Type (local/github), Path, Status, Last Updated, AWOS Enabled
    - [x] Each repo entry includes: Summary, Tech Stack, Tags, Key Features, Functionality & Documentation References, Relationships
    - [x] If AWOS-enabled: Include AWOS Context section with Product Vision, Current Phase, and Specs
    - [x] Three save modes: Creation (new registry), Add (append to existing), Update (replace existing entry)
    - [x] Update bidirectional relationships when saving (add to "Used by" lists of dependencies)
    - [x] After saving, ask if user wants to add/update another repository

### 2.10. Remove Repository

- **As a** user, **I want to** remove a repository from the registry **so that** I can clean up outdated entries.
  - **Acceptance Criteria:**
    - [x] Display list of registered repos with numbers for selection
    - [x] Ask user to select which repository to remove
    - [x] Show confirmation with repo details before removal
    - [x] Delete the entire entry from registry
    - [x] Clean up bidirectional relationships (remove from "Used by" lists)
    - [x] If last entry removed, delete the registry file

### 2.11. Stale Repository Handling

- **As a** user, **I want** clear feedback when a repo becomes inaccessible **so that** I know something is wrong.
  - **Acceptance Criteria:**
    - [x] On registry load, verify accessibility of repos not updated more than a week ago
    - [x] For local repos: Check if the path exists on the filesystem
    - [x] For GitHub repos: Attempt an MCP call to verify the repo is accessible
    - [x] Mark inaccessible repos with `status: stale`
    - [x] Display warning listing stale repos before showing menu
    - [x] Keep entries (don't auto-remove) so user can investigate or update
    - [x] When updating a stale repo with valid path, status returns to `active`

---

## 3. Scope and Boundaries

### In-Scope (Implemented)

- Creating new `/awos:registry` command with full interactive flow
- Local repository registration via path validation
- GitHub repository registration via GitHub MCP
- MCP availability detection and installation guidance
- Repository analysis engine (docs, config files, AWOS context)
- Registry file creation and updates (`context/registry.md`)
- Stale repo detection and marking on registry load
- Bidirectional relationship tracking (Depends on / Used by)
- Remove repository functionality

### Out-of-Scope

*(These are separate roadmap items for Phase 3 and beyond)*

- **Read-Only Context Integration:** Making other commands (product, roadmap, architecture, spec, tech, tasks) registry-aware
- **Cross-Repository Search:** Searching across repos for specs, code patterns
- **MCP-Based GitHub Search:** Deep search within remote repos
- **CLI-Based Local Search:** grep/find operations in local repos
- **Synchronized Specifications:** Cross-repo spec references and dependency tracking
- **Change Impact Analysis:** Identifying affected repos when specs change
- **Private GitHub Repos:** Authenticated access to private repositories
- **GitLab Support:** Support for GitLab-hosted repositories
- **Monorepo Detection:** Special handling for monorepo structures
