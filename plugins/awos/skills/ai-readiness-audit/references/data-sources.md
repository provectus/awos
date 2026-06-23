# AI-SDLC Adoption Audit — Data Sources Reference

This document defines how the `ai-readiness-audit` skill resolves, confirms, and reads data sources when computing AI-SDLC adoption metrics. It is consumed by SKILL.md Step 0 (initialization) and the `ai-sdlc-adoption` dimension.

---

## Default behavior

When invoked with no arguments, the skill audits the **current repo** (the working directory). No additional configuration is needed for a single-repo project.

Linked repositories are resolved automatically using three methods:

1. **Monorepo build roots** — packages and apps listed in monorepo build config (workspace roots, `pnpm-workspace.yaml`, `turbo.json`, etc.; see project-topology TOPO-01).
2. **Git submodules** — paths declared in `.gitmodules`.
3. **Symlinked source directories** — filesystem symlinks inside the repo that point to a path outside the repo root. This covers the pattern where an AWOS orchestrating repo is symlinked into service repos — see "One Orchestrating Repo: Spec-Driven Development Across a Live Multi-Repo Product" (Provectus on Medium).

---

## Connector detection

Before prompting the user, the skill probes which connectors are reachable for each repository:

| Connector     | Detection heuristic                                                                         |
| ------------- | ------------------------------------------------------------------------------------------- |
| Code host     | `gh` or `glab` on PATH, or a GitHub/GitLab MCP server present in the session                |
| CI            | CI config files in-repo (`.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, etc.)       |
| Issue tracker | Tracker references in docs or scripts (Jira project keys, Linear URLs, GitHub Issues links) |
| Docs / wiki   | `confluence`, `coda`, or similar CLI on PATH, or a Confluence/Coda MCP server present       |

---

## Interaction flow — discovery first, then ask once

Source resolution runs in **two phases** to minimize interruptions.

### Phase 1 — Discovery round

Dispatch a "find integrations" subagent per repository:

- **Single repo:** one subagent for the current repo.
- **Several repos:** fan-out, one subagent per repo, running in parallel.

Each subagent:

- Detects linked repos (submodules, symlinks, monorepo build roots).
- Probes which connectors are reachable (see Connector detection above).
- Reads in-repo signals — CI config, tracker references in docs or scripts, doc links — to infer each repo's sources.

### Phase 2 — One confirmation prompt

After the discovery round completes, use `AskUserQuestion` **once, at the start of the run**, to confirm the detected sources and fill any gaps. Never prompt mid-run.

**Single / few repos:** present the detected connectors and ask which to use; invite the user to supply any missing endpoint or credential.

**Many repos:** do **not** ask for a per-repo link-with-explanation list (too large to be usable). Instead, ask only for either:

- a `sources.toml` file path (see schema below), or
- a flat list of repo links.

Then **map repos to links empirically** — match each link to a repository by in-repo signals (remote URLs, doc/script references, directory names). Report the inferred mapping to the user rather than interrogating them repo by repo.

If the user declines to answer, proceed with discovery results at the achievable confidence level.

---

## `sources.toml` schema

The optional override file lives at `context/audits/sources.toml` relative to the audit root. When present, its values override or extend auto-detection.

```toml
# Scope: which repositories to measure. Omit for current-repo-only.
[[repos]]
path = "."                 # local path or
url  = "git@github.com:org/service-a.git"
adoption_start = "2025-09-01"  # optional; else inferred from git history

[sources]
ci = "github-actions"      # or "gitlab-ci", "none"
issue_tracker = "jira"     # or "github-issues", "linear", "none"
docs = "confluence"        # or "coda", "none"

[windows]
length_days = 180          # before and after window length
```

All fields are optional. Omitting `[[repos]]` entirely means "audit the current repo only."

---

## Adoption-start inference

When `adoption_start` is absent from `sources.toml` (or the file itself is absent), the skill infers the adoption start date from git history.

**Recipe** — earliest add-date of AI tooling files in the repo:

```
git log --diff-filter=A --format=%cs -- CLAUDE.md AGENTS.md .claude/ | tail -1
```

This returns the date (`%cs` = short ISO date) on which the first AI-tooling file was added to the repository.

**Window calculation:**

- Before-window: `[start − length_days, start)` — clamped to available history.
- After-window: `[start, today]`.
- `length_days` = `min(requested, history available before start)`.

**No AI tooling found:** if the command returns no output, the repository has no baseline. In this case:

- Adoption metrics report **current-state only** (ramp, not delta).
- Delivery metrics (cycle time, DORA, etc.) **SKIP** the before/after delta computation entirely.

---

## Multi-repo linking

When the audit spans multiple repositories (resolved via monorepo build roots, submodules, or symlinks), the skill links them into a single audit view rather than treating them as independent projects. The AWOS-linked-into-services pattern — where a central orchestrating repo is symlinked into each service repo — is explicitly supported. For background on the pattern, see "One Orchestrating Repo: Spec-Driven Development Across a Live Multi-Repo Product" (Provectus, Medium).

Each linked repository is measured independently and the results are aggregated at the org/product level. Contributor counts are always reported in aggregate (never per-person) and granularity stays at the repository level.
