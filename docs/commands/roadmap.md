# /awos:roadmap

> Builds the Product Roadmap — features and their order.

## What it does

This command creates (or updates) your product roadmap — an ordered list of features grouped into logical, sequential phases. It produces:

- `context/product/roadmap.md`

## Prerequisites

- `context/product/product-definition.md` must exist. Run `/awos:product` first.

## How it works

- **Creation Mode**: The agent reads your product definition, analyzes the core features, and proposes a draft roadmap organized into phases. You then refine it interactively — reorder features, add new ones, move items between phases.
- **Update Mode**: The agent presents your current roadmap and lets you make changes — mark items complete, move items, add or remove features. It enforces logical dependencies (e.g., it will question placing "reporting" before "data entry").

## Key behaviors

- **Business-focused.** Roadmap items are features described from a user/business perspective, not technical tasks.
- **Living document.** Priorities shift and plans change — update your roadmap regularly to reflect current reality.
- **Each item = one spec.** Roadmap items should be scoped so that each one can be described in a single functional specification.
- **Template adherence.** The agent preserves the markdown structure and formatting from the original template across all updates.

## Common misconceptions

- **"I should list technical tasks."** No. Roadmap items are features like "User profile management" or "Payment processing", not "Set up PostgreSQL" or "Configure CI/CD pipeline".
- **"Sprints and task IDs belong here."** The roadmap is a strategic document. Sprint planning and task tracking happen at the `/awos:tasks` level.
- **"The roadmap is set in stone."** It's meant to evolve. Re-run this command whenever priorities change.

## Example usage

```bash
# Good — business-level features:
> /awos:roadmap Phase 1: Photo upload, Phase 2: Face detection, Phase 3: Social sharing

# Bad — too granular and technical:
> /awos:roadmap Sprint 1 Task #42: Implement YOLO v8 model inference endpoint
```

## What happens next

Run `/awos:architecture` to define the technology stack.
