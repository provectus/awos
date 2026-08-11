# /awos:architecture

> Defines the System Architecture — stack, DBs, infra.

## What it does

This command creates (or updates) your system architecture document — the technical blueprint that all agents follow when implementing features. It produces:

- `context/product/architecture.md`

## Prerequisites

- `context/product/product-definition.md` must exist.
- `context/product/roadmap.md` must exist.

Run `/awos:product` and `/awos:roadmap` first.

## How it works

- **Creation Mode**: The agent drafts every architectural area in one pass — proposing concrete technologies with justifications and alternatives for each area (application stack, data layer, infrastructure, etc.) — and saves `architecture.md` without waiting for approval. You then review the saved document and adjust anything you'd change.
- **Update Mode**: The agent presents the current architecture, asks what you'd like to change, and proposes specific modifications. It checks for consistency — flagging conflicts with existing decisions or potential impacts.

After saving, the agent reviews your tech stack against available specialist agents and presents a coverage table showing what's covered and what's missing. If gaps exist, it recommends running `/awos:hire`.

## Brownfield mode

If `/awos:product` detected an existing codebase (leaving a `context/product/brownfield.md`), this command discovers the **existing tech stack** via a focused `Explore` pass and uses those findings as the **defaults** for the architecture decisions they cover (brownfield-seeded defaults are triaged with you after the document is saved; where no finding exists, it falls back to a best-practice default labeled as an assumption). It then cleans up the brownfield scaffolding — deleting `brownfield.md` and removing `context/sources/` unless durable source config is worth keeping. See the [Brownfield Adoption Guide](../brownfield-adoption.md) for the artifact lifecycle and secret-handling guidance.

## Common misconceptions

- **"I should describe features here."** No. Architecture is about technology decisions — frameworks, databases, cloud services, infrastructure. Features belong in `/awos:spec`.
- **"I need to know everything upfront."** Start with what you know. You can always re-run this command as your understanding deepens.
- **"This is only for the initial setup."** Architecture evolves. When you make significant technical decisions during development, update this document.

## Example usage

```bash
# Good — describes technology choices:
> /awos:architecture React frontend, Python Flask backend with OpenCV, AWS S3 for image storage, Lambda for processing

# Bad — describes features, not architecture:
> /awos:architecture Users can upload photos and see beer added to their pictures.
```

## What happens next

Run `/awos:hire` to set up specialist agents for your tech stack.
