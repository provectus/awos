# AWOS: Agentic Workflow Operating System

This is a framework for spec-driven development using AI agents. It provides structured workflows that guide users from product vision to implementation through a series of specialized AI commands.

## Architecture Overview

**Core Components:**
- **Installer (`index.js`)**: NPM package that copies workflow templates and commands to user projects
- **Commands (`/commands/*.md`)**: AI agent prompts that guide users through development stages
- **Templates (`/templates/*.md`)**: Structured document templates for specifications and planning
- **Subagents (`/subagents/*.md`)**: Specialized coding agents for implementation tasks

**Installation Flow:**
```
npx @provectusinc/awos
├── Creates `.claude/commands/awos/` (copies all commands/*.md files)
├── Creates `.claude/agents/` (copies subagents/*.md files)
├── Creates `.awos/templates/` (copies templates/*.md files)
└── Creates `.awos/scripts/` (copies scripts/*.sh files)
```

## Document-Driven State Management

AWOS uses a **document-centric approach** where all project state lives in structured markdown files, making the system **idempotent**. AI agents can restore full context from files alone, regardless of chat history.

**Key Document Types:**
- `context/product/product-definition.md` - Business vision and requirements
- `context/roadmap/roadmap.md` - Feature prioritization and planning
- `context/architecture/architecture.md` - Technical blueprint and decisions
- `context/spec/[feature]/functional-spec.md` - Feature requirements (what/why)
- `context/spec/[feature]/technical-considerations.md` - Implementation plan (how)
- `context/spec/[feature]/tasks.md` - Checklist of implementable tasks

## Command Workflow Pattern

Each command follows a consistent structure:
1. **ROLE** - Defines the AI agent's persona and expertise
2. **TASK** - Specific responsibility and outputs
3. **INPUTS/OUTPUTS** - Expected files and data flow
4. **PROCESS** - Step-by-step execution logic

**Sequential Workflow:**
```
/awos:product → /awos:roadmap → /awos:architecture →
/awos:spec → /awos:tech → /awos:tasks → /awos:implement
```

## Agent Delegation Pattern

The `/awos:implement` command acts as an **engineering manager** that:
- Reads task lists from `context/spec/[feature]/tasks.md`
- Loads full context from functional specs and technical considerations
- **Delegates** actual coding to specialized subagents (never writes code itself)
- Tracks progress by updating task checkboxes

**Critical Rule:** Implementation agents MUST delegate to subagents rather than writing code directly.

## Development Conventions

**File Structure:**
- All AWOS workflow files use `.md` format for AI readability
- Commands are executable prompts stored as markdown files
- Templates contain placeholder sections marked with `[brackets]`
- Each spec gets its own directory under `context/spec/`

**Template Population:**
- Commands guide users through interactive sessions to populate templates
- Support both "Creation Mode" (new documents) and "Update Mode" (existing documents)
- Generate both full documents and `-lite.md` summary versions

**Task Granularity:**
- Each task in `tasks.md` must be **runnable and testable**
- Application should remain functional after each completed task
- Tasks are atomic units that produce intermediate, visible results

## Key Implementation Notes

- The main entry point is `index.js` with shebang for CLI execution
- Package is published as `@provectusinc/awos` with binary configuration
- Uses Node.js built-in modules (no external dependencies)
- Copies files only if they don't exist (never overwrites user customizations)
- Subagents are specialized for specific technologies (React, Python, etc.)

When working with this codebase, remember that you're building **AI agent orchestration framework**, not end-user applications. Focus on clear prompt engineering, structured document templates, and maintainable command workflows.
