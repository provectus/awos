# Better Plugin (experimental)

The `better` namespace hosts experimental, higher-rigor forks of core AWOS commands. The first is `/better:spec`, a research-backed alternative to `/awos:spec`: same deliverable, higher rigor — before drafting the functional spec, the command fans out parallel research agents; after writing it, a context-free agent verifies the spec is understandable on its own.

Core `/awos:spec` derives a spec from a one-line prompt or roadmap item plus an interview — details that live in the codebase, in domain conventions, or in the organization's knowledge base never make it in. This plugin closes that gap.

## Install

Requires an AWOS core installation in the project (`npx @provectusinc/awos`) — the command uses the installed template and spec-directory script. Then:

```
/plugin install better@awos-marketplace
```

If the marketplace is not registered yet: `/plugin marketplace add provectus/awos`.

## Usage

```
/better:spec                          # next incomplete roadmap item
/better:spec Add CSV export to reports   # explicit topic
```

Amendments to existing specs are out of scope by design — use `/awos:spec`, which handles in-place updates.

## What it does differently

1. **Research fan-out before drafting.** After a big-picture interview round, up to three agents run in parallel against the current understanding:
   - **Codebase** (always) — adjacent features, current behavior, in-repo docs, contradictions.
   - **Web** (always) — how comparable products solve the problem, domain conventions, UX patterns. Reports `SKIPPED` when web access is unavailable.
   - **Internal KB** (when configured) — runs only when `context/sources/sources.md` exists with `## Status: configured` and lists a documentation source. That file is written by the `configure-external-sources` skill, which ships with the **awos plugin** (not this one and not AWOS core) — install it with `/plugin install awos@awos-marketplace`, then run its `configure-external-sources` skill (or let `/awos:product` trigger it on brownfield projects). Reports `SKIPPED` when a recorded transport is unreachable.
2. **Synthesis round.** Findings become sharper interview questions (conflicts and discovered decisions) or flow directly into requirements and acceptance criteria (uncontroversial edge cases). Technical findings are translated to user-facing language before entering the spec.
3. **Blind verification.** After the spec is written, the bundled `spec-verifier` agent reads it cold — only the file, no session context, `Read` as its only tool — and reports ambiguities, unstated assumptions, and acceptance criteria it could not execute as a manual test. Fixes are folded in once.
4. **A human-friendly review page.** As its final step, the command renders `functional-spec.html` — an at-a-glance summary, a table of the decisions a reviewer might challenge, the research findings with what each one changed, and every requirement with named, collapsible acceptance criteria and provenance badges (Interview / Codebase / Web / KB). The command authors the human layer in-session (where it knows what came from where) and hands it to the bundled deterministic renderer (`scripts/render-spec.mjs`), which extracts all contract text verbatim from the markdown — the page can reshape the spec but never rewrite it. Rendering requires `node` on PATH and is never fatal: if it fails, the markdown deliverables stand alone.
5. **An optional share link.** After rendering (and only when the session has the `Artifact` tool), the command offers to publish the review page as a Claude artifact — a URL reviewers can open instead of a file. This is strictly opt-in: an unanswered question means no, and unattended runs never publish. The artifact starts private; sharing it onward happens from claude.ai.

## Outputs

The two markdown files always land in the standard spec directory (`context/spec/NNN-short-name/`); the review page is written whenever rendering succeeds (it needs `node` on PATH and is never fatal):

| File                   | Contract                                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `functional-spec.md`   | Identical to `/awos:spec` — same template, same location. `/awos:tech` and everything downstream work unchanged.                                                                                                           |
| `research-notes.md`    | Additive side artifact: raw technical findings (`## Codebase findings`, `## Web research findings`, `## Internal KB findings`, `## Unresolved conflicts`). Nothing depends on it; the technical spec phase can draw on it. |
| `functional-spec.html` | The human-facing review page — a derived, point-in-time snapshot stamped with its generation date and source hash. Approvals bind to the markdown; this page is the lens people review it through. Nothing depends on it.  |

## Plugin structure

```
better/
├── .claude-plugin/plugin.json   # manifest (independent version line)
├── commands/spec.md             # /better:spec
├── agents/spec-verifier.md      # blind spec reader (tools: Read)
├── scripts/render-spec.mjs      # deterministic review-page renderer (node, no deps)
└── README.md
```

## Status

Experimental. The deliverable contract is stable (it is `/awos:spec`'s contract); the research and verification flow may change between versions. If the experiment proves out, the flow will be folded into core `/awos:spec`.
