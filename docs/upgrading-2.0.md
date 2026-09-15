# Upgrading to AWOS 2.0

AWOS 2.0 narrows the framework to its core method: agree on what to build, then build it. Three commands and their machinery are removed. Updating is the same command as always:

```sh
npx @provectusinc/awos
```

Migrations handle the rest. Nothing you wrote is deleted.

## What was removed, and what replaces it

| Removed               | Replacement                                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/awos:roadmap`       | Specs are anchored by an explicit topic: run `/awos:spec` and state what you want to build.                                                                                                                            |
| `/awos:hire`          | Agents come from your own setup (`.claude/agents/`, plugins). `/awos:tasks` surfaces a staffing gap as an open question when no agent covers a task; `/awos:implement` falls back to `general-purpose` and reports it. |
| `/awos:flow` (plugin) | Nothing — commands it already generated for you keep working (see below).                                                                                                                                              |
| Brownfield onboarding | Automatic: `/awos:architecture` always inspects the codebase; an existing stack becomes evidence-cited defaults you confirm in review.                                                                                 |

## What the update does to your project

| File                                                   | What happens                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `.awos/commands/{roadmap,hire}.md`                     | Replaced with a short removal notice — if you kept the wrappers, the commands respond by explaining what replaced them instead of failing. |
| `.awos/templates/{roadmap-template,agent-template}.md` | Deleted (framework internals).                                                                                                             |
| `.claude/commands/awos/{roadmap,hire}.md`              | Preserved — wrappers are yours. Running one shows the removal notice; delete the wrapper and its `.awos/commands/` counterpart when ready. |
| `context/product/roadmap.md`                           | Preserved and disowned: AWOS no longer reads or maintains it. Keep it, mine it for spec topics, or delete it.                              |
| `/implement-feature`, `/fix-bug`, `delivery-flow.md`   | Preserved and disowned — generated for you, they keep working, they're yours now.                                                          |
| `.mcp.json`                                            | The `awos-recruitment` server entry is removed (see below). Everything else in the file is untouched.                                      |
| Agents `/awos:hire` installed under `.claude/agents/`  | Preserved — yours to keep or delete.                                                                                                       |

## About `.mcp.json`

Pre-2.0 installs registered an `awos-recruitment` MCP server in your project's `.mcp.json` (creating the file if needed) — it powered `/awos:hire`. The 2.0 update removes exactly that one entry and nothing else. If it can't do so safely — the file is missing, isn't valid JSON, or the entry isn't there — it skips with a log line and leaves your file byte-for-byte as it was. Two caveats: a successful removal rewrites the file with 2-space indentation, and if the old installer created the file only for AWOS you'll be left with an empty `mcpServers` — safe to delete. After this one-time cleanup, AWOS never touches `.mcp.json` again.

## Version notes

- npm package: **2.0.0** (this release).
- awos plugin (`/awos:ai-readiness-audit`): **2.4.6** — a patch on its independent version line. Audit scoring is unchanged in this release; the version stamped in audit reports stays comparable with earlier 2.4.x audits.
