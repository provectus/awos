# Better Plugin (experimental)

The `better` namespace hosts experimental, higher-rigor forks of core AWOS commands. The first is `/better:spec`, a research-backed alternative to `/awos:spec`: same deliverable, higher rigor — before drafting the functional spec, the command fans out parallel research agents; after writing it, a context-free agent verifies the spec is understandable on its own.

Core `/awos:spec` derives a spec from a one-line topic prompt plus an interview — details that live in the codebase, in domain conventions, or in the organization's knowledge base never make it in. This plugin closes that gap.

## Install

Requires an AWOS core installation in the project (`npx @provectusinc/awos`) — the command uses the installed template and spec-directory script. Then:

```
/plugin install better@awos-marketplace
```

If the marketplace is not registered yet: `/plugin marketplace add provectus/awos`.

## Usage

```
/better:spec Add CSV export to reports   # the topic anchors the spec
/better:spec                             # no topic: the command asks for one (unattended runs stop instead)
/better:spec 014                         # resume the understanding gate of a spec whose brief is still Draft
```

Amendments to existing specs are out of scope by design — use `/awos:spec`, which handles in-place updates.

## What it does differently

1. **A sources offer at the start.** When `context/sources/sources.md` does not exist, the command asks once whether to discover the project's knowledge sources now (via the `configure-external-sources` skill, when it is installed) or skip for this spec. Suggested, never enforced; unattended runs skip silently.
2. **Research before the first question.** Up to three agents run in parallel as soon as the topic is known — before you are asked anything, so that every question you do get is informed:
   - **Codebase** (always) — adjacent features, current behavior, in-repo docs, contradictions.
   - **Web** (always) — how comparable products solve the problem, domain conventions, UX patterns. Reports `SKIPPED` when web access is unavailable.
   - **Internal KB** (when configured) — runs only when `context/sources/sources.md` exists with `## Status: configured` and lists at least one source of any role (tracker, docs, communication, version control, infrastructure) whose `Access:` is not `manual` — a manual-only source has nothing for an agent to fetch, so the lane reports `MANUAL SOURCES ONLY` and you are invited to paste from it during the final review instead. That file is written by the `configure-external-sources` skill, which ships with the **awos plugin** (not this one and not AWOS core) — install it with `/plugin install awos@awos-marketplace`, then run its `configure-external-sources` skill. Reports `SKIPPED` when a recorded transport is unreachable.
3. **A feature brief and an understanding gate.** From the research the command writes `feature-brief.md` into the spec directory: the feature's vocabulary (every domain term in one sentence, most basic first), what it does today, what it depends on, what it changes, its quirks (each as "normally … here …"), and the open questions. Then it holds a conversation over that brief: the opening message points you at the file to read, states what the research could not see, and lists the open questions; open dialog follows. You can ask what any term means, correct what the research got wrong, point at a ticket, page, meeting or person, or explain the feature yourself; each reply updates the brief and is logged in it. The big-picture questions (the pain point, the capability, the boundaries) are asked only once you are oriented. The gate closes only on your explicit confirmation, which is dated in the brief; the command never checks it on its own. If the conversation stops before that, the brief stays `Draft` on disk and `/better:spec <spec-number>` resumes the gate later. Unattended runs skip the gate and mark the spec as drafted from research alone.
4. **Synthesis into the draft.** Uncontroversial findings (edge cases, boundary behavior, error paths) flow straight into requirements and acceptance criteria. Findings that raise a real question — a conflict with what you said, or a choice you have not made — are drafted on the research-backed answer and marked, then put to you after the spec is saved. Technical findings are translated to user-facing language before entering the spec.

   The ordering is deliberate: a written artifact precedes every question. The brief and the research notes exist before the gate's first question, so a conversation that ends early leaves something to resume from; the spec is written before the final-review questions, so an unanswered one costs nothing. In a headless `claude -p` run a question nobody answers ends the turn, and anything written after it never happens — so unattended runs ask nothing at all and still produce every file, with every assumption named in a `[NEEDS CLARIFICATION: …]` marker. Export `AWOS_UNATTENDED=1` for such runs — provided the invocation carries a topic; with no topic an unattended run still stops, since nothing anchors the spec.

5. **Blind verification.** After the spec is written, the bundled `spec-verifier` agent reads it cold — only the file, no session context, `Read` as its only tool — and reports ambiguities, unstated assumptions, and acceptance criteria it could not execute as a manual test. Fixes are folded in once.
6. **A human-friendly review page.** As its final step, the command renders `functional-spec.html` — an at-a-glance summary, a table of the decisions a reviewer might challenge, the research findings with what each one changed, and every requirement with named, collapsible acceptance criteria and provenance badges (Interview / Codebase / Web / KB). The command authors the human layer in-session (where it knows what came from where) and hands it to the bundled deterministic renderer (`scripts/render-spec.mjs`), which extracts all contract text verbatim from the markdown — the page can reshape the spec but never rewrite it. Rendering requires `node` on PATH and is never fatal: if it fails, the markdown deliverables stand alone.
7. **An optional share link.** After rendering (and only when the session has the `Artifact` tool), the command offers to publish the review page as a Claude artifact — a URL reviewers can open instead of a file. This is strictly opt-in: an unanswered question means no, and unattended runs never publish. The artifact starts private; sharing it onward happens from claude.ai.

## Outputs

The three markdown files always land in the standard spec directory (`context/spec/NNN-short-name/`); the review page is written whenever rendering succeeds (it needs `node` on PATH and is never fatal):

| File                   | Contract                                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature-brief.md`     | What the feature is today, in plain language with provenance labels, plus the understanding ledger (`Draft` → `Confirmed <date>`) and the dialog log. Written before the first question; the resumable state of the gate.  |
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
