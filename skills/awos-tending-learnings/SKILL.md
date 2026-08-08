---
name: awos-tending-learnings
description: >-
  Tend context/product/learnings.md and context/product/glossary.md — merge
  duplicates, retire dead entries, surface contradictions, hold the size
  budget. Use at the end of a feature cycle, or when the files have grown
  hard to read.
---

# Tending learnings

Capture appends. Nothing removes. Left alone, these files fill with stale layers until an agent must dig through them to find what is still true — and a store nobody trusts is worse than no store, because agents read it anyway.

This pass is the only thing that removes. It runs with every entry in view, which is what makes the judgement possible.

**Never invent.** A fact that is not already in a file, or in the artifacts you are comparing against, does not enter here. Capture writes; tending only merges, rewrites, retires and moves. When those two rules hold, every fault is traceable: a wrong fact came from capture, a lost fact came from tending.

## Read first

- `context/product/learnings.md` and `context/product/glossary.md`
- `context/product/learnings/*.md`, if that directory exists
- The artifacts: `context/product/product-definition.md`, `roadmap.md`, `architecture.md`, and the specs under `context/spec/`

You cannot judge a learning without the artifact it might now duplicate.

## The passes

Run all five.

**1. Absorbed.** An artifact now states what a learning states. Delete the learning. The reason behind the decision stays — that is what no artifact carries. Example: a learning describing how export works, once the spec describes it; the sentence explaining _why_ CSV was chosen stays.

**2. Dead.** The consequence an entry names no longer applies — the feature was cut, the constraint lifted, the integration dropped. Delete it. This is what the consequence half of the format is for: you can see the entry is dead without reconstructing why it was written.

**3. Duplicated.** Two entries state the same fact. Merge into the stronger one — the version with the sharper consequence. Two `##` headings covering one subject merge the same way, under the better name.

**4. Contradicted.** Two entries disagree, or an entry disagrees with an artifact. Do not resolve this alone. Ask the user with `AskUserQuestion`, giving each version and where it came from; then keep the answer and mark the other superseded with today's date. An entry that contradicts an artifact is stale by default — but confirm, because sometimes the artifact is the thing that is wrong.

**5. Over budget.** See below.

## The budget

- No file over **200 lines**.
- No `##` section over **50 lines**.

The budget is the only thing that forces a removal, so treat it as a hard bound rather than a suggestion. Passes 1–3 usually clear it on their own.

When a section is still over 50 lines and every entry in it is live, do not trim good knowledge to fit. Move the section to its own file:

`context/product/learnings/<subject>.md`

```yaml
---
subject: billing
description: Plans, proration, dunning, invoice vocabulary. Read when the work touches pricing, payments, subscriptions or invoices.
updated: 2026-08-08
---
```

Then remove the section from `learnings.md`. The `description` states when the file is worth reading; commands use it to decide what to load, so write it as a condition, not a summary.

## The glossary

Different rules, because a definition has no history worth keeping.

- A term the product no longer uses is deleted, not superseded.
- Two definitions of one concept merge into one, and the losing word moves to `_Avoid_`.
- A definition that contradicts current use is corrected in place.
- A term that appears in the artifacts with a specific meaning but is missing here is a gap — mention it to the user rather than writing a definition yourself. Inventing a definition is exactly the invention this pass forbids.

## Report

Tell the user what changed: how many entries were absorbed, retired, merged; which contradictions they resolved; which sections graduated to their own files. A silent pass over a knowledge store is not reviewable, and the git diff is the review.

## Done when

Both budgets hold, no two entries state the same fact, every contradiction is either resolved by the user or recorded as superseded, and every remaining entry still names a consequence that applies.
