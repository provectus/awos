# Functional Specification: Cross-Repository Integration

- **Roadmap Item:** Phase 3 - Cross-Repository Integration
- **Status:** Draft
- **Author:** Poe (Product Analyst)

---

## 1. Overview and Rationale (The "Why")

### Problem Statement

With the registry command (Phase 2) complete, AWOS can now track related repositories. However, the existing workflow commands (`/awos:product`, `/awos:roadmap`, `/awos:architecture`, `/awos:spec`, `/awos:tech`, `/awos:tasks`) operate in isolation within a single repository. They have no awareness of:

- Related codebases that may influence architectural decisions
- Existing specifications in linked repositories that could be referenced
- Dependencies between repos that affect implementation planning
- Code patterns and implementations in related services

This leads to:

- Duplicate specifications being written for shared functionality
- Inconsistent architectural decisions across related services
- Missing context when planning features that span multiple repos
- Manual effort to look up and reference related documentation

### Solution

Update existing AWOS commands to automatically leverage the registry for cross-repository awareness. Commands will:

1. **Read the registry file directly** on startup to understand the multi-repo landscape
2. **Identify relevant repos** based on the current task or context
3. **Delegate to a shared Repository Scanner subagent** when deeper context is needed from specific repos
4. **Enable cross-references** in specifications to link related work across repos

**Key Architecture:** A shared Repository Scanner subagent handles all repository scanning mechanics (local and GitHub). Commands read the registry as a document (no hardcoded structure), interpret its contents, and call the scanner only when additional context is needed. The scanner returns raw file contents; commands are responsible for summarization.

### Success Criteria

- Commands automatically include relevant cross-repo context without user intervention
- Users can search for specifications, patterns, and code across all registered repositories
- Specifications can reference and link to specs in other repositories
- Changes to shared specs surface affected downstream repositories

---

## 2. Functional Requirements (The "What")

### 2.1. Registry Loading on Command Startup

- **As a** user running any AWOS command, **I want** the command to automatically load the registry, **so that** cross-repo context is always available.
  - **Acceptance Criteria:**
    - [ ] When any command starts, use Read tool to check if `context/registry.md` exists
    - [ ] If registry exists, read and interpret its contents as a document (no hardcoded structure parsing)
    - [ ] If registry does not exist, proceed without cross-repo features (no error, no message)
    - [ ] Commands only call the Repository Scanner subagent when deeper context is needed from specific repos
    - [ ] Spec-level commands (`/awos:spec`, `/awos:tech`, `/awos:tasks`, `/awos:implement`) can call the scanner for spec-related repos to get more context about specific functionality or integration
    - [ ] Registry loading should not noticeably delay command startup

### 2.2. Relevant Repository Detection

- **As a** user, **I want** commands to automatically identify which registered repos are relevant to my current task, **so that** I only see pertinent context.
  - **Acceptance Criteria:**
    - [ ] Analyze the current task/question to identify relevant topics (tech stack, domain, feature area)
    - [ ] Match topics against registry entries
    - [ ] Rank repositories by relevance score
    - [ ] Include top 3-5 most relevant repos in the context
    - [ ] Always include repos with direct dependency relationships (Depends on / Used by)

### 2.3. Registry-Aware Product Definition (`/awos:product`)

- **As a** user defining a new product, **I want** the command to seamlessly understand the project ecosystem, **so that** product decisions account for cross-repo relationships.
  - **Acceptance Criteria:**
    - [ ] When starting `/awos:product`, silently scan the registry for all related, dependent, or interconnected projects
    - [ ] For each related repo, analyze the relationship type:
      - Direct dependencies (current project depends on repo)
      - Reverse dependencies (repo depends on current project)
      - Shared functionality (overlapping features or APIs)
      - Integration points (where repos communicate or exchange data)
    - [ ] If registry metadata is insufficient, scan the referenced repos to extract specifics (product definition, key features, APIs etc.)
    - [ ] Build internal context map of the ecosystem without displaying it to the user
    - [ ] Use this context to inform product definition questions and suggestions
    - [ ] When user defines features, automatically consider how they relate to or affect connected repos
    - [ ] No explicit "ecosystem summary" displayed - context is used seamlessly in the conversation

