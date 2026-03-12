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

- **Creation Mode**: The agent works through the architecture template section by section, proposing concrete technologies with justifications and alternatives for each area (application stack, data layer, infrastructure, etc.). You confirm or change each decision before moving on.
- **Update Mode**: The agent presents the current architecture, asks what you'd like to change, and proposes specific modifications. It checks for consistency — flagging conflicts with existing decisions or potential impacts.

After saving, the agent reviews your tech stack against available specialist agents and presents a coverage table showing what's covered and what's missing. If gaps exist, it recommends running `/awos:hire`.

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
