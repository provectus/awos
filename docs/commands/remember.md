# /awos:remember

> Records how part of the product works into the project's domain description.

## What it does

Folds what you tell it into your project's description of how the product works:

- `context/product/domain.md` — the product part by part: what each does, the rules that govern it, how the parts connect, and what was deliberately decided.
- `context/product/glossary.md` — the words your business uses, and what each one means here.

The other commands maintain these as they go. This one exists for what surfaces outside them — in a meeting, in a code review, halfway through a debugging session.

## Prerequisites

None, though it is most useful once `/awos:product` has run and there is a description to add to.

## How it works

Pass what you want recorded, or run it bare and it takes the material from the conversation so far. Either way it updates the section that material belongs to, or opens a new one if the description does not cover that part of the product yet.

## Key behaviors

- **It is a description, not a notepad.** Everything is written in the present tense, as a statement about how the product works. Anything a later agent could find by reading the code or the specs is deliberately left out — a second copy only goes stale.
- **Asking does not exempt it.** If what you pass says nothing about how the product works, it is not written. You are told why and offered a version that would fit — usually there is one, because a bare preference becomes a rule as soon as you say what it governs.
- **Changing nothing is a valid outcome.** Run bare after a conversation that established nothing and it leaves the description alone rather than padding it.
- **Everything is committed.** These files live in your repository. Credentials, customer names and personal data stay out; the point almost always survives without them.

## Common misconceptions

- **"I should record what we built."** The code and the spec already say that. Record the rules around it, how it connects to the rest of the product, and what was rejected — none of which the code shows.
- **"It logs the conversation."** It does not. Nobody needs to know a topic came up; the description carries the resolved understanding.

## Example usage

```bash
# Good — a rule that governs a part of the product:
> /awos:remember A failed payment retries three times over ten days, then the workspace goes read-only rather than being deleted — customers must always be able to export their data.

# Good — a deliberate choice and why:
> /awos:remember We rejected usage-based pricing. Customers said they needed a predictable number for their own budgeting.

# Good — a word the business uses in its own way:
> /awos:remember A "workspace" is the billing group; a "team" is the people inside one. Never use them interchangeably in UI copy.

# Not recorded — says nothing about how the product works:
> /awos:remember The founder likes dark mode.
```

## What happens next

Nothing to run. The next `/awos:spec`, `/awos:tech` or `/awos:roadmap` reads it before asking you anything.
