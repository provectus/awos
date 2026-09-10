# /awos:architecture

> Defines the System Architecture — stack, DBs, infra.

## What it does

This command creates (or updates) your system architecture document — the technical blueprint that all agents follow when implementing features. It produces:

- `context/product/architecture.md`

## Prerequisites

- `context/product/product-definition.md` must exist.
- `context/sources/sources.md` (optional) — when a configured external-sources file exists, the agent also retrieves documentation context from those sources.

Run `/awos:product` first.

## How it works

- **Creation Mode**: The agent starts by exploring your codebase with a focused `Explore` pass — every Creation Mode run, on every project. Any existing technology stack it finds (languages, frameworks, databases, infrastructure) becomes the default for the matching architecture decisions, each backed by file-path citations; on a repository with no source code the pass simply finds nothing and the draft comes from your product definition and best-practice defaults. The agent then drafts every architectural area in one pass — proposing concrete technologies with justifications and alternatives for each area (application stack, data layer, infrastructure, etc.) — and saves `architecture.md` without waiting for approval. You then review the saved document: choices seeded from the codebase are called out with their evidence, assumption-based ones are labeled, and you adjust anything you'd change.
- **Update Mode**: The agent presents the current architecture, asks what you'd like to change, and proposes specific modifications. It checks for consistency — flagging conflicts with existing decisions or potential impacts.

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

Run `/awos:spec` to write the functional spec for your first feature.
