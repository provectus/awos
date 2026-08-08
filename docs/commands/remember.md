# /awos:remember

> Records something worth keeping about the product into the project's learnings.

## What it does

Writes what you tell it into your project's knowledge files:

- `context/product/learnings.md` — facts about the product that change what gets built.
- `context/product/glossary.md` — the words your business uses, and what each one means here.

The other commands record automatically as they go. This one exists for the things that surface outside them — in a meeting, in a code review, halfway through a debugging session.

## Prerequisites

None, though it is most useful once `/awos:product` has run and there is a store to add to.

## How it works

Pass what you want kept, or run it bare and it takes the material from the conversation so far.

Whatever the source, it goes through the same admission test the automatic capture uses. Something qualifies when it is not already recorded anywhere — not in the code, the specs, or git history — **and** it changes a decision someone would otherwise make differently.

## Key behaviors

- **Asking does not exempt it.** If what you pass fails the test, it is not written. You are told which half it failed and offered a version that passes — usually there is one, because a preference becomes a learning as soon as you say what it rules out.
- **Nothing is a valid outcome.** Run bare after a conversation that established nothing durable and it records nothing rather than manufacturing an entry.
- **Everything is committed.** These files live in your repository. Credentials, customer names and personal data stay out; the learning almost always survives without them.

## Common misconceptions

- **"This is a notepad."** It is not. Anything a later agent could find by reading the code or the specs is deliberately rejected — a second copy only goes stale.
- **"I should record what we built."** The code and the spec already say that. Record why it was built that way, and what was rejected.

## Example usage

```bash
# Good — a fact with a consequence:
> /awos:remember Invoices always go out on the 1st. The provider batches on calendar months, so per-customer billing dates are out.

# Good — a word the business uses in its own way:
> /awos:remember A "workspace" is the billing group; a "team" is the people inside one. Never use them interchangeably in UI copy.

# Rejected — no consequence:
> /awos:remember The founder likes dark mode.
```

## What happens next

Nothing to run. The next `/awos:spec`, `/awos:tech` or `/awos:roadmap` reads it before asking you anything.
