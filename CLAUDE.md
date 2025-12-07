# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important: Do NOT Run the Installer

**Never run `npx @provectusinc/awos` when contributing to this repository.** That command is for end users setting up AWOS in their own projects.

## What This Repository Is

AWOS (Agentic Workflow Operating System) is a framework for spec-driven development using AI agents. It consists of:

1. **An Installer** (`src/`) - Node.js CLI that copies framework files to user projects
2. **AI Agent Prompts** (`commands/`, `subagents/`) - Markdown files that define agent behaviors
3. **Document Templates** (`templates/`) - Structured templates for specifications and planning

## Repository Structure

```
awos/
├── index.js              # Entry point (delegates to src/)
├── src/                  # Installer source code (Node.js)
│   ├── config/           # Setup configuration and constants
│   ├── core/             # Main orchestration logic
│   ├── services/         # File copying and directory creation
│   ├── migrations/       # Version migration system
│   └── utils/            # Logging and pattern matching
├── commands/             # AWOS command prompts (→ .awos/commands/)
├── templates/            # Document templates (→ .awos/templates/)
├── subagents/            # Specialized coding agent prompts (→ .awos/subagents/)
├── claude/               # User customization layer (→ .claude/)
└── context/              # Created in user projects for specs
```

## Testing Changes

Test in a separate project directory:

```bash
# Create/navigate to test project
cd ~/my-test-project

# Run installer from local clone
npx /path/to/awos/index.js

# Test with force overwrite
npx /path/to/awos/index.js --force-overwrite

# Preview changes without applying
npx /path/to/awos/index.js --dry-run
```

## Key Architecture Concepts

### File Copy Behavior

Defined in `src/config/setup-config.js`:
- `.awos/` files: Always overwritten (framework internals)
- `.claude/` files: Only overwritten with `--force-overwrite` (user customizations)

### Migration System

For restructuring files in existing installations:
- Migration files: `src/migrations/NNN-description.json`
- Preconditions: `require_any`, `require_all`, `skip_if_any`, `error_if_any`
- Operations: `move`, `copy`, `delete`
- Version tracked in: `.awos/.migration-version`

### Command Workflow Pattern

Each command prompt follows: ROLE → TASK → INPUTS/OUTPUTS → PROCESS

Sequential workflow: `/awos:product` → `/awos:roadmap` → `/awos:architecture` → `/awos:spec` → `/awos:tech` → `/awos:tasks` → `/awos:implement`

### Agent Delegation Rule

The `/awos:implement` command delegates to subagents - it never writes code directly.

## Code Formatting

```bash
npx prettier --write .
```
