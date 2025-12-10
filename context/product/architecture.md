# System Architecture Overview: AWOS

---

## 1. Framework Runtime & Execution Environment

- **Runtime Host:** Claude Code CLI - all AWOS commands execute within Claude Code's agent environment
- **Installer Runtime:** Node.js 22+ - lightweight installer that copies framework files to user projects
- **Command Format:** Markdown-based prompt files with YAML frontmatter - human-readable, version-controllable
- **State Management:** Document-driven - all project state lives in markdown files in `context/` directory

---

## 2. File System & Directory Structure

- **Framework Core (`.awos/`):** Always-overwritten framework internals (commands, templates, subagents, scripts)
- **User Customization (`.claude/`):** Protected user modifications (command wrappers, agent configurations)
- **Project Context (`context/`):** Specification storage (product definition, roadmap, architecture, feature specs)
- **Registry Storage (`context/registry.md`):** _(Phase 2)_ Multi-repo metadata and cross-references

---

## 3. Command & Agent System

- **Primary Commands:** 7 sequential workflow commands (product → roadmap → architecture → spec → tech → tasks → implement)
- **Registry Command:** _(Phase 2)_ `/awos:registry` for multi-repo management
- **Domain Expert Subagents:** Specialized agents delegated by `/awos:implement` (React, Python, Kotlin)
- **Command Pattern:** ROLE → TASK → INPUTS/OUTPUTS → PROCESS structure

---

## 4. External Integrations & MCP

- **Local Repository Access:** Native CLI commands (ls, grep, find, git) - no MCP required
- **GitHub Repository Access:** _(Phase 2)_ Official GitHub MCP server (`@modelcontextprotocol/server-github`)
- **MCP Detection:** _(Phase 2)_ Runtime check for GitHub MCP availability with guided installation
- **Fallback Strategy:** Local repos always work; GitHub repos require MCP

---

## 5. Installation & Update System

- **Package Distribution:** npm (`@provectusinc/awos`) via `npx` command
- **Overwrite Strategy:** `.awos/` always updated, `.claude/` preserved (unless `--force-overwrite`)
- **Migration System:** JSON-based migrations for safe structural updates between versions
- **Version Tracking:** `.awos/.migration-version` tracks applied migrations
