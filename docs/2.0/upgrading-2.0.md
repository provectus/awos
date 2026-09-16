# Upgrading to AWOS 2.0

AWOS 2.0 narrows the framework to its core method: agree on what to build, then build it. Three commands leave the framework — but nothing in your project is deleted or rewritten: local copies you already have are disowned in place and keep working. Updating is the same command as always:

```sh
npx @provectusinc/awos
```

Migrations handle the rest.

## What left the framework, and what replaces it

| Removed               | Replacement                                                                                                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/awos:roadmap`       | Specs are anchored by an explicit topic: run `/awos:spec` and state what you want to build. A local copy of the command keeps working if you have one, and while `context/product/roadmap.md` exists, the spec topic question offers its incomplete items as candidates.   |
| `/awos:hire`          | Agents come from your own setup (`.claude/agents/`, plugins). `/awos:tasks` surfaces a staffing gap as an open question when no agent covers a task; `/awos:implement` falls back to `general-purpose` and reports it. A local copy of hire keeps working if you have one. |
| `/awos:flow` (plugin) | Nothing — commands it already generated for you keep working.                                                                                                                                                                                                              |
| Brownfield onboarding | Automatic: `/awos:architecture` always inspects the codebase; an existing stack becomes evidence-cited defaults you confirm in review.                                                                                                                                     |

"Keeps working" means your frozen 1.x copy: AWOS no longer ships, updates, or reads these commands, so they stay exactly as they are today — including any customizations — and you migrate to the replacement path on your own schedule. One thing to know: 2.0's spec flow no longer _builds on_ the roadmap (the topic is the anchor), so a roadmap you keep maintaining feeds specs only through the topic-candidate offer above.

## What the update does to your project

| File                                                   | What happens                                                                                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.awos/commands/{roadmap,hire}.md`                     | Left untouched where present — your frozen 1.x copies keep working; AWOS no longer ships or updates them. A wrapper pointing at a body your project doesn't have gets a removal notice instead. |
| `.awos/templates/{roadmap-template,agent-template}.md` | Left untouched where present (no longer shipped or updated).                                                                                                                                    |
| `.claude/commands/awos/{roadmap,hire}.md`              | Preserved — wrappers are yours; they keep resolving to your local commands.                                                                                                                     |
| `context/product/roadmap.md`                           | Preserved: AWOS no longer creates or updates it, but `/awos:spec` offers its items as topic candidates while it exists. Yours to keep or delete.                                                |
| `/implement-feature`, `/fix-bug`, `delivery-flow.md`   | Preserved and disowned — generated for you, they keep working, they're yours now.                                                                                                               |
| `.mcp.json`                                            | Untouched while `/awos:hire` is present locally. The `awos-recruitment` entry is removed only when no trace of hire remains (see below).                                                        |
| Agents `/awos:hire` installed under `.claude/agents/`  | Preserved — yours to keep or delete.                                                                                                                                                            |

## About `.mcp.json`

Pre-2.0 installs registered an `awos-recruitment` MCP server in your project's `.mcp.json` (creating the file if needed) — it powers `/awos:hire`, and the recruitment service remains available, so the entry is kept as long as any trace of hire (the command or its wrapper) is present in your project. Only when no trace remains does the update remove that one orphaned entry — and nothing else. If it can't do so safely — the file isn't valid JSON, or the entry isn't there — it skips with a log line and leaves your file byte-for-byte as it was. Two caveats for the removal case: it rewrites the file with 2-space indentation, and if the old installer created the file only for AWOS you'll be left with an empty `mcpServers` — safe to delete. The cleanup runs once, at your first 2.0 update — if you remove hire later, delete the entry yourself; nothing uses it without hire. Beyond this, AWOS never touches `.mcp.json`.

## Version notes

- npm package: **2.0.0** (this release).
- awos plugin (`/awos:ai-readiness-audit`): **2.4.6** — a patch on its independent version line. Audit scoring is unchanged in this release; the version stamped in audit reports stays comparable with earlier 2.4.x audits.
