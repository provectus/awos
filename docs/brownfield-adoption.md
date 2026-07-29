# Adopting AWOS on an Existing Codebase (Brownfield)

Most AWOS documentation assumes a **greenfield** project — you start from a blank slate and describe what you want to build. But AWOS works just as well on a **brownfield** project: an existing codebase with real source, history, and often external documentation (wikis, tickets, chat). This guide is the brownfield counterpart to the [Quick Start](../README.md#quick-start) — same commands, same document-centric workflow, with the extra awareness AWOS brings to code that already exists.

You do not run a different set of commands for brownfield. The same foundation commands (`/awos:product`, `/awos:roadmap`, `/awos:architecture`) **auto-detect** your existing code and fold it into the context they build. This guide explains what that detection does, what it produces, and how to steer it.

## The brownfield path at a glance

| Step  | Command                       | What's different for brownfield                                                             |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| **0** | `/awos:ai-readiness-audit`    | _(Recommended first.)_ Scores how AI-ready the codebase is and what to improve.             |
| **1** | `/awos:product`               | Detects existing source, explores it, and drafts the product definition from what it finds. |
| **2** | `/awos:roadmap`               | Assesses already-built capabilities so the roadmap starts from reality, not zero.           |
| **3** | `/awos:architecture`          | Discovers the existing tech stack and uses it as the default architecture.                  |
| **4** | `/awos:hire`, `/awos:flow`    | Identical to greenfield — set up specialist agents and the delivery flow.                   |
| **→** | `/awos:spec` … `/awos:verify` | The per-feature cycle is identical to greenfield.                                           |

Steps 1–4 are the same foundation commands every project runs. The only brownfield-specific addition is **Step 0**, the audit — and the fact that Steps 1–3 read your code instead of starting from a blank page.

## Step 0 — Measure AI-readiness first (the audit)

Before you describe the product, it is worth knowing how ready the existing codebase is for agent-driven development. The AWOS plugin ships an **AI-readiness audit** that scores a repository across a dozen dimensions — code architecture, quality assurance, security, documentation, spec-driven-development health, AI tooling — and produces a report with prioritized, actionable recommendations.

```text
/plugin install awos@awos-marketplace
/awos:ai-readiness-audit
```

The audit writes a self-contained report to `context/audits/<timestamp>/` (both `report.md` and `report.html`, plus `recommendations.md`). For a brownfield adoption it serves three purposes:

- **A baseline.** It tells you where the codebase stands _before_ AWOS, so you can measure improvement later.
- **A punch list.** `recommendations.md` surfaces the highest-leverage gaps (missing `CLAUDE.md`, thin tests, no agent configs) that make the rest of the AWOS flow more effective.
- **A shared vocabulary.** The scores give the team a concrete, agreed-upon picture of the starting point.

**The audit is a fixed measuring stick, so run it first without hesitation.** Its _methodology_ is self-contained — the score is computed by an engine, not by the specialist agents `/awos:hire` later installs — so it measures the repository the same way before and after adoption. The _score itself_ reflects the state of the repo and is expected to change as you improve it: a first run on an untouched brownfield repo will score the AI-tooling and spec-driven-development dimensions low, and that low score _is_ the honest baseline. Adopt AWOS (foundation, `/awos:hire`, specs), re-run the same audit, and those dimensions climb — the measuring stick didn't move, the codebase did. The audit is read-only and each run is an independent snapshot, so re-running costs nothing.

See the [plugin README](../plugins/awos/README.md) for the full dimension list and scoring model.

## Step 1 — `/awos:product`: detection, exploration, and external sources

In **Creation Mode** (no `product-definition.md` yet), `/awos:product` decides whether to treat the project as brownfield, then builds context accordingly.

### How detection works

The command chooses whether to explore existing code in this order:

1. **Your prompt wins.** If you say something like "explore the existing codebase" or "brownfield", it explores. If you say "start from scratch", "greenfield", or "ignore existing code", it skips detection and treats the project as new.
2. **Otherwise it looks.** If your prompt says nothing either way, the command scans for common source indicators — `src/`, `app/`, `lib/`, `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pom.xml`, `Gemfile`, `build.gradle`, `*.csproj`, `pyproject.toml`, and similar. If none are found, it proceeds as greenfield. If any are found, it asks you to confirm: **Yes, explore the codebase** or **No, start from scratch** (defaulting to explore if the question goes unanswered).

So on a repository with real source, brownfield mode engages automatically unless you opt out.

### What exploration produces

When the decision is **explore**, the command launches an `Explore` agent to determine what the project does — its purpose, target audience, main features, and user journey — citing the files that evidence each finding. It records the results in a temporary file, `context/product/brownfield.md`, under a `## Product` heading.

This file is a **staging area, not a deliverable.** Its findings feed the drafted product definition, and after the definition is saved you **triage them** — each finding is presented for **Accept** or **Reject** (with room for free-text corrections). Rejected findings are removed from both the file and the saved definition. The file itself is temporary and is cleaned up later, at the architecture step.

### External documentation sources

Brownfield projects usually have knowledge that lives outside the code — a Confluence or Notion wiki, Jira or Linear tickets, Slack history, email threads. When `/awos:product` creates `brownfield.md`, it also offers to import that knowledge:

> Do you have external documentation (wikis, tickets, chats, email) you'd like to import into the project context?

If you opt in, the command invokes the `awos:configure-external-sources` skill (part of the AWOS plugin), which:

- identifies each source and its category (documentation, tickets, communication),
- guides you through connecting the right tool — an MCP server, a CLI like `gh`, or manual paste,
- records the configuration in `context/sources/sources.md`, and
- once connected, retrieves product-relevant content (requirements, goals, audience, pain points) and folds it into the same triage flow as the code findings.

**Editor-restart handling.** Some MCP servers only become available after the editor restarts. If setup requires that, the skill writes a partial config (`## Status: restart-pending`) and stops. Restart your editor and re-run `/awos:product` — the skill detects the pending state and resumes automatically where it left off. No progress is lost.

If the plugin is not installed, the command tells you so and continues without external sources — the code-based product definition is still produced.

## Step 2 — `/awos:roadmap`: start from what already exists

When `context/product/brownfield.md` is present, `/awos:roadmap` runs a focused `Explore` pass to inventory **existing capabilities** — features that are fully implemented (routes, UI, tests), partially built or scaffolded, and planned (TODOs, FIXMEs). It appends these under a `## Capabilities` heading in `brownfield.md`.

The roadmap is then anchored in reality: only **fully-implemented** capabilities are treated as done, while **partially-built or scaffolded** work and **planned** items (TODOs, FIXMEs) stay visible as upcoming roadmap items rather than being marked complete. New phases describe what comes next instead of re-planning work the codebase has already finished. As with product, the capability findings are triaged with you before the roadmap is finalized.

## Step 3 — `/awos:architecture`: adopt the existing stack, then clean up

With `brownfield.md` present, `/awos:architecture` runs an `Explore` pass to discover the **existing technology stack** — languages, frameworks and versions, databases and ORMs, infrastructure (Docker, cloud configs, deployment scripts), external services, and testing/build/CI tooling. It appends these under a `## Technology` heading, and uses them as the **defaults** for each architecture decision instead of proposing technologies from scratch. You still confirm or change every decision.

This step also **cleans up the temporary brownfield artifacts**:

- `context/product/brownfield.md` is **deleted** — its findings have been absorbed into the product definition, roadmap, and architecture documents by now.
- `context/sources/` is **removed once its contents are fully absorbed**. If durable **non-secret** configuration remains useful (source URLs, tool names, scopes to reach a wiki again later), `context/sources/sources.md` is **kept** and referenced from `product-definition.md` so downstream commands can find it. Credentials and tokens never belong under `context/` — supply those through environment variables or a secret manager, and keep only the pointers to them here.

After this step, your `context/` looks the same as a greenfield project's — a clean set of permanent documents (`product-definition.md`, `roadmap.md`, `architecture.md`) with no brownfield scaffolding left behind.

## Artifact lifecycle

| Artifact                        | Created by                  | Consumed by                           | Fate                                                                              |
| ------------------------------- | --------------------------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| `context/product/brownfield.md` | `/awos:product`             | `/awos:roadmap`, `/awos:architecture` | Deleted by `/awos:architecture` after absorption.                                 |
| `context/sources/sources.md`    | `/awos:product` (via skill) | `/awos:product`, retrieval pass       | Removed by `/awos:architecture` once absorbed; kept + referenced if still useful. |
| `context/audits/<timestamp>/`   | `/awos:ai-readiness-audit`  | You (review + recommendations)        | Permanent history; each run is an independent snapshot.                           |

## Opting in and opting out

- **Force brownfield:** include intent in your prompt — `/awos:product explore the existing codebase`.
- **Force greenfield on a repo with code:** `/awos:product start from scratch, ignore existing code`.
- **Skip external sources:** answer **No** when asked, or decline; a `## Status: none` marker records the choice so you are not asked again.
- **Unattended runs** (`claude -p …`): every brownfield prompt has a safe default (explore, no external sources) and never blocks the deliverable, so foundation setup completes without a human present.

## Greenfield vs. brownfield, side by side

| Aspect                | Greenfield                    | Brownfield                                                         |
| --------------------- | ----------------------------- | ------------------------------------------------------------------ |
| Recommended first run | `/awos:product`               | `/awos:ai-readiness-audit`, then `/awos:product`                   |
| Product definition    | Drafted from your description | Drafted from code exploration + external sources + your input      |
| Roadmap               | All phases are net-new        | Existing capabilities marked done; new phases describe what's next |
| Architecture          | Proposed from best practices  | Discovered existing stack used as defaults                         |
| Extra artifacts       | None                          | Temporary `brownfield.md` / `sources.md`, auto-cleaned             |
| Feature cycle         | `/awos:spec` … `/awos:verify` | Identical                                                          |

## After the foundation

Once `/awos:architecture` finishes, the brownfield path rejoins the greenfield one completely. Run `/awos:hire` and `/awos:flow` to set up your team and delivery flow, then iterate through the per-feature cycle (`/awos:spec → /awos:tech → /awos:tasks → /awos:implement → /awos:verify`) exactly as the [Quick Start](../README.md#step-3-feature-development-cycle) describes. From here on, there is no brownfield-specific behavior — your existing project is now a fully spec-driven AWOS project.
