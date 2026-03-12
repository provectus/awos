# /awos:tech

> Creates the Technical Spec — how the feature will be built.

## What it does

This command creates the technical specification — the engineering plan that translates functional requirements into a concrete implementation approach. It produces:

- `context/spec/[index]-[name]/technical-considerations.md`

## Prerequisites

- `context/product/architecture.md` must exist.
- A `functional-spec.md` must exist in the target spec directory.

## How it works

1. **Identifies the target spec**: Uses your prompt to find the right spec directory, or asks you to choose from available specs.
2. **Gathers context**: Reads the functional spec, architecture document, and analyzes the existing codebase. If specialist subagents are available (e.g., `python-expert`, `react-expert`), it delegates codebase analysis to them.
3. **Interactive drafting**: Works through the template section by section — high-level approach, detailed system changes, API contracts, data models, risks. For each decision, it proposes an assumption and asks you to confirm.
4. **Checks for new capabilities**: After saving, reviews whether the spec introduces technologies not covered by your current agents. If so, generates a pre-filled `/awos:hire` command.

## Key behaviors

- **Structures and contracts, not full implementations.** Describes table schemas (key columns and relationships), API endpoints (methods and payload shapes), and file responsibilities — not complete code.
- **"Assume but verify."** The agent proposes specific technical decisions as assumptions and asks for your approval before proceeding. Nothing is silently assumed.
- **Delegates codebase analysis.** If specialist agents exist for your tech stack, the command uses them to analyze existing patterns and conventions.
- **Risk identification.** Proactively flags potential issues (performance, security, migration risks) and proposes mitigations.

## Common misconceptions

- **"I should describe user outcomes here."** No. User outcomes belong in the functional spec. This document is about the "how" — data models, APIs, system components, and their interactions.
- **"It should contain full implementation code."** The tech spec is a blueprint, not the implementation. It describes structures and contracts at a level of detail that's reviewable and won't go stale immediately.
- **"I can skip this and go straight to tasks."** The tech spec is what enables `/awos:tasks` to create properly scoped, vertical slices. Without it, tasks will be vague or poorly structured.

## Example usage

```bash
# Good — specify technical approach:
> /awos:tech Use OpenCV's Haar Cascade for face detection, overlay PNG assets at detected coordinates, return processed image via presigned S3 URL

# Good — let it pick the latest spec:
> /awos:tech

# Bad — describes outcome, not technical approach:
> /awos:tech Make the photo upload smooth and fast for users.
```

## What happens next

Run `/awos:tasks` to break the technical plan into an actionable task list. If the agent flagged new technologies, run the suggested `/awos:hire` command first.
