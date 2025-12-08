# Repository Registry

_This registry tracks related repositories for cross-project context. Other AWOS commands use this to find relevant specs and code across repos._

---

## Claude Code

- **Type:** `github`
- **Path:** `anthropics/claude-code`
- **Status:** `active`
- **Last Updated:** 2025-12-08 10:30
- **AWOS Enabled:** `no`

### Summary

Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps developers code faster through natural language commands. It executes routine tasks, explains complex code, and handles git workflows - all via conversational interactions. The tool can be used in terminals, IDEs, or by tagging @claude on GitHub for seamless integration into existing workflows. It features a comprehensive plugin system with 13 official plugins covering code review, feature development, security guidance, and workflow automation. Claude Code supports multiple installation methods including shell scripts, Homebrew, npm, and native desktop apps for cross-platform compatibility. The tool connects to Anthropic's Claude models including Opus 4.5, Sonnet 4, and Haiku 4.5 for AI-powered assistance. Primary users are developers who want to accelerate their coding workflows with AI assistance while maintaining control over their codebase. The project is actively maintained by Anthropic with frequent updates (currently at version 2.0.61).

### Tech Stack

- Node.js 18+
- TypeScript
- Shell scripts (installation)
- VS Code Extension API

### Tags

`cli-tool` `ai-assistant` `coding-tool` `terminal` `developer-tools` `anthropic` `claude` `agentic-ai` `vscode-extension` `mcp` `plugin-system`

### Key Features

- Natural language code understanding and generation
- Git workflow automation (commits, PRs, branch management)
- Plugin system with 13 official plugins (code-review, feature-dev, security-guidance, hookify, etc.)
- VS Code extension integration with native desktop app
- Multi-model support (Opus 4.5, Sonnet 4, Haiku 4.5)
- MCP (Model Context Protocol) server support
- Custom slash commands and skills
- Hook system for behavior interception and customization
- Agent SDK for building custom agents

### Functionality & Documentation References

- **`README.md`:** Installation guide and getting started documentation
- **`CHANGELOG.md`:** Detailed version history (v0.2.21 to v2.0.61)
- **`plugins/README.md`:** Complete plugin documentation with 13 official plugins
- **`.claude/commands/`:** Built-in slash commands (commit-push-pr, dedupe, oncall-triage)
- **`SECURITY.md`:** Security reporting and vulnerability disclosure

### Relationships

- **Relation to current project:** AWOS integrates with Claude Code as its execution environment. AWOS commands and prompts are designed to run within Claude Code, leveraging its slash command system, MCP servers, and agent capabilities. When implementing new AWOS features or troubleshooting command behavior, scanning this repo provides insight into Claude Code's plugin architecture, hook system, and available tools.
- **Depends on:** None detected in registry
- **Used by:** `anthropics/claude-plugins-official` (plugin marketplace depends on Claude Code runtime)

---

## Claude Plugins Official

- **Type:** `github`
- **Path:** `anthropics/claude-plugins-official`
- **Status:** `active`
- **Last Updated:** 2025-12-07 19:15
- **AWOS Enabled:** `no`

### Summary

Claude Plugins Official is a curated directory of high-quality plugins for Claude Code, serving as the official marketplace for extensions developed by Anthropic and third-party partners. The repository organizes plugins into two main categories: internal plugins developed and maintained by Anthropic, and external plugins from partners and the community. It provides a standardized plugin structure that developers can follow to create custom slash commands, specialized agents, skills, hooks, and MCP server integrations. The marketplace.json file defines all available plugins with metadata including descriptions, authors, categories, and sources. Users can install plugins directly via Claude Code's plugin system using `/plugin install {plugin-name}@claude-plugin-directory` or by browsing through `/plugin > Discover`. The repository includes comprehensive examples and documentation for plugin development, making it the authoritative source for extending Claude Code functionality.

### Tech Stack

- Markdown (plugin definitions)
- JSON (plugin.json, marketplace.json, .mcp.json)
- Model Context Protocol (MCP)

### Tags

`plugins` `marketplace` `claude-code` `extensions` `mcp` `slash-commands` `agents` `skills` `hooks` `anthropic`

### Key Features

- 13 internal Anthropic plugins (agent-sdk-dev, code-review, commit-commands, feature-dev, security-guidance, hookify, plugin-dev, etc.)
- 17 external partner plugins (GitHub, Slack, Notion, Linear, Figma, Supabase, Firebase, Vercel, Sentry, etc.)
- Standardized plugin structure with .claude-plugin/plugin.json metadata
- Support for commands, agents, skills, hooks, and MCP servers
- Example plugin with comprehensive documentation for developers
- Marketplace discovery via `/plugin > Discover`
- Direct installation via `/plugin install` command
- Categories: development, productivity, security, learning, testing, database, design, deployment, monitoring

### Functionality & Documentation References

- **`README.md`:** Installation guide and contributing instructions
- **`.claude-plugin/marketplace.json`:** Complete plugin registry with metadata for all 30 plugins
- **`plugins/`:** 13 internal Anthropic-developed plugins
- **`external_plugins/`:** 17 third-party partner plugins
- **`plugins/example-plugin/`:** Reference implementation showing plugin structure (commands, skills, MCP)

### Relationships

- **Relation to current project:** AWOS could potentially be distributed as a plugin through this marketplace. When developing new AWOS features that leverage Claude Code's plugin system (commands, agents, skills, hooks), scanning this repository provides reference implementations and best practices. The example-plugin and plugin-dev plugins are particularly useful for understanding plugin structure and validation.
- **Depends on:** `anthropics/claude-code` (the plugin host and runtime environment)
- **Used by:** _(none currently registered)_

---
