---
name: philosophy-gap-review
description: >-
  Maintainer skill for finding gaps between the awos philosophy
  (docs/philosophy.md, direction.md, rationale.md) and the state of a branch.
  Spawns three independent Tech Lead reviewers, merges their lists by how
  many reviewers raised each gap, and reports the merged concerns in chat. It
  writes no file. Use when Daria asks to "re-think the gaps", "run the three
  tech leads", or after a scope change (a command retired, a plugin taking
  over a step) changes what the branch promises.
---

# Philosophy Gap Review

Three independent reviewers, one merge, one list of concerns in chat. The point of three is independence: a gap raised by all three without seeing each other is strong signal; a gap raised by one is a defensible reading worth reporting at lower confidence. Reviewer silence is not proof a gap is false — absence-shaped gaps are the kind a step-by-step trace misses — so a concern is judged on its evidence, not on its count alone.

The output is the chat report and nothing else. There is no gap registry to maintain: 2.0 is defined through experiments, not by patching gaps one by one. The roadmap adds no items for fixing gaps; a concern this skill raises informs the team, it does not become a roadmap item by itself.

## How to run

```
/philosophy-gap-review [scope notes]
```

Scope notes are free text and become the **Scope rule** block in every reviewer prompt. Examples that have been used:

- `judge the spec step only via /better:spec; core commands/spec.md is retired; do not list "two spec commands coexist"` (2026-09-18, second run)
- none (2026-09-18, first run — whole branch, every command judged)

Read `docs/2.0/roadmap-2.0.md` yourself before spawning, so you can say at merge time which concerns a phase already targets.

## Step 1 — spawn three reviewers in one message

Three `Agent` calls, `subagent_type: general-purpose`, in a single message so they run concurrently. Identical prompts except nothing — the independence comes from separate contexts, not from different briefs. The prompt, verbatim apart from the two bracketed slots:

> You are an experienced Tech Lead who has passed CCAR-F and CCAR-P, has built multiple Agentic SDLC solutions and frameworks, and balances common sense, critical thinking, and perfectionism. You are reviewing the `awos` repository at [repo path] on the current branch [branch] (do not switch branches, do not modify any files, do not run the installer).
>
> **Goal.** Find ALL gaps between the awos philosophy and the actual state of awos on this branch. A gap is any place where what the repo ships (prompts, wrappers, templates, scripts, plugins, installer, docs, tests) does not keep the promise the philosophy makes, or actively regresses against one of the five directions.
>
> **Scope rule.** [scope notes, or omit the block]
>
> **Step 1 — read the philosophy in full:** docs/philosophy.md, docs/direction.md, docs/rationale.md, README.md, CLAUDE.md. We want your independent judgment, not an echo of any earlier review. You MAY read docs/2.0/roadmap-2.0.md and docs/2.0/upgrading-1.x.md for what is already planned, but plans are not closures: a gap that is only "scheduled" is still a gap and must be listed (note the planned closure).
>
> **Step 2 — read the branch state,** the actual product, not summaries: commands/*.md, claude/commands/*.md, templates/*.md, scripts/, plugins/better/ in full, plugins/awos/ (README, SKILL.md, agents/, configure-external-sources; skim the engine), src/ and index.js and src/migrations/, docs/commands/*.md, tests/ (what contracts are enforced). Use Bash (cat, sed -n, grep -n, find). Trace what each command actually reads, asks, writes, and checks, and compare to what the philosophy says must happen: intent gathered from sources then confirmed; a yes/no moment before build; agreement as the contract for implementation AND verification; awos checks its own work; structured source for agents + derived views for humans; gaps made reviewable with evidence, open questions instead of guesses; project remembers without people doing upkeep; one path, everything else integrated not provided; one host natively; for work worth specifying. Pay particular attention to the seams between commands: what each one hands to the next and whether the next honours it. Test each shipped capability against "toward a smaller surface": on the path or outside it? two ways to do one step? serving the host rather than the method?
>
> **Step 3 — report** a numbered list. For EACH gap: **Title** (one line, specific); **Principle(s) / direction(s) violated**; **Reasoning** (2–5 sentences: promise, what the branch does instead, why it matters); **Citations** — file paths with line numbers or step names and quoted snippets, at least one into the branch and one into the philosophy docs; **Severity** (high / medium / low) by how much it undermines the product being *agreement*; **Status note** if a roadmap phase targets it. Completeness over brevity; no padding with non-gaps; no fix recommendations beyond a phrase. Return the full list in your final message.

Each run costs roughly 250k tokens per reviewer and 6–7 minutes wall clock. Wait for all three notifications; do not merge on two.

## Step 2 — merge

1. Cluster the three lists by underlying defect, not by title. Two reviewers describing one seam from two principles are one gap. A facet only one reviewer saw (for example "provenance lives only in the ephemeral view-model") stays its own entry if it has its own evidence.
2. Count **Raised by** (1, 2, or 3 of 3). Order the merged list by count, then by severity within a count.
3. Keep every citation from every reviewer for a cluster; do not re-verify this run's line numbers individually, say so in the recap.
4. Cross-reference against `docs/2.0/roadmap-2.0.md`: which concerns a phase or decision point already targets, which have no home in the plan.
5. Present the merged list in chat and stop. Write nothing to the repository.

## Step 3 — the report

The report is the deliverable. Every concern in this shape:

```
### N. Title
- **Promise:** …principle/direction, quoting the direction doc's regression test where one applies
- **Today:** …what the branch does, in prose
- **Evidence:** `file:lines`; …
- **Raised by:** N of 3.
- **Where it would close:** `better:<command>` …, or `not a command — …`, or `undecided — …`
- **Roadmap:** the phase, item, or D-N that targets it, or `none`
```

Grouped under: Intent; Confirmed understanding; Implementation; Verification; Memory; Surface; `awos` checking its own work. Close with a short recap: how many concerns, how many raised by all three, how many have no home in the roadmap, and the scope rule the run used. Do not write the report to a file, even if asked to "save it" in passing — if the team wants a concern acted on, it becomes an experiment or a roadmap item through the roadmap's own process.

## Decisions that shape this skill (do not re-litigate)

- 2.0 strategy (2026-09-18): the `better` plugin hosts updated versions of all core commands; `better:implement` = `tasks` + `implement` + `verify`. Gaps of those three core commands are owned by `better:implement`. Whether hire gets a better version is the open hire decision.
- No gap registry: the team moves toward 2.0 through experiments, not by patching gaps, to avoid spreading thin. This skill reports concerns; it does not maintain a list the roadmap must close.
- "Nothing measures the outcome" is not a concern for this report: its scope is path gaps and the method is not a metrics tool. Mention it as a caveat in the recap if a reviewer raises it.
- The legacy `context/product/roadmap.md` read stays (graceful shutdown, no sunset); it is listed so the decision sits next to its cost, not to reopen it.
- Coexistence of core and `better` commands during the transition is decided, not a gap.