### 2.4. Registry-Aware Roadmap (`/awos:roadmap`)

- **As a** user planning a roadmap, **I want** the command to seamlessly understand related projects' phases and timelines, **so that** roadmap decisions align with the ecosystem.
  - **Acceptance Criteria:**
    - [ ] When starting `/awos:roadmap`, silently scan the registry for all related projects
    - [ ] For AWOS-enabled repos, fetch their roadmap phases and current status
    - [ ] Identify cross-project dependencies that affect sequencing:
      - Features in current project that depend on unreleased features in other repos
      - Features in other repos waiting on current project's deliverables
      - Shared milestones or integration points across repos
    - [ ] If registry metadata is insufficient, scan referenced repos for roadmap details and supported feature detection
    - [ ] Build internal context of ecosystem timelines without displaying it to the user
    - [ ] Use this context to inform roadmap sequencing suggestions
    - [ ] When user defines phases, automatically consider dependencies on connected repos
    - [ ] No explicit "ecosystem roadmap summary" displayed - context is used seamlessly

### 2.5. Registry-Aware Architecture (`/awos:architecture`)

- **As a** user defining architecture, **I want** the command to seamlessly understand related projects' technical decisions, **so that** architecture remains consistent across the ecosystem.
  - **Acceptance Criteria:**
    - [ ] When starting `/awos:architecture`, silently scan the registry for all related projects
    - [ ] For each related repo, analyze technical aspects:
      - Tech stack and frameworks in use
      - Shared libraries or common dependencies
      - API contracts and communication patterns
      - Database schemas or data models that overlap
      - Infrastructure and deployment patterns
    - [ ] If registry metadata is insufficient, scan referenced repos for architecture details
    - [ ] Build internal context of ecosystem architecture without displaying it to the user
    - [ ] Use this context to inform architecture questions and suggestions
    - [ ] When user makes technical decisions, automatically consider compatibility with connected repos
    - [ ] Silently flag potential conflicts (e.g., incompatible versions, conflicting patterns) and address in conversation
    - [ ] No explicit "ecosystem architecture summary" displayed - context is used seamlessly

### 2.6. Registry-Aware Functional Specification (`/awos:spec`)

