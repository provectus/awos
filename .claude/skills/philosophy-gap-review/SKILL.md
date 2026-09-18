---
name: philosophy-gap-review
description: >-
  Maintainer skill for finding gaps between the awos philosophy
  (docs/philosophy.md, direction.md, rationale.md) and the state of a branch.
  Spawns three independent Tech Lead reviewers blind to the existing gap
  registry, merges their lists by how many reviewers raised each gap, and
  rewrites docs/2.0/gaps.md on request. Use when Daria asks to "re-think the
  gaps", "run the three tech leads", or after a scope change (a command
  retired, a plugin taking over a step) invalidates the current registry.
---

# Philosophy Gap Review

Three independent reviewers, one merge, one registry. The point of three is independence: a gap raised by all three without seeing each other or the registry is strong signal; a gap raised by one is a defensible reading worth recording at lower confidence. Reviewer silence is not proof a gap is false — absence-shaped gaps are the kind a step-by-step trace misses — so a carried-over gap is judged on its evidence, not on its count.

## How to run

```
/philosophy-gap-review [scope notes]
```

Scope notes are free text and become the **Scope rule** block in every reviewer prompt. Examples that have been used:

- `judge the spec step only via /better:spec; core commands/spec.md is retired; do not list "two spec commands coexist"` (2026-09-18, second run)
- none (2026-09-18, first run — whole branch, every command judged)

Read `docs/2.0/gaps.md` yourself before spawning, so you can cross-reference at merge time. The reviewers must not.

## Step 1 — spawn three reviewers in one message

Three `Agent` calls, `subagent_type: general-purpose`, in a single message so they run concurrently. Identical prompts except nothing — the independence comes from separate contexts, not from different briefs. The prompt, verbatim apart from the two bracketed slots:

> You are an experienced Tech Lead who has passed CCAR-F and CCAR-P, has built multiple Agentic SDLC solutions and frameworks, and balances common sense, critical thinking, and perfectionism. You are reviewing the `awos` repository at [repo path] on the current branch [branch] (do not switch branches, do not modify any files, do not run the installer).
>
> **Goal.** Find ALL gaps between the awos philosophy and the actual state of awos on this branch. A gap is any place where what the repo ships (prompts, wrappers, templates, scripts, plugins, installer, docs, tests) does not keep the promise the philosophy makes, or actively regresses against one of the five directions.
>
> **Scope rule.** [scope notes, or omit the block]
>
> **Step 1 — read the philosophy in full:** docs/philosophy.md, docs/direction.md, docs/rationale.md, README.md, CLAUDE.md. Do NOT read docs/2.0/gaps.md — a gap registry exists there and we want your independent judgment, not an echo of it. You MAY read docs/2.0/roadmap-2.0.md and docs/2.0/upgrading-1.x.md for what is already planned, but plans are not closures: a gap that is only "scheduled" is still a gap and must be listed (note the planned closure).
>
> **Step 2 — read the branch state,** the actual product, not summaries: commands/*.md, claude/commands/*.md, templates/*.md, scripts/, plugins/better/ in full, plugins/awos/ (README, SKILL.md, agents/, configure-external-sources; skim the engine), src/ and index.js and src/migrations/, docs/commands/*.md, tests/ (what contracts are enforced). Use Bash (cat, sed -n, grep -n, find). Trace what each command actually reads, asks, writes, and checks, and compare to what the philosophy says must happen: intent gathered from sources then confirmed; a yes/no moment before build; agreement as the contract for implementation AND verification; awos checks its own work; structured source for agents + derived views for humans; gaps made reviewable with evidence, open questions instead of guesses; project remembers without people doing upkeep; one path, everything else integrated not provided; one host natively; for work worth specifying. Pay particular attention to the seams between commands: what each one hands to the next and whether the next honours it. Test each shipped capability against "toward a smaller surface": on the path or outside it? two ways to do one step? serving the host rather than the method?
>
> **Step 3 — report** a numbered list. For EACH gap: **Title** (one line, specific); **Principle(s) / direction(s) violated**; **Reasoning** (2–5 sentences: promise, what the branch does instead, why it matters); **Citations** — file paths with line numbers or step names and quoted snippets, at least one into the branch and one into the philosophy docs; **Severity** (high / medium / low) by how much it undermines the product being *agreement*; **Status note** if a roadmap phase targets it. Completeness over brevity; no padding with non-gaps; no fix recommendations beyond a phrase. Return the full list in your final message.

Each run costs roughly 250k tokens per reviewer and 6–7 minutes wall clock. Wait for all three notifications; do not merge on two.

## Step 2 — merge

1. Cluster the three lists by underlying defect, not by title. Two reviewers describing one seam from two principles are one gap. A facet only one reviewer saw (for example "provenance lives only in the ephemeral view-model") stays its own entry if it has its own evidence.
2. Count **Raised by** (1, 2, or 3 of 3). Order the merged list by count, then by severity within a count.
3. Keep every citation from every reviewer for a cluster; do not re-verify this run's line numbers individually, say so in the recap. Carried-over entries are the exception: Step 3 reopens their citations.
4. Cross-reference against the current `docs/2.0/gaps.md`: which merged gaps are new, which existing entries no reviewer raised.
5. Present the merged list in chat and stop. Do not touch the registry until Daria says "rewrite".

## Step 3 — rewrite the registry (only on request)

Rewrite `docs/2.0/gaps.md` in full. Header keeps **Author**, **Created** (the original date), **Status: Draft**, **Role**. Keep the Starting point, Scope, How this list was produced, Status vocabulary, Closes in, and Pattern paragraphs, updating Scope and Pattern to the run. Every gap in this shape:

```
### N. Title
- **Promise:** …principle/direction, quoting the direction doc's regression test where one applies
- **Today:** …what the branch does, in prose
- **Evidence:** `file:lines`; …
- **Raised by:** N of 3.
- **Closes in:** `better:<command>` …, or `not a command — …`, or `undecided — …`
- **Status:** open | scheduled — Phase … | undecided — … | decided — …
```

Sections: Intent; Confirmed understanding; Implementation; Verification; Memory; Surface; `awos` checking its own work. Existing entries no reviewer raised are kept only if their evidence still holds — reopen each citation and confirm the path and lines still show the gap — marked _carried over_ in Raised by; otherwise they are dropped and the recap says why. Run `npx prettier --check docs/2.0/gaps.md`. Leave the file uncommitted.

## Decisions that shape this skill (do not re-litigate)

- 2.0 strategy (2026-09-18): the `better` plugin hosts updated versions of all core commands; `better:implement` = `tasks` + `implement` + `verify`. Gaps of those three core commands are owned by `better:implement`. Whether hire gets a better version is the open hire decision.
- "Nothing measures the outcome" is not a registry gap: the registry's role is path gaps and the method is not a metrics tool. It lives as a caveat in the Pattern paragraph.
- The legacy `context/product/roadmap.md` read stays (graceful shutdown, no sunset); it is listed so the decision sits next to its cost, not to reopen it.
- Coexistence of core and `better` commands during the transition is decided, not a gap.
