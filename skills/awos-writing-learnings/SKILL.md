---
name: awos-writing-learnings
description: >-
  Record what a conversation revealed about the product, in context/product/learnings.md
  and context/product/glossary.md. Use after an interview or a triage, or when the user
  asks to remember something.
---

# Writing learnings

A **learning** is a fact about this product that changes what someone builds. Later commands read these files before they interview the user.

Artifacts specify; learnings explain. When the two disagree, the artifact is correct and the learning is stale.

## Two files

| File                           | Holds                              | Lifecycle                                              |
| ------------------------------ | ---------------------------------- | ------------------------------------------------------ |
| `context/product/glossary.md`  | What each business word means here | Corrected in place — only the current meaning matters  |
| `context/product/learnings.md` | Everything else worth keeping      | Appended; an outdated entry is superseded, not deleted |

The glossary is the project's shared language. Every artifact — specs, roadmap, product definition — uses its terms. Learnings inform what gets built; the glossary fixes the words used to describe it.

## The gate

Both conditions must hold, for both files.

**1. It has no lookup.** The code, the specs, the roadmap, the product definition, the architecture document and the git history are lookups — an agent reads them when it needs them. Reasons, rejected alternatives, constraints from a customer conversation and business vocabulary have no lookup.

**2. It changes a decision.** Name what it constrains: the decision that goes differently, the question it stops, the mistake it prevents. Unfindable trivia is still trivia.

**An open topic is not a learning.** Record the resolved claim, not the fact that you discussed the subject.

**Zero learnings is a normal result.** Do not invent an entry to fill a file.

## Where to look

A learning rarely announces itself. Check these five moments:

1. **A reason was given.** Nothing else in the project records reasons.
2. **An alternative was rejected.** "We tried that" and "we do not do that on purpose" both make the code look accidental later.
3. **A correction landed.** The user corrected an assumption of yours or a finding you presented.
4. **A word was pinned down.** A term has a specific meaning here, or two similar terms differ. → glossary.
5. **A boundary was named.** A limit, a rule, or a never.

## The glossary

```markdown
**Workspace**:
A billing group — the unit a subscription and its invoices attach to.
_Avoid_: account, org, tenant

**Team**:
The people inside a workspace. Never a billing concept.
_Avoid_: group, members
```

Be opinionated. When several words circulate for one concept, pick the word this product uses and list the rest under `_Avoid_`. That list is what stops the vocabulary drifting apart again.

Define what a term **is**, not what it does. Where the industry uses a word loosely, give the local meaning. Group terms under `##` headings once a cluster forms.

## Learnings

A claim, what it changes, and the source:

```markdown
- **Invoices go out on the 1st; the date is not user-configurable.** Rules out per-customer billing dates in any scheduling feature — the provider batches on calendar months.
  _/awos:product interview · 2026-08-07_
```

If you cannot write the middle part, the entry does not qualify. Later, when that consequence stops applying, the entry is visibly dead and can be removed.

Entries sit under a `##` heading that names the subject — the part of the product, not the command that wrote it or the spec that reads it. Three headings for one subject make the file unreadable, so prefer an existing heading over a near-synonym.

### Entries that fail

Each pair is the same material, rejected and accepted.

**Findable in the code.**

- ❌ `- **The app uses PostgreSQL with a customers table keyed by UUID.**` — the schema says this, and this copy goes stale.
- ✅ `- **Customer IDs are never reused after deletion.** Reporting can join historical rows to current customers; a "restore deleted account" feature must mint a new ID.` — a rule the schema permits but does not state.

**Findable in an artifact.**

- ❌ `- **The export feature produces CSV with one row per transaction.**` — that is the spec, and a second copy competes with it.
- ✅ `- **CSV was chosen over XLSX because the customer's accountant uses a legacy tool that rejects XLSX.** Do not "upgrade" the format.` — the reason the spec does not carry.

**No consequence.**

- ❌ `- **The founder prefers the word "workspace" over "team".**` — nothing is built differently.
- ✅ A definition in the glossary, where the distinction constrains every label the user sees.

**A quote, not a claim.**

- ❌ `- **User said they'd probably want invoices monthly, maybe configurable later.**` — the reader must still interpret this.
- ✅ Resolve it first. If it stays open, that is the learning: `- **Whether invoice dates become configurable is deferred, not rejected.** Keep the date in one place.`

## Rules

**Supersede, do not overwrite.** When a new learning contradicts an old one, keep both and mark the old one superseded with the date. "We used to think X, then we learned Y" explains why the current answer is current. Glossary definitions are the exception: correct them in place, because nobody needs the history of a word.

**Write nothing that must not be committed.** These files go into the repository, often a public one. Keep out credentials, customer names, personal data and unannounced commercial terms. The learning usually survives: "the anchor customer requires SSO before renewal" carries the same consequence as the name.

**Be generous on the first run.** While the files are new, nobody can tell which detail matters. Too much costs one large file; too little loses the user's brief permanently. Apply the gate in full once there is something to compare against.

## Done when

Every resolved claim from the conversation that passes both conditions is written down or already carried by an artifact, every learning has a consequence and a source, and every business term the conversation pinned down is in the glossary.