- **As a** user writing functional specifications, **I want** the command to seamlessly understand related specs across the ecosystem, **so that** specifications avoid duplication and maintain consistency.
  - **Acceptance Criteria:**
    - [ ] When starting `/awos:spec`, silently scan the registry for all related projects
    - [ ] For AWOS-enabled repos, fetch their spec listings and summaries
    - [ ] Identify relevant cross-repo specs based on:
      - Similar feature areas or domains
      - Shared user flows or interactions
      - Dependencies (features that rely on or extend other repos' features)
      - Common patterns or conventions
    - [ ] If registry metadata is insufficient, scan referenced repos for spec details
    - [ ] Build internal context of related specifications without displaying it to the user
    - [ ] Use this context to inform spec questions and suggestions
    - [ ] When user defines requirements, automatically consider existing specs in connected repos
    - [ ] Suggest cross-repo references when relevant (e.g., "This feature will integrate with [repo]'s authentication")
    - [ ] No explicit "related specs list" displayed - context is used seamlessly

### 2.7. Registry-Aware Technical Specification (`/awos:tech`)

- **As a** user writing technical specifications, **I want** the command to seamlessly understand implementation patterns across the ecosystem, **so that** technical decisions align with related projects.
  - **Acceptance Criteria:**
    - [ ] When starting `/awos:tech`, silently scan the registry for all related projects
    - [ ] For each related repo, analyze technical implementation aspects:
      - Existing technical specs and their approaches
      - Code patterns and conventions in use
      - API designs and contracts
      - Data models and schemas
      - Integration patterns between repos
    - [ ] If registry metadata is insufficient, scan referenced repos for technical details
    - [ ] Build internal context of ecosystem implementations without displaying it to the user
    - [ ] Use this context to inform technical approach questions and suggestions
    - [ ] When user makes implementation decisions, automatically consider patterns in connected repos
    - [ ] Silently identify reusable components or shared libraries from other repos
    - [ ] No explicit "ecosystem tech summary" displayed - context is used seamlessly

### 2.8. Registry-Aware Task Breakdown (`/awos:tasks`)

- **As a** user breaking down tasks, **I want** the command to seamlessly understand implementation patterns across the ecosystem, **so that** task planning accounts for cross-repo dependencies.
  - **Acceptance Criteria:**
    - [ ] When starting `/awos:tasks`, silently scan the registry for all related projects
    - [ ] For each related repo, analyze task-relevant aspects:
      - Similar task breakdowns from past implementations
      - Shared components or utilities that can be reused
      - Integration tasks required for cross-repo features
      - Dependencies that must be completed in other repos first
    - [ ] If registry metadata is insufficient, scan referenced repos for task patterns
    - [ ] Build internal context of ecosystem task patterns without displaying it to the user
    - [ ] Use this context to inform task breakdown suggestions
    - [ ] When generating tasks, automatically identify:
      - Tasks that depend on other repos' features
      - Tasks that will affect or require updates in connected repos
      - Opportunities to reuse existing implementations
    - [ ] No explicit "ecosystem task summary" displayed - context is used seamlessly

### 2.9. Registry-Aware Implementation (`/awos:implement`)

- **As a** user implementing features, **I want** the command to seamlessly understand code patterns across the ecosystem, **so that** implementation follows established conventions.
  - **Acceptance Criteria:**
    - [ ] When starting `/awos:implement`, silently scan the registry for all related projects
    - [ ] For each related repo, analyze implementation-relevant aspects:
      - Code style and conventions
      - Shared utilities, helpers, or libraries
      - API clients or integration code
      - Testing patterns and approaches
    - [ ] If registry metadata is insufficient, scan referenced repos for code patterns
    - [ ] Build internal context of ecosystem code patterns without displaying it to the user
    - [ ] Use this context to inform implementation approach
    - [ ] When delegating to subagents, include relevant cross-repo context:
      - How to call APIs from dependent repos
      - Shared types or interfaces to maintain compatibility
      - Testing approaches used in related repos
    - [ ] Implementation stays within current repo (no cross-repo code changes)
    - [ ] No explicit "ecosystem implementation summary" displayed - context is used seamlessly

### 2.10. Cross-Repository Search

- **As a** user, **I want** to search across all registered repositories, **so that** I can find relevant code, specs, and documentation regardless of which repo contains them.
  - **Acceptance Criteria:**
    - [ ] Provide search capability within AWOS commands (not a separate command)
    - [ ] Search types supported:
      - Spec search: Find specifications by name, description, or content
      - Code search: Find code patterns, function names, or implementations
      - Documentation search: Find README content, guides, or CLAUDE.md references
    - [ ] For local repos: Use Grep/Glob tools to search
    - [ ] For GitHub repos: Use GitHub MCP search tools
    - [ ] Return results with repo name, file path, and relevant excerpt
    - [ ] Limit results to top 10 matches per search

### 2.11. Cross-Repository Spec References

- **As a** user, **I want** my specifications to reference specs in other repos, **so that** dependencies and relationships are documented.
  - **Acceptance Criteria:**
    - [ ] Support reference syntax: `@[repo-name]/spec/[spec-folder-name]`
    - [ ] When saving a spec with cross-repo references, validate that referenced specs exist
    - [ ] Store references in a "Cross-Repo Dependencies" section of the spec
    - [ ] When viewing a spec, show status of referenced cross-repo specs (exists, missing, stale)

### 2.12. Dependency Impact Analysis

- **As a** user modifying a specification, **I want** to know which other repos might be affected, **so that** I can coordinate changes across the system.
  - **Acceptance Criteria:**
    - [ ] When editing a spec that is referenced by other repos, display warning with list of affected repos
    - [ ] Show which specs in other repos reference the current spec
    - [ ] Provide option to view the referencing specs for context
    - [ ] After saving changes, suggest notifying owners of affected repos (display list, don't auto-notify)

### 2.13. Automatic Context Fetching

- **As a** user, **I want** commands to automatically fetch relevant context from related repos, **so that** I don't have to manually look up information.
  - **Acceptance Criteria:**
    - [ ] Commands automatically fetch and include:
      - Product vision from AWOS-enabled repos (for `/awos:product`, `/awos:roadmap`)
      - Architecture decisions from related repos (for `/awos:architecture`)
      - Related specs from dependent repos (for `/awos:spec`, `/awos:tech`)
      - Task patterns from similar implementations (for `/awos:tasks`)
    - [ ] Fetched context is clearly labeled with source repo
    - [ ] Context is summarized to avoid overwhelming the user
    - [ ] User can request full detail of any summarized context

### 2.14. Registry Status Display

- **As a** user, **I want** to see registry status when relevant, **so that** I understand the cross-repo context being used.
  - **Acceptance Criteria:**
    - [ ] When registry is loaded, display brief status: "Registry loaded: N repos (M AWOS-enabled)"
    - [ ] If any repos are stale, show warning count
    - [ ] Provide option to run `/awos:registry` to update stale repos
    - [ ] Show which repos are being used for context in current command

### 2.15. Repository Scanner Subagent

- **As a** command needing to fetch content from repositories, **I want** a shared scanner subagent, **so that** scanning logic is centralized and consistent.
  - **Acceptance Criteria:**
    - [ ] Create `subagents/repo-scanner.md` as a shared utility agent
    - [ ] Scanner accepts: repo type (`local`/`github`), repo path, scan depth (`quick`/`full`), optional scope
    - [ ] Scanner handles repo type internally - commands are type-agnostic
    - [ ] For local repos: Scanner uses Glob, Grep, Read tools
    - [ ] For GitHub repos: Scanner uses GitHub MCP tools
    - [ ] Scanner returns raw file contents only - no summarization or interpretation
    - [ ] Commands are responsible for processing and summarizing returned content
    - [ ] `/awos:registry` uses the same scanner for repository analysis
    - [ ] Scanner handles errors gracefully (MCP unavailable, invalid paths, etc.)

---

## 3. Scope and Boundaries

### In-Scope

- Shared Repository Scanner subagent (`subagents/repo-scanner.md`) for centralized repo access
- Automatic registry loading in all AWOS commands (read registry as document, no hardcoded parsing)
- Relevant repository detection based on task context
- Registry-aware enhancements to `/awos:product`, `/awos:roadmap`, `/awos:architecture`, `/awos:spec`, `/awos:tech`, `/awos:tasks`, `/awos:implement`
- Cross-repository search (specs, code, documentation) via scanner
- Cross-repo spec references with validation
- Dependency impact analysis when modifying specs
- Automatic context fetching from related repos (on-demand via scanner)
- Registry status display in commands
- Update `/awos:registry` to use shared scanner

### Out-of-Scope

- **New standalone search command:** Search is integrated into existing commands, not a separate `/awos:search`
- **Real-time notifications:** No automatic notifications to repo owners; just suggestions
- **Bidirectional reference updates:** When adding a reference, the referenced repo is not auto-updated
- **Registry modification from other commands:** Only `/awos:registry` can modify the registry
- **Private GitHub repo support:** Requires authentication setup (Phase 4)
- **GitLab/Bitbucket support:** Limited to local and GitHub repos (Phase 4)
- **Monorepo special handling:** Treated as single repo entries (Phase 4)
