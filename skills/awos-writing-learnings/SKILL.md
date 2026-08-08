---
name: awos-writing-learnings
description: >-
  Record learnings in context/learnings.md — the admission gate that decides
  what qualifies, the entry format, and where entries land. Use when a command
  has finished an interview or a triage and needs to keep what the conversation
  revealed about the product, or when the user asks to remember something.
---

# Writing learnings

A **learning** is something now known about this product that was not known before, and that changes what someone would build. `context/learnings.md` holds them so the next command starts warm instead of asking the user to explain the product again.

Learnings live alongside the artifacts, not inside them. Artifacts specify; learnings explain. Where the two disagree, the artifact is right and the learning is stale.

## The gate

Both conditions have to hold. The first is about where the information already lives, the second about whether it does any work.

**1. It has no lookup.** The code is a lookup. The specs, the roadmap, the product definition and the architecture doc are lookups. Git history is a lookup. What has no lookup anywhere: the reason behind a choice, the alternative that was rejected, the constraint that came out of a customer conversation, the word the business uses for a thing.

**2. It changes something.** Name what it constrains — the decision that would go differently, the question it stops someone re-asking, the mistake it prevents. Information nobody would act on differently is trivia, even when nobody wrote it down.

**Discussed is not decided.** A topic that came up, was explored, and remains open produced no learning — coverage is not knowledge. What qualifies is the resolved claim, not the fact that the ground was walked over.

**Zero learnings is a normal outcome.** A conversation that revealed nothing durable produces no entries. Manufacturing one to have written something is the failure this gate exists to prevent.

## Where to look

The gate decides what passes; these are the moments worth checking, because a learning rarely announces itself:

1. **A why was given.** The user explained a reason, a constraint, or a piece of history behind something. Reasons are the highest-value class here — nothing else records them.
2. **An alternative was rejected.** "We tried that" and "we deliberately don't" both leave the codebase looking like an accident later.
3. **A correction landed.** The user corrected an assumption of yours, or a finding you presented. What they replaced it with is a learning, and so is the fact that the obvious reading was wrong.
4. **A word was pinned down.** The business uses a term in a specific way, or two terms that sound alike mean different things.
5. **A boundary was named.** A limit, a rule, or a "never" — regulatory, contractual, or learned the hard way.

## The format

Claim, then what it changes, then where it came from:

```markdown
- **Invoices go out on the 1st; the date is not user-configurable.** Rules out per-customer billing dates in any scheduling feature — the provider batches on calendar months.
  _/awos:product interview · 2026-08-07_
```

The second half is the gate made mechanical: an entry whose consequence cannot be stated does not qualify, and you find that out while trying to write it. It pays again later — when the named consequence stops applying, the learning is visibly dead and can go without anyone re-deriving why it was ever there.

## Worked contrasts

Each pair is the same material, failing and passing.

**Findable elsewhere.**

- ❌ `- **The app uses PostgreSQL with a customers table keyed by UUID.**` — the schema answers this, and this copy will go stale while the schema does not.
- ✅ `- **Customer IDs are never reused after deletion.** Reporting can safely join historical rows to current customers; a "restore deleted account" feature would have to mint a new ID.` — a rule the schema permits but does not state.

**Unfindable but inconsequential.**

- ❌ `- **The founder prefers the word "workspace" over "team", mentioned in passing.**` — nothing is built differently.
- ✅ `- **Users call a billing group a "workspace"; "team" means something else — the people inside one.** UI copy and every user-facing label distinguish the two; using them interchangeably reads as a bug to customers.` — the same word, now with a consequence.

**Quote instead of claim.**

- ❌ `- **User said they'd probably want invoices monthly, maybe configurable later.**` — the reader still has to interpret, and cannot tell what was decided from what was mused.
- ✅ Resolve it first, then write the claim. If it genuinely was not decided, that is the learning: `- **Whether invoice dates become configurable is open — deferred, not rejected.** Anything built on a fixed date should keep the date in one place rather than assuming it everywhere.`

**Restating an artifact.**

- ❌ `- **The export feature produces CSV with one row per transaction.**` — that is the spec, and a second copy competes with it for authority.
- ✅ `- **CSV was chosen over XLSX because the customer's accountant imports into a legacy tool that rejects XLSX.** Revisit only if that tool changes; do not "upgrade" the format as an improvement.` — the reason the spec does not carry.

## Vocabulary

A term the business uses in its own way is its own kind of entry, and it earns a `## Vocabulary` section rather than a bullet with a consequence. Be opinionated: when several words circulate for one concept, pick the one this product uses and list the rest as words to avoid. That choice is what stops the vocabulary drifting apart again.

```markdown
**Workspace**:
A billing group — the unit a subscription and its invoices attach to.
_Avoid_: account, org, tenant

**Team**:
The people inside a workspace. Never a billing concept.
_Avoid_: group, members
```

Define what a term **is**, in a sentence or two — not what it does. Use the vocabulary's own terms inside other definitions. Where the wider industry uses a word loosely, say how it resolves here: "an invoice is always the issued document; the draft is a _statement_."

Vocabulary is **revised in place**, unlike everything else in this file. A definition that turns out to be wrong is corrected, not superseded — nobody needs the history of a word, they need its current meaning.

## Where entries go

`context/learnings.md`, under a `##` heading naming the subject — the area of the product the learning is about, not the command that produced it or the spec that will consume it. Specs are superseded; the subject outlives them.

Read the existing headings before writing. **Reuse a heading that already fits** rather than coining a near-synonym — three headings about the same area under three names is how the file stops being readable. Coin a new one when the material genuinely has no home.

Create the file with a short title line if it does not exist.

## Three more rules

**Supersede rather than overwrite.** When a new learning contradicts one already there, keep both: mark the old one superseded with the date. "We used to think X, then we learned Y" is itself worth knowing, and silently swapping the text destroys the reason the current answer is the current answer.

**Write nothing that should not be committed.** This file goes into the repository — reviewed, cloned, and in many cases public. Credentials, access details, customer names, personal data and unannounced commercial terms do not go in. The learning almost always survives the redaction: "the anchor customer requires SSO before renewal" carries the same consequence as naming them, and can be read by anyone.

**The first run of a project is allowed to be generous.** When `context/learnings.md` is being created, nobody can yet tell which detail will matter; the cost of keeping too much is one oversized file that gardening will trim, and the cost of dropping the user's original brief is permanent. Once there is a store to compare against, the gate above applies in full.

## Done when

Every claim the conversation established that passes both conditions is either written down or already carried by an artifact — and every entry written carries a stated consequence and a source.
