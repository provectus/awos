# Repository Registry

_This registry tracks related repositories for cross-project context. Other AWOS commands use this to find relevant specs and code across repos._

---

## [Repository Name]

[**What repository are we tracking?** Enter the name of the repository. This should match the repository's actual name on GitHub or your local filesystem.]

- **Type:** `local` | `github`
  - [**Where is this repo?** Choose `local` for repositories on your machine, or `github` for remote repositories.]
- **Path:** [relative or absolute path | owner/repo]
  - [**How do we locate it?** For local repos, provide a relative path from the current project (e.g., `../my-app`). Use absolute path only if relative doesn't work (e.g., `/Users/name/projects/my-app`). For GitHub repos, use the format `owner/repo` (e.g., `anthropic/awos`).]
- **Status:** `active` | `stale`
  - [**Is this repo actively maintained?** Mark as `active` if regularly updated, or `stale` if not recently touched or no longer accessible.]
- **Last Updated:** [YYYY-MM-DD HH:MM]
  - [**When was this entry last updated?** This helps identify outdated information.]
- **AWOS Enabled:** `yes` | `no`
  - [**Does this repo use AWOS?** Mark `yes` if it has a `context/` directory and `context/product`, `context/spec` directories with AWOS specs.]

### Summary

[**What does this repository do?** Provide a comprehensive 7-10 sentence description covering the repository's purpose, main functionality, target users, core problems it solves, and its role in the broader ecosystem. Include what makes it unique or valuable, the primary use cases, and any notable architectural or design decisions that define the project.]

_Example: A command-line tool designed to help AI agents create and maintain structured product specifications, roadmaps, and technical documentation for software projects. It provides a workflow-driven approach where agents can generate product definitions, break down features into roadmap items, and create detailed functional and technical specs. The tool is specifically built for AI-to-AI collaboration, enabling agents to understand project context across multiple related repositories. It solves the challenge of maintaining consistent, comprehensive documentation that evolves with the codebase. The system uses a structured template approach that ensures all critical information is captured in a predictable format. Primary users include AI development agents, engineering teams using AI-assisted workflows, and organizations maintaining multi-repository projects. The tool integrates with existing development workflows and can discover relationships between repositories automatically. It supports both local and remote GitHub repositories, making it flexible for various development environments._

### Tech Stack

[**What technologies does it use?** Detect and parse configuration files and dependencies to extract the primary languages, frameworks, and major dependencies. We don't need a complete list, just the most important and major ones. Standard or more general-purpose libraries can be ignored.]

- [Language/Framework 1]
- [Language/Framework 2]
- [Library/Tool 1]

_Example:_

- TypeScript
- Node.js
- Commander.js

### Tags

[**How would you categorize this repo?** Add 5-10 relevant tags for quick identification, filtering, and understanding the domain and purpose of the repository. Use lowercase-with-hyphens format.]

`tag1` `tag2` `tag3` `tag4` `tag5` `tag6` `tag7` `tag8` `tag9` `tag10`

_Example: `cli-tool` `documentation` `ai-agent` `product-management` `typescript` `workflow-automation` `spec-generation` `multi-repo` `developer-tools` `documentation-generator`_

### Key Features

[**What are the main capabilities?** List 3-10 of the most important features or functions this repository provides. Focus on user-facing capabilities and core functionality that defines the project.]

- [Feature 1]
- [Feature 2]
- [Feature 3]
- [Feature 4]
- [Feature 5]
- [Feature 6]

_Example:_

- Generate product definitions with vision, target audience, and success metrics
- Create phased product roadmaps from high-level requirements
- Auto-generate functional and technical specifications for features
- Discover and track relationships between related repositories
- Extract and index AWOS context from registered repositories
- Provide structured templates for consistent documentation
- Support both local and GitHub remote repositories
- Track repository status and update timestamps
- Auto-assign specialized agents based on tech stack
- Synchronize context across multi-repo projects

### Functionality & Documentation References

[**Where is the key information located?** List the main files, folders, or paths where important functionality, documentation, or configuration can be found. This helps users quickly locate relevant code or specs without extensive searching.]

- [**Path/File 1:**] [Brief description of what's there]
- [**Path/File 2:**] [Brief description of what's there]
- [**Path/File 3:**] [Brief description of what's there]

_Example:_

- **`src/commands/`:** All CLI command implementations
- **`templates/`:** Markdown templates for specs and documentation
- **`context/spec/`:** Functional and technical specifications for AWOS features
- **`context/product-definition.md`:** Core product vision and goals
- **`context/architecture.md`:** System architecture and technical decisions
- **`README.md`:** Getting started guide and usage examples
- **`agents/`:** Specialized agent definitions and configurations

### Relationships

[**How does this repo connect to others?** Document dependencies and how this repository interconnects with other registered repositories. Focus primarily on dependencies and direct relationships. The "Used by" field is optional and mainly useful when known. If `context/registry.md` exists, read it, parse all existing repository entries, and extract their names, paths, and package names for cross-referencing. Scan dependency files (typically found in package/lib management files) in the repository to better understand dependencies.]

- **Relation to current project:**
  [**How are the current project and this repository connected?** 5-10 sentences describing how the current project can be connected to, use, be used by, or depend on this repository. Describe potential use cases and scenarios when we will need to scan this repository to implement a new feature or get information.]
- **Depends on:** [list of other registered repos this depends on]
  - [**What does it need?** List repositories, services, or libraries this repo requires to function. Explain the nature of the dependency. For each dependency or reference found, check if it matches a registered repo's package name (from its package.json, pyproject.toml, etc.) or a registered repo's GitHub path (owner/repo) or a registered repo's local path and build list from matches.]
- **Used by:** [list of other registered repos that depend on this] _(optional)_
  - [**What needs it?** List repositories that depend on or integrate with this one, if known. When saving a new/updated entry, if it depends on repo X, read repo X's entry from the registry, add the current repo to repo X's "Used by" list (if not already there), and save the updated registry.]

_Example:_

- **Relation to current project:** Current project uses `anthropic/claude-code` and integrates to it. We need to analyze or scan this repo if we need some internals on how claude-code is working and what type of functionality it has.
- **Depends on:** `anthropic/claude-api` (for AI model access), `shared/ui-components` (for CLI interface elements)
- **Used by:** `acme/frontend-app` (uses generated specs for feature planning), `acme/admin-dashboard` (integrates documentation workflow)

### AWOS Context (if enabled)

[**What AWOS documentation exists?** This section is only filled if "AWOS Enabled" is `yes`. Extract key information from the repository's `context/` directory and track completion status.]

- **Product Vision:** [extracted from product-definition.md]
  - [**What is the product's core purpose?** Summarize the vision statement from the product definition.]
- **Current Phase:** [extracted from roadmap.md]
  - [**What phase is the project in?** Identify the current/active phase from the roadmap.]
- **Specs:** [list of specs in context/spec/]
  - [**What features are documented?** List functional and technical specs available with a 1-2 line description of what the feature is about.]
  - [**Include completion status:**] Mark each spec as `complete` or `incomplete`. If incomplete, note what's missing and the last scan time.

Use extracted info to fill other sections of this document as well.

_Example:_

- **Product Vision:** To empower AI agents to create production-ready documentation through structured workflows, enabling seamless collaboration across multi-repository projects.
- **Current Phase:** Phase 2 - Core Workflow Enhancement (focusing on multi-repo support and agent specialization)
- **Specs:**
  - `registry-command.md` - Repository discovery and tracking system for cross-project awareness _(complete)_
  - `auto-discovery.md` - Automatic relationship detection between repositories _(incomplete - missing technical implementation details, last scanned: 2025-12-05)_
  - `context-sync.md` - Cross-repo context synchronization for shared understanding _(complete)_
  - `agent-assignment.md` - Auto-assignment of specialized agents based on tech stack _(incomplete - missing testing strategy, last scanned: 2025-12-05)_

---

[**Add more repository entries below following the same format.**]
