---
name: awos-writing-domain
description: >-
  Write and maintain context/product/domain.md — how the product works, part by
  part — and context/product/glossary.md. Use after an interview, a triage, or a
  verified feature, or when the user asks to record something about the product.
---

# Writing the domain description

`context/product/domain.md` describes **how this product works**: what it is made of, what each part does, the business rules that govern it, and how the parts fit together. Someone who reads it should be able to reason about the product without asking anyone.

It is written once and maintained forever. It is never regenerated from scratch, because it is the one document that accumulates understanding instead of being replaced by the next run.

## Where it sits

| Document                | Answers                                   |
| ----------------------- | ----------------------------------------- |
| `product-definition.md` | What are we building, for whom, and why   |
| **`domain.md`**         | **How does it work**                      |
| `architecture.md`       | How is it built                           |
| `context/spec/…`        | What one feature does, in testable detail |

The vision level and the technical level both had a home. The business-logic level did not — so it lived in people's heads and got re-explained at every spec.

Keep to that lane. `domain.md` carries business logic, not implementation: no schemas, no endpoints, no file paths, no class names. If a sentence only makes sense to someone who has read the code, it belongs in `architecture.md` or nowhere.

## Shape

One `##` section per part of the product — a capability, an area, a concept that behaves in its own way. Sections are discovered from the product, not chosen from a list.

```markdown
# How <Product> Works

<A paragraph: what the product does, and the shape of it — the two or three
parts everything else hangs off.>

## Billing

Customers subscribe to a plan, and every workspace is billed as one unit.
An invoice covers a calendar month and is issued on the 1st.

**Rules**

- A workspace always has exactly one plan. Downgrades take effect at the next
  invoice; upgrades take effect immediately and are prorated.
- A failed payment retries three times over ten days, then the workspace
  becomes read-only rather than being deleted.

**Connects to**

- **Access** — a read-only workspace still allows sign-in and export, so a
  customer can always retrieve their data.

**Decided**

- Invoice dates are not user-configurable. The provider batches on calendar
  months, so per-customer dates would mean reconciling every invoice by hand.
- Considered and rejected: usage-based pricing. Customers said they needed a
  predictable number for their own budgeting.
```

`Rules`, `Connects to` and `Decided` earn their place when there is something to put in them — a section that is one honest paragraph is finished. Never write a heading with nothing under it.

**`Decided` is the part nothing else records.** Code shows what was built, never what was rejected or why. Without it, a deliberate choice reads as an accident and someone "fixes" it.

## The bar

The document answers one question: **how does this product work?** Content that does not serve that question does not go in.

Two things it is not:

- **Not a log of the conversation.** Nobody needs to know that a topic was discussed. Write the resolved understanding, in the present tense, as a description of the product. An open question is only worth recording when something must be built around the uncertainty — and then it is written as that constraint, not as a quote.
- **Not a copy of another document.** The code, the specs, the roadmap and the architecture document are all lookups; an agent reads them when it needs them. A second copy here goes stale while the original does not. What has no lookup anywhere: the rules, the reasons, and the connections between parts.

**Adding nothing is a normal result.** A conversation that revealed nothing about how the product works changes no section.

## Writing into it

Update the sections your conversation touched. Do not restructure the document — you are working mid-task with partial context, which is the worst position from which to reorganise. Wholesale review happens at the end of a feature cycle, with everything in view.

1. Read `domain.md` and `glossary.md` first. You are revising a description, not appending to a list.
2. For each part the conversation touched: refine what is already written where you now know better, and add what is missing. Prefer editing a sentence over adding a second one that says something similar.
3. Create a new `##` section only when the material genuinely describes a part that has none. Prefer an existing section over a near-synonym — three sections about one area is how the document stops being readable.
4. When something you write contradicts what is there, do not silently swap it. The description states current truth, so correct it — but if the contradiction looks like it matters (a rule that changed, a decision reversed), say so in your report so the user can confirm.

Where the product is new and the document does not exist, write the opening paragraph and whatever sections the conversation supports. Be generous on the first pass: nobody can yet tell which part matters, and the user's opening description is the richest input the project will ever get.

## Reviewing it

At the end of a feature cycle, or when asked, check the description against reality.

- **Drifted.** A section describes behaviour that is no longer true. Correct it.
- **Absorbed.** A section restates what an artifact now says. Cut it back to the rules and reasons the artifact does not carry.
- **Missing.** A part of the product has no section, or a section has no `Decided` where a real choice was made. Fill it from what you can see; ask the user where you cannot.
- **Oversized.** No section over 50 lines, no file over 300. Tighten first. If a section is still over and everything in it is live, move it to `context/product/domain/<part>.md` with frontmatter, and leave a one-line pointer behind:

  ```yaml
  ---
  part: billing
  description: Plans, proration, dunning, invoicing. Read when the work touches pricing, payments or subscriptions.
  ---
  ```

Do not invent. Everything written here comes from the conversation, the artifacts, or the code — never from what would plausibly be true.

## The glossary

`context/product/glossary.md` is the project's shared language. Every artifact uses its terms, and so does `domain.md`.

```markdown
**Workspace**:
A billing group — the unit a subscription and its invoices attach to.
_Avoid_: account, org, tenant

**Team**:
The people inside a workspace. Never a billing concept.
_Avoid_: group, members
```

Be opinionated. When several words circulate for one concept, pick the one this product uses and list the rest under `_Avoid_`. That list is what stops the vocabulary drifting apart again.

Define what a term **is**, not what it does. Where the industry uses a word loosely, give the local meaning. Correct a definition in place — nobody needs the history of a word.

## Always

**Write nothing that must not be committed.** These files go into the repository, often a public one. Keep out credentials, customer names, personal data and unannounced commercial terms. The point almost always survives: "the anchor customer requires SSO before renewal" carries the same consequence as the name.

## Done when

Every part of the product the conversation touched is described accurately and in the product's own vocabulary, every deliberate choice it revealed is under a `Decided` heading with its reason, and nothing in the document restates what an artifact already says.
