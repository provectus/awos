# /awos:hire

> Hires specialist agents — finds, installs skills, MCPs, agents, and hooks from [registry](https://github.com/provectus/awos-recruitment), generates agent files.

## What it does

This command analyzes your tech stack, discovers available specialist agents and skills from the [awos registry](https://github.com/provectus/awos-recruitment), installs them, and generates agent configuration files. It bridges the gap between your architecture decisions and the specialist agents needed to execute them. Output:

- New or updated agent files in `.claude/agents/`
- Installed skills in `.claude/skills/`
- Configured MCP servers in `.mcp.json`
- Installed hook entries in `.claude/settings.json` (script payloads in `.claude/hooks/`)

## Prerequisites

- `context/product/architecture.md` must exist. Run `/awos:architecture` first.

Optionally reads the latest `technical-considerations.md` for additional technology context.

## How it works

1. **Extracts technologies** from your architecture (and tech spec, if available) — every framework, language, database, and cloud service.
2. **Groups into domains** — Frontend, Backend, Database, Infrastructure, Testing, Documentation.
3. **Maps to agent roles** — proposes a specialist agent for each domain (e.g., `react-frontend`, `python-backend`).
4. **Checks what exists** — scans your current agents and skills to classify coverage as Covered, Partially Covered, or Missing.
5. **Searches the registry** — queries the `awos-recruitment` MCP server for skills, MCPs, and pre-built agents matching your gaps, plus hook searches phrased as short problem statements (e.g. "keep documentation updated before committing"), one guardrail intent per query — searched regardless of agent coverage.
6. **Installs components** — runs installation commands for confirmed skills, MCPs, agents, and hooks. Hooks are shown with their trigger event and the command they run before you confirm — and they only ever come from the registry; the command never authors hook commands itself.
7. **Generates agent files** — for any remaining gaps, creates agent files from the template with proper configuration.
8. **Reports gaps** — warns about technologies that couldn't be covered by [registry](https://github.com/provectus/awos-recruitment) components and suggests creating custom skills.

## Common misconceptions

- **"This writes my application code."** No. It sets up the specialist agents that will later write code when you run `/awos:implement`.
- **"I only need to run this once."** Run it again after `/awos:tech` if your technical spec introduces new technologies not covered by your current agents.
- **"It replaces manual agent configuration."** It automates what it can, but warns about gaps. You may still need to create custom skills for project-specific patterns.
- **"It will write custom hooks for my project."** No. Hooks are installed from the registry as-is. If the registry has no hook for your need, none is installed — author it yourself in `.claude/settings.json`.

## Example usage

```bash
# Good — let it analyze your architecture automatically:
> /awos:hire

# Good — focus on specific technologies:
> /awos:hire cover need OAuth2, JWT, Redis session management

# Good — after /awos:tech flags new capabilities:
> /awos:hire cover 002-file-upload: need AWS S3, image processing
```

## What happens next

You're ready to start the feature cycle. Run `/awos:spec` to create a functional specification for your next feature.
