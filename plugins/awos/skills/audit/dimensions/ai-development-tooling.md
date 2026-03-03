---
name: ai-development-tooling
title: AI Development Tooling
description: Checks AI-agent infrastructure — CLAUDE.md quality, agent configs, skills, MCP servers, hooks, and commands
severity: high
depends-on: [project-topology]
---

# AI Development Tooling

Audits whether the project is properly configured for AI-assisted development. Well-configured AI tooling means agents (Claude Code, Cursor, etc.) can navigate the codebase, follow conventions, and produce higher-quality output.

Uses the topology artifact to know which layers and service directories exist.

## Checks

### AI-01: Root CLAUDE.md exists and is actionable

- **What:** The repository root has a CLAUDE.md with non-obvious project context for AI agents
- **How:** Read `CLAUDE.md` at the repo root. Check that it contains: what the project is (1-2 sentences), key commands (build/test/lint/dev), and non-obvious conventions or constraints that an agent cannot discover from code alone. It should NOT contain content discoverable from source files — no directory tree listings, no file inventories, no linter rules that are already in config files, no export listings.
- **Pass:** Root CLAUDE.md exists with concise, non-obvious instructions (purpose, commands, undiscoverable conventions)
- **Warn:** Root CLAUDE.md exists but contains significant discoverable content (directory trees, file listings, linter rules already in configs)
- **Fail:** No root CLAUDE.md found
- **Severity:** critical

### AI-02: Service-level CLAUDE.md files exist

- **What:** Each major service/layer has a short CLAUDE.md stating its purpose and non-obvious context
- **How:** Read the topology artifact to get the list of service directories. For each, check for a CLAUDE.md. It should contain: what this module is for (1-2 sentences) and any non-obvious behaviors, gotchas, or constraints. It should NOT duplicate the root CLAUDE.md, list files, or describe things discoverable from code (types, exports, directory structure).
- **Pass:** Every detected service directory has a CLAUDE.md with purpose + non-obvious context (typically 1-10 lines)
- **Warn:** Some service directories have CLAUDE.md, others don't
- **Fail:** No service-level CLAUDE.md files found
- **Skip-When:** Topology artifact shows single-service repo with no subdirectories
- **Severity:** high

### AI-03: Custom slash commands exist

- **What:** The project defines custom slash commands for common workflows
- **How:** Glob for `.claude/commands/*.md` and `.claude/commands/**/*.md`. Check that at least 2 commands exist beyond defaults.
- **Pass:** 3+ custom commands defined
- **Warn:** 1-2 custom commands defined
- **Fail:** No custom commands found
- **Severity:** medium

### AI-04: Skills are configured

- **What:** The project uses Claude Code skills for specialized workflows
- **How:** Glob for `.claude/skills/*/SKILL.md`. Check that at least one skill is defined with valid frontmatter.
- **Pass:** 1+ skills configured with valid SKILL.md
- **Fail:** No skills found
- **Severity:** low

### AI-05: MCP servers configured

- **What:** The project configures MCP (Model Context Protocol) servers for extended tool access
- **How:** Check for `.mcp.json` or `.claude/mcp.json` at the repo root. Verify it defines at least one server.
- **Pass:** MCP configuration exists with 1+ servers defined
- **Fail:** No MCP configuration found
- **Severity:** low

### AI-06: Hooks are configured

- **What:** The project uses Claude Code hooks for automated guardrails or workflows
- **How:** Check for `.claude/settings.json` and look for `hooks` configuration. Also check for hook-related entries in any plugin configs.
- **Pass:** Hooks configured (pre-tool, post-tool, or session hooks)
- **Fail:** No hooks configured
- **Severity:** low

### AI-07: AI workflow documentation

- **What:** The project documents how to use AI tools effectively within the codebase
- **How:** Check CLAUDE.md files for sections about workflow (AWOS, spec-driven, etc.) or AI-specific conventions. Also check for `.claude/` directory structure documentation.
- **Pass:** CLAUDE.md explicitly documents AI-assisted workflow with steps
- **Warn:** CLAUDE.md mentions AI tools but without clear workflow guidance
- **Fail:** No AI workflow documentation found
- **Severity:** medium

### AI-08: CLAUDE.md files are not bloated with discoverable content

- **What:** CLAUDE.md files contain only non-obvious context that agents cannot discover from code
- **How:** Read all CLAUDE.md files found in the repo. Flag any that contain content an agent can discover on its own:
  - Directory tree listings (`├──`, `└──`, or markdown-formatted file trees)
  - File inventories ("this directory contains X, Y, Z files")
  - Export listings ("this module exports: ...")
  - Type/interface definitions copied from source
  - Linter or formatter rules already present in config files
  - Prop tables or API signatures that exist in the code
  Also check line count: a CLAUDE.md over 30 lines likely contains discoverable content.
- **Pass:** All CLAUDE.md files contain only purpose + non-obvious context, each under 30 lines
- **Warn:** Some CLAUDE.md files contain minor discoverable content (1-2 instances) or are 30-50 lines
- **Fail:** CLAUDE.md files contain extensive discoverable content (file trees, export lists, type definitions) or exceed 50 lines
- **Severity:** high
