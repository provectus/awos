# AI-SDLC Adoption Audit — Data Sources Reference

This document defines how the `ai-readiness-audit` skill resolves, confirms, and reads data sources when computing AI-SDLC adoption metrics. It is consumed by SKILL.md Step 0 (initialization) and the collector layer (`collectors/`).

The engine is TypeScript (Node/esbuild), bundled to `dist/cli.js` inside the plugin directory. When invoked by the skill orchestrator (whose working directory is the user's repo), collectors are called with the absolute path `${CLAUDE_SKILL_DIR}/dist/cli.js`:

```bash
node "${CLAUDE_SKILL_DIR}/dist/cli.js" collect <source> <repoPath>
```

Supported sources: `git`, `ci`, `tracker`, `docs` — implemented in `collectors/git.ts`, `collectors/ci.ts`, `collectors/tracker.ts`, and `collectors/docs.ts` respectively. Each collector writes one artifact to `context/audits/<date>/collected/<source>.json`.

The git collector recognizes tooling signals and AI commit attribution across all eight supported agentic coding tools:

| Tool           | Instruction file(s)               | Key config paths                                                             |
| -------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| Claude Code    | `CLAUDE.md`                       | `.claude/`, `.mcp.json`, `.claude/mcp.json`                                  |
| Cursor         | `.cursorrules`                    | `.cursor/rules/`, `.cursor/commands/`, `.cursor/mcp.json`                    |
| GitHub Copilot | `.github/copilot-instructions.md` | `.github/prompts/`, `.github/instructions/`                                  |
| OpenAI Codex   | `AGENTS.md`                       | `.codex/prompts/`, `.codex/config.toml`                                      |
| Gemini CLI     | `GEMINI.md`                       | `.gemini/commands/`, `.gemini/settings.json`                                 |
| Kiro           | _(none)_                          | `.kiro/steering/`, `.kiro/specs/`, `.kiro/hooks/`, `.kiro/settings/mcp.json` |
| Windsurf       | `.windsurfrules`                  | `.windsurf/rules/`, `.windsurf/workflows/`, `.windsurf/mcp_config.json`      |
| Cline          | `.clinerules`                     | `.cline/mcp.json`                                                            |

This table is derived from `agent_tools.ts` — the single registry that drives the git collector, all detectors, and the tooling-depth metric (`tooling_depth`, checks ADP-01..ADP-06).

---

## The audit boundary

The audit scope is always **either a folder or a GitHub org — never a manifest file**. The target the skill is pointed at decides the mode:

1. **A git repo** (the target folder contains `.git`) → **single-repo mode** over that repo. A monorepo is just this case: one repo, audited as a whole.
2. **A non-git folder** → **org mode**. Enumerate every immediate top-level subdirectory that is itself a git repo, and audit each one. List any top-level subdirectories that were skipped because they are not git repos, so the audited scope is transparent to the user.
3. **A GitHub org name** → **org mode** over the org's repos, enumerated with `gh repo list <org>` (gh CLI on PATH) or the GitHub MCP if present.

No scope manifest is read; there is no configuration file to author. Point the skill at the folder or org and it resolves the boundary itself.

### Monorepo detection (TOPO-01)

The monorepo flag (`dimensions/project-topology.md` → TOPO-01) is set when a workspace manifest is present at the repo root — any of `pnpm-workspace.yaml`, `package.json` with a `workspaces` field, `turbo.json`, `nx.json`, `lerna.json`, `pants.toml`, `WORKSPACE`/`MODULE.bazel`, or a Cargo/Go workspace declaration. This flag gates the `applies_when` of the monorepo-only checks — SBP-08 (`sbp_vertical_delivery`) and ARCH-07 (`arch_cross_layer_tooling`). It is a per-repo topology signal — it does not split a monorepo into multiple audit targets; a monorepo is always single-repo mode over the whole folder.

---

## Connector detection

Before prompting the user, the skill probes which connectors are reachable for each repository:

| Connector     | Detection heuristic                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code host     | `gh` or `glab` on PATH, or a GitHub/GitLab MCP server present in the session                                                                                |
| CI            | CI config files in-repo (`.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, etc.); run history via `gh`/`glab`                                          |
| Issue tracker | Tracker MCP in the session, `acli` on PATH (Jira), code-host issues via `gh`/`glab`, or tracker references in docs/commits (Jira project keys, Linear URLs) |
| Docs / wiki   | `confluence`, `coda`, or similar CLI on PATH, or a Confluence/Coda MCP server present                                                                       |

Boundary rule: the audit assesses the **project**, not the auditor's environment. MCP servers count only as the session provides them — in practice the project's own declared config (`.mcp.json`) — never the auditor's personal user-scope servers. CLI tools (`gh`, `glab`, `acli`) are the sanctioned exception: a repo cannot ship a CLI, so they act as measurement channels only (a project can still request them in its README). Fetch recipes and identity heuristics live in `connector-shapes.md` → "CLI channels".

---

## Interaction flow — discovery first, then ask once

Source resolution runs in **two phases** to minimize interruptions.

### Phase 1 — Discovery round

Resolve the boundary (see "The audit boundary" above), then probe connectors per repo:

- **Single repo:** probe the current repo directly.
- **Org mode:** fan-out, one probe per discovered repo, running in parallel.

Each probe:

- Confirms the repo is a git repo (has `.git`).
- Probes which connectors are reachable (see Connector detection above).
- Reads in-repo signals — CI config, tracker references in docs or scripts, doc links — to infer each repo's sources.

Dispatch this discovery work as `Agent` subagents pinned to Haiku (`model: haiku` on the Agent call) — it is mechanical file/PATH probing, so the cheapest tier is sufficient.

### Phase 2 — One confirmation prompt

After the discovery round completes, use `AskUserQuestion` **once, at the start of the run**, to confirm the detected scope and sources. Never prompt mid-run.

Present the resolved boundary — the repo (single-repo mode) or the list of enumerated repos with any non-git subdirectories that were skipped (org mode) — together with each repo's detected connectors, and offer to proceed with the auto-discovered set as-is (the headless default).

If the user declines to answer, proceed with discovery results at the achievable confidence level.

---

## Collector artifacts

Each collector (`collectors/git.ts`, `collectors/ci.ts`, `collectors/tracker.ts`, `collectors/docs.ts`) is dispatched via:

```bash
node "${CLAUDE_SKILL_DIR}/dist/cli.js" collect <source> <repoPath>
```

It writes one JSON file to `context/audits/<date>/collected/<source>.json`. The `collected/` directory is the sole interface between collectors and metrics — metric modules read only from those files and never invoke sources directly.

Artifact schema:

```json
{
  "source": "git",
  "available": true,
  "reason_if_absent": null,
  "period": {
    "bucket_days": 30,
    "lookback_days": 730,
    "history_available_days": 400
  },
  "raw": { "...": "source-specific payload" }
}
```

When a source is unavailable, `available` is `false` and `reason_if_absent` carries a human-readable explanation. Metrics receiving an absent artifact SKIP their computation and surface the reason in the report.

---

## Period & history

The measurement window is governed by `standards.toml [meta]`:

- **`max_lookback_days = 90`** — the single 90-day window; the git collector emits one `window_stats` aggregate (not per-30-day buckets) anchored to the newest commit date.

**Minimal-source-history rule.** Each metric's available history is bounded by the **minimal available history among its feeding sources** — the shortest `history_available_days` value reported in the collector artifacts for that metric's inputs. A metric cannot claim more historical depth than its least-historical source allows.

**Partial source — downgraded reliability.** When one or more of a metric's sources are absent, the metric still computes from the remaining sources, but its reliability is downgraded to reflect the gap. The `metrics/` layer records which sources contributed and marks reliability accordingly.

**SKIP rule.** A metric SKIPs (is omitted from output) only when **none** of its required sources exist. A metric with at least one contributing source always produces a result, even at low reliability.

---

## Org mode — auditing multiple repos

When the boundary resolves to multiple repositories (a non-git folder of git subdirectories, or a GitHub org), the skill audits each repo independently and aggregates the results at the org/product level. Each repo runs the full single-repo flow into its own `per-repo/<repo>/` subdir, then a portfolio rollup summarizes across them.

Contributor counts are always reported in aggregate (never per-person) and granularity stays at the repository level.
