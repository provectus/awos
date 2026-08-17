# Better-Spec Plugin (experimental)

An experimental, research-backed alternative to `/awos:spec`. Same deliverable, higher rigor: before drafting the functional spec, the command fans out parallel research agents; after writing it, a context-free agent verifies the spec is understandable on its own.

Core `/awos:spec` derives a spec from a one-line prompt or roadmap item plus an interview — details that live in the codebase, in domain conventions, or in the organization's knowledge base never make it in. This plugin closes that gap.

## Install

Requires an AWOS core installation in the project (`npx @provectusinc/awos`) — the command uses the installed template and spec-directory script. Then:

```
/plugin install better-spec@awos-marketplace
```

If the marketplace is not registered yet: `/plugin marketplace add provectus/awos`.

## Usage

```
/better-spec:spec                          # next incomplete roadmap item
/better-spec:spec Add CSV export to reports   # explicit topic
```

Amendments to existing specs are out of scope by design — use `/awos:spec`, which handles in-place updates.

## What it does differently

1. **Research fan-out before drafting.** After a big-picture interview round, up to three agents run in parallel against the current understanding:
   - **Codebase** (always) — adjacent features, current behavior, in-repo docs, contradictions.
   - **Web** (always) — how comparable products solve the problem, domain conventions, UX patterns. Reports `SKIPPED` when web access is unavailable.
   - **Internal KB** (when configured) — runs only when `context/sources/sources.md` exists with `## Status: configured` and lists a documentation source (set up via `/awos:product` or the `configure-external-sources` skill). Reports `SKIPPED` when a recorded transport is unreachable.
2. **Synthesis round.** Findings become sharper interview questions (conflicts and discovered decisions) or flow directly into requirements and acceptance criteria (uncontroversial edge cases). Technical findings are translated to user-facing language before entering the spec.
3. **Blind verification.** After the spec is written, the bundled `spec-verifier` agent reads it cold — only the file, no session context, `Read` as its only tool — and reports ambiguities, unstated assumptions, and acceptance criteria it could not execute as a manual test. Fixes are folded in once.

## Outputs

Both files land in the standard spec directory (`context/spec/NNN-short-name/`):

| File                 | Contract                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `functional-spec.md` | Identical to `/awos:spec` — same template, same location. `/awos:tech` and everything downstream work unchanged.                                                                                                           |
| `research-notes.md`  | Additive side artifact: raw technical findings (`## Codebase findings`, `## Web research findings`, `## Internal KB findings`, `## Unresolved conflicts`). Nothing depends on it; the technical spec phase can draw on it. |

## Plugin structure

```
better-spec/
├── .claude-plugin/plugin.json   # manifest (independent version line)
├── commands/spec.md             # /better-spec:spec
├── agents/spec-verifier.md      # blind spec reader (tools: Read)
└── README.md
```

## Status

Experimental. The deliverable contract is stable (it is `/awos:spec`'s contract); the research and verification flow may change between versions. If the experiment proves out, the flow will be folded into core `/awos:spec`.
