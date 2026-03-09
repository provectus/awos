# /awos:product

> Defines the Product — what, why, and for who.

## What it does

This command creates (or updates) your high-level product definition — the single source of truth for your entire project. It produces two files:

- `context/product/product-definition.md` — the full definition covering vision, audience, personas, success metrics, core features, and boundaries.
- `context/product/product-definition-lite.md` — a one-page summary with the project name, vision, target audience, and core features.

## Prerequisites

None. This is the first command you run.

## How it works

The command operates in two modes:

- **Creation Mode** (no existing definition): Walks you through each section of the product definition template interactively — project name and vision, target audience and personas, success metrics, core features and user journey, and project boundaries (in-scope vs. out-of-scope).
- **Update Mode** (definition already exists): Presents a menu of sections from your existing definition and lets you update specific parts without redoing the entire document.

## Key behaviors

- **Non-technical language only.** This document describes business goals, user needs, and value — not implementation details. The agent will steer you away from technical language.
- **Two outputs, always.** Both the full definition and the lite summary are created/updated together.
- **Idempotent.** You can re-run this command at any time to refine your product definition as your understanding evolves.

## Common misconceptions

- **"I should describe the tech stack here."** No. Product definition is strictly non-technical. Technology decisions belong in `/awos:architecture`.
- **"I only run this once."** You should revisit and update your product definition as requirements evolve. The Update Mode makes this easy.
- **"I need a detailed spec."** Keep it high-level. This is the 10,000-foot view — features, vision, and audience. Details come later in `/awos:spec`.

## Example usage

```bash
# Good — describes what, why, and who:
> /awos:product Build a photo editing app that adds beer and smiles to user photos using AI. Users want to create fun party photos to share on social media.

# Bad — too technical for product definition:
> /awos:product Build an ML pipeline with TensorFlow for facial landmark detection and image compositing with alpha blending.
```

## What happens next

Run `/awos:roadmap` to plan the features and their order.
