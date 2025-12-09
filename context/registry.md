# Repository Registry

_This registry tracks related repositories for cross-project context. Other AWOS commands use this to find relevant specs and code across repos._

---

## Claude Code

- **Type:** `github`
- **Path:** `anthropics/claude-code`
- **Status:** `active`
- **Last Updated:** 2025-12-09 11:45
- **AWOS Enabled:** `no`

### Summary

Claude Code is Anthropic's official command-line coding assistant that transforms how developers interact with their codebases. It is a Node.js-based terminal application that enables developers to work with code using natural language instructions, eliminating the need for manual command execution and boilerplate code writing. The tool understands project context through intelligent codebase scanning and provides real-time assistance for common development tasks including code generation, refactoring, debugging, and git workflow automation. What makes Claude Code unique is its deep integration with Anthropic Claude AI models (supporting Opus 4.5, Sonnet 4, and Haiku 4.5), allowing context-aware suggestions and autonomous code execution with proper permission handling. The tool serves multiple use cases including rapid prototyping, code review, feature development, and documentation generation. Primary architectural decisions include a plugin system for extensibility (14+ official plugins), MCP (Model Context Protocol) server support for tool integration, a robust permissions system with granular control, and support for multiple model providers (Anthropic, Bedrock, Vertex AI, LiteLLM). The project is actively maintained with version 2.0.62 as the latest release.

### Tech Stack

- Node.js 18+
- TypeScript
- Python SDK (claude-code-sdk)
- VS Code Extension API
- MCP (Model Context Protocol)
- ripgrep (code searching)
- OpenTelemetry (observability)

### Tags

`ai-coding-assistant` `terminal-tool` `claude-integration` `code-generation` `git-automation` `plugin-system` `mcp-server` `developer-tools` `natural-language-interface` `vscode-extension`

### Key Features

- Natural language code execution through conversational prompts
- Intelligent codebase understanding with project context awareness
- Code generation, refactoring, and debugging capabilities
- Git workflow automation (commits, PRs, branch management, code review)
- Multi-model support (Opus 4.5, Sonnet 4, Haiku 4.5)
- Plugin system with 14+ official plugins (code-review, feature-dev, security-guidance, hookify, etc.)
- Native VS Code extension with streaming support and IDE diffing
- Granular permission management and security controls
- Web search integration for real-time information
- Session management with conversation history and resume capability

### Functionality & Documentation References

- **`README.md`:** Installation guide, overview, and data usage policies
- **`CHANGELOG.md`:** Comprehensive version history (v0.2.21 to v2.0.62)
- **`plugins/`:** 14+ official plugins (agent-sdk-dev, code-review, commit-commands, feature-dev, frontend-design, plugin-dev, pr-review-toolkit, security-guidance, hookify, etc.)
- **`plugins/README.md`:** Complete plugin documentation and structure guide
- **`examples/hooks/`:** Hook implementation examples
- **`.claude/commands/`:** Custom slash command definitions
- **`SECURITY.md`:** Security reporting and vulnerability disclosure (HackerOne)

### Relationships

- **Relation to current project:** AWOS integrates with Claude Code as its execution environment. AWOS commands and prompts are designed to run within Claude Code, leveraging its slash command system, MCP servers, and agent capabilities. When implementing new AWOS features or troubleshooting command behavior, scanning this repo provides insight into Claude Code's plugin architecture, hook system, available tools, and permission model. The plugin ecosystem (particularly plugin-dev) offers reference implementations for extending Claude Code functionality.
- **Depends on:** Anthropic Claude API (model access), AWS Bedrock (optional), Google Vertex AI (optional), ripgrep (code search)
- **Used by:** `anthropics/claude-plugins-official` (plugin marketplace depends on Claude Code runtime)

---

## Claude Plugins Official

- **Type:** `github`
- **Path:** `anthropics/claude-plugins-official`
- **Status:** `active`
- **Last Updated:** 2025-12-09 12:00
- **AWOS Enabled:** `no`

### Summary

