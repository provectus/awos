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

### AI-01: CLAUDE.md ecosystem provides adequate AI context

- **What:** The combined CLAUDE.md files give AI agents sufficient non-obvious context to work effectively in this project
- **How:**
  1. Discover all CLAUDE.md files in the repo: root `CLAUDE.md`, service-level `*/CLAUDE.md`, and `.claude/rules/*.md`
  2. Read all discovered files and assess whether the **combined ecosystem** covers:
     - Project purpose (what is this project?)
     - Key commands (build, test, lint, dev)
     - Non-obvious conventions and constraints that agents can't discover from code
     - Cross-service concerns (git workflow, CI, shared patterns)
     - Module-specific context for complex services (purpose, gotchas, non-obvious behavior)
  3. Coverage can come from **any level** — a small project with one excellent root CLAUDE.md is fine. A monorepo with thin root + thorough service-level files is also fine. Evaluate the total context, not individual files.
  4. For multi-service repos: complex modules (non-obvious behavior, gotchas) need context somewhere in the ecosystem. Simple/self-evident modules with clear naming and standard patterns don't require dedicated CLAUDE.md files.
- **Pass:** Ecosystem covers all essential context — project purpose, key commands, conventions, and complex modules all have context somewhere across the files
- **Warn:** Minor gaps — e.g., one non-critical module lacks context, or conventions section is thin. The fundamentals (project purpose, key commands) are present and an agent can still work effectively with minor blind spots.
- **Fail:** Fundamental context is missing — no project purpose anywhere in the ecosystem, OR no key commands documented, OR multiple complex modules completely lack context, OR no CLAUDE.md files exist at all. An agent would not understand what the project is or how to work in it.
- **Severity:** critical

### AI-02: Custom slash commands exist

- **What:** The project defines custom slash commands for common workflows
- **How:** Glob for `.claude/commands/*.md` and `.claude/commands/**/*.md`. Check that at least 2 commands exist beyond defaults.
- **Pass:** 3+ custom commands defined
- **Warn:** 1-2 custom commands defined
- **Fail:** No custom commands found
- **Severity:** medium

### AI-03: Skills are configured

- **What:** The project uses Claude Code skills for specialized workflows
- **How:** Glob for `.claude/skills/*/SKILL.md`. Check that at least one skill is defined with valid frontmatter.
- **Pass:** 1+ skills configured with valid SKILL.md
- **Fail:** No skills found
- **Severity:** low

### AI-04: MCP servers configured

- **What:** The project configures MCP (Model Context Protocol) servers for extended tool access
- **How:**
  1. Check for `.mcp.json` or `.claude/mcp.json` at the repo root. Verify it defines at least one server.
  2. If no MCP configuration found, check `.claude/settings.json` for `enabledPlugins` with at least one plugin set to `true` — plugins may provide MCP servers but this cannot be verified from project files alone.
- **Pass:** MCP configuration exists with 1+ servers defined
- **Warn:** No direct MCP configuration found, but `enabledPlugins` in `.claude/settings.json` includes enabled plugins that may provide MCP servers
- **Fail:** No MCP configuration and no enabled plugins found
- **Severity:** low

### AI-05: Hooks are configured

- **What:** The project uses Claude Code hooks for automated guardrails or workflows
- **How:** Check for `.claude/settings.json` and look for `hooks` configuration. Also check for hook-related entries in any plugin configs.
- **Pass:** Hooks configured (pre-tool, post-tool, or session hooks)
- **Fail:** No hooks configured
- **Severity:** low

### AI-06: CLAUDE.md files are meaningful and well-structured

- **What:** Every CLAUDE.md file contains high-quality, non-obvious content that actually helps AI agents
- **How:** Read all CLAUDE.md files found in the repo. For each file, evaluate quality using the key test: *"Would removing this line cause Claude to make mistakes?"*
  1. **Flag bad content** — things an agent can discover on its own or that add no value:
     - Directory tree listings (`├──`, `└──`, or markdown-formatted file trees)
     - File inventories ("this directory contains X, Y, Z files")
     - Export listings, type/interface definitions copied from source
     - Linter or formatter rules already present in config files
     - Vague guidance ("write clean code", "follow best practices")
     - Tutorial-style prose or lengthy explanations
  2. **Check structure** — should use markdown headers and bullet points, be concrete and specific (e.g., "use 2-space indentation" not "format code properly")
  3. **Check length** — each file should be under 200 lines (official guideline — longer files reduce Claude's adherence to instructions)
  4. **Check duplication** — service-level files should not repeat content already in root CLAUDE.md
  This check only evaluates files that exist — it does not penalize absence (that's AI-01's job).
- **Pass:** All CLAUDE.md files contain meaningful, non-obvious, well-structured content under 200 lines each
- **Warn:** Some files have quality issues (minor discoverable content, some vague sections, slightly over 200 lines, or some duplication between levels)
- **Fail:** CLAUDE.md files contain extensive discoverable content, are heavily bloated (300+ lines), or consist mostly of vague/useless content
- **Skip-When:** No CLAUDE.md files exist in the repo (nothing to evaluate quality of)
- **Severity:** high

### AI-07: Agent can run and observe the application

- **What:** Claude Code has the tools to run the application and observe results, enabling it to verify its own changes without human involvement
- **How:**
  1. Read the topology summary to determine what types of applications/services the repo contains (web UI, API server, CLI tool, library, serverless functions, infrastructure-as-code, mobile app, etc.)
  2. For each detected application type, check whether the agent has the necessary observation tools:
     - **Web UI**: Check if a browser MCP is configured (Puppeteer, Playwright, or similar in `.mcp.json`). Without it, the agent can start a dev server but cannot see or interact with the result.
     - **API/server**: Built-in capability — agent can start the server and use Bash (`curl`, `wget`) to verify endpoints. No additional tooling needed.
     - **CLI tool / library**: Built-in capability — agent can run commands and import/test directly.
     - **Serverless functions**: Check for local invoke tooling (SAM CLI, serverless-offline, LocalStack) or a documented workaround in CLAUDE.md/README.
     - **Infrastructure-as-code**: Check for dry-run capability (`terraform plan`, `cdk diff`, `pulumi preview`) available locally.
     - **Mobile app**: Usually cannot run locally — check for simulator/emulator instructions or a documented alternative.
  3. If the setup is non-standard and cannot be inferred from standard tooling files, check that run instructions exist in CLAUDE.md or README.
- **Pass:** Agent has the tools to run and observe all detected application types, or workarounds are documented
- **Warn:** Agent can run and observe the primary application type, but some secondary parts of the system lack run/observe capability (e.g., main API is verifiable but an infra module can only be dry-run, or a small admin UI has no browser MCP)
- **Fail:** Agent cannot run or observe the primary application type — the core of the system is unverifiable (e.g., web-only project with no browser MCP, or no way to run the main service at all)
- **Severity:** critical