Claude Plugins Official is the official marketplace and reference directory for Claude Code plugins—AI-powered extensions that enhance Claude Code with development tools, productivity workflows, and integrations with external services. The repository serves as the central hub for the Claude Code plugin ecosystem, acting as an official marketplace discoverable via Claude Code's `/plugin > Discover` interface, a reference implementation with example plugins and development patterns, and a standards body establishing plugin structure, manifest format, and conventions. It contains 27+ vetted plugins (13 internal Anthropic-developed, 14+ external third-party), addressing the need for a single source of truth for Claude Code extensions and standardized patterns for tool integration. Target users include Claude Code users seeking to extend IDE capabilities, plugin developers building extensions, and enterprise teams integrating development tools. What makes it unique is its mixed internal/external plugin collection, developer-focused plugin-dev toolkit for creating new plugins, and specialized multi-agent architectures in plugins like feature-dev and code-review. Primary use cases span AI-assisted development, workflow automation, team collaboration integrations, learning modes, and infrastructure deployment.

### Tech Stack

- Markdown (plugin documentation, skill definitions, command definitions with YAML frontmatter)
- JSON (plugin.json manifests, marketplace.json registry, .mcp.json configuration)
- YAML (frontmatter metadata)
- Model Context Protocol (MCP) with stdio, SSE, HTTP, WebSocket transports
- Bash (hook implementations and utility scripts)

### Tags

`plugin-marketplace` `claude-code-extensions` `ai-development-tools` `workflow-automation` `code-review` `mcp-integration` `plugin-development` `developer-productivity` `sdk-reference` `multi-agent`

### Key Features

- Official Plugin Marketplace with 27+ vetted plugins discoverable and installable via `/plugin install {plugin-name}@claude-plugin-directory`
- Multi-Agent Development Workflows - feature-dev, code-review, and pr-review-toolkit orchestrate 2-4 specialized agents
- Comprehensive MCP Integration Framework supporting stdio, SSE, HTTP, and WebSocket transports
- Plugin Development Toolkit (plugin-dev) with 7 specialized skills and 8-phase plugin creation workflow
- Security & Compliance Automation with real-time warnings and confidence-based false positive filtering
- Interactive Learning Modes (learning-output-style, explanatory-output-style) for educational insights
- Hook-based Automation System for PreToolUse, PostToolUse, SessionStart/End, Stop events
- Standardized Plugin Structure with auto-discoverable components (commands, agents, skills, hooks, MCP servers)
- Third-Party Ecosystem with 14+ curated external plugins (Figma, Atlassian, Greptile, Serena, Playwright, etc.)
- Marketplace Registry System via centralized `.claude-plugin/marketplace.json`

### Functionality & Documentation References

- **`.claude-plugin/marketplace.json`:** Complete plugin directory with metadata, source paths, categories, authors for all 27+ plugins
- **`plugins/example-plugin/`:** Reference implementation showing standard plugin structure with commands, skills, hooks, MCP config
- **`plugins/feature-dev/README.md`:** 7-phase structured feature development workflow with 3 specialized agents
- **`plugins/code-review/README.md`:** Automated PR review using 4 parallel agents with confidence-based filtering
- **`plugins/plugin-dev/README.md`:** 8-phase plugin creation workflow with 7 skills (hooks, MCP, structure, settings, commands, agents, skills)
- **`plugins/security-guidance/`:** Real-time security warnings for command injection, XSS, unsafe patterns
- **`plugins/`:** 13 internal Anthropic plugins (agent-sdk-dev, code-review, commit-commands, feature-dev, frontend-design, hookify, etc.)
- **`external_plugins/`:** 14+ third-party integrations (GitHub, GitLab, Slack, Notion, Asana, Linear, Firebase, Supabase, Figma, Vercel, Sentry, Playwright)
- **`README.md`:** High-level marketplace overview, installation instructions, plugin development guidelines

### Relationships

- **Relation to current project:** AWOS could potentially be distributed as a plugin through this marketplace. When developing new AWOS features that leverage Claude Code's plugin system (commands, agents, skills, hooks), scanning this repository provides reference implementations, best practices, and standardized patterns. The plugin-dev plugin is particularly useful for understanding plugin structure, validation, and the 8-phase creation workflow. Feature-dev and code-review plugins demonstrate multi-agent orchestration patterns that could inform AWOS's own agent delegation architecture.
- **Depends on:** `anthropics/claude-code` (the plugin host and runtime environment), Model Context Protocol (MCP) specification
- **Used by:** _(none currently registered)_

---
